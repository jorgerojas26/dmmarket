const express = require("express");
const { parameters } = require("./sales-reports");
const { reportId } = require("../utils/report-identity");
const { classify } = require("./pareto-reports");

function fail(status) {
  const error = new Error("La consulta de compras no está permitida.");
  error.status = status;
  throw error;
}

function options(input, { listing = true, compare = false } = {}) {
  if (Object.hasOwn(input, "groupId") && Object.hasOwn(input, "categoryId")) fail(400);
  const query = { ...input };
  if (Object.hasOwn(query, "groupId")) {
    query.categoryId = query.groupId;
    delete query.groupId;
  }
  return parameters(query, {
    compare,
    keys: [
      "from",
      "to",
      "proveedorId",
      "categoryId",
      ...(listing ? ["page", "limit", "sortBy", "sortDir", "search"] : []),
    ],
  });
}

function purchaseBase(transaction, access, query, products) {
  if (!access.hasGlobal("purchases.read")) fail(403);
  const costs = access.hasGlobal("purchases.costs");
  const providers = access.hasGlobal("providers.read");
  if (query.proveedorId && !providers) fail(403);
  const base = transaction("mastercomp as mc")
    .leftJoin("slavecomp as sc", function () {
      this.on(transaction.raw("BINARY sc.IdFactura = BINARY mc.IdFactura"));
    })
    .leftJoin("productos as p", function () {
      this.on(transaction.raw("BINARY p.IdProducto = BINARY sc.IdProducto"));
    })
    .where("mc.Anulada", 0)
    .whereBetween("mc.Fecha", [query.from, query.to]);
  if (providers)
    base.leftJoin("proveedores as v", function () {
      this.on(transaction.raw("BINARY v.IdProveedor = BINARY mc.IdProveedor"));
    });
  if (products) base.whereNotNull("sc.IdFactura");
  if (query.categoryId) base.whereRaw("BINARY p.Grupo = ?", [query.categoryId]);
  if (query.proveedorId) base.whereRaw("BINARY mc.IdProveedor = ?", [query.proveedorId]);
  if (query.search)
    base.where(function () {
      if (products)
        this.where("p.Descripcion", "like", `%${query.search}%`)
          .orWhere("sc.Descripcion", "like", `%${query.search}%`)
          .orWhere("sc.IdProducto", "like", `%${query.search}%`);
      else {
        this.where("mc.IdFactura", "like", `%${query.search}%`);
        if (providers)
          this.orWhere("v.Empresa", "like", `%${query.search}%`).orWhere("mc.Nombre", "like", `%${query.search}%`);
      }
    });
  return { base, costs, providers };
}

function metrics(transaction) {
  const quantity = transaction.raw(
    "CASE WHEN COUNT(sc.IdFactura) = COUNT(sc.Cantidad) THEN ROUND(COALESCE(SUM(sc.Cantidad), 0), 3) END",
  );
  const amount = transaction.raw(
    "CASE WHEN COUNT(sc.IdFactura) = COUNT(sc.Precio * sc.Cantidad) THEN ROUND(COALESCE(SUM(sc.Precio * sc.Cantidad), 0), 2) END",
  );
  const average = transaction.raw(
    "CASE WHEN COUNT(sc.IdFactura) = COUNT(sc.Precio * sc.Cantidad) AND COUNT(sc.IdFactura) = COUNT(sc.Cantidad) THEN ROUND(SUM(sc.Precio * sc.Cantidad) / NULLIF(SUM(sc.Cantidad), 0), 2) END",
  );
  const product = transaction.raw(
    "COALESCE(NULLIF(p.Descripcion, ''), MAX(NULLIF(sc.Descripcion, '')), CONCAT('Producto no registrado (', COALESCE(sc.IdProducto, 'sin ID'), ')'))",
  );
  const provider = transaction.raw(
    "COALESCE(NULLIF(v.Empresa, ''), NULLIF(mc.Nombre, ''), CONCAT('Proveedor no registrado (', COALESCE(mc.IdProveedor, 'sin ID'), ')'))",
  );
  return { quantity, amount, average, product, provider };
}

async function purchases(transaction, access, query, products) {
  const { base, costs, providers } = purchaseBase(transaction, access, query, products);
  const { quantity, amount, average, product, provider } = metrics(transaction);
  const sortBy = query.sortBy || (products ? "product" : "fecha");
  if (["monto", "avgUnitCost"].includes(sortBy) && !costs) fail(403);
  if (sortBy === "proveedor" && !providers) fail(403);
  const sort = products
    ? { product: "product", quantity: "quantity", ...(costs ? { monto: "monto", avgUnitCost: "avgUnitCost" } : {}) }
    : {
        numero: "mc.IdFactura",
        fecha: "mc.Fecha",
        unidades: "unidades",
        ...(costs ? { monto: "monto" } : {}),
        ...(providers ? { proveedor: "proveedor" } : {}),
      };
  if (!Object.hasOwn(sort, sortBy)) fail(400);
  const identity = products ? "sc.IdProducto" : "mc.IdFactura";
  const identities = base.clone().select({ identity }).groupByRaw("BINARY ??", [identity]);
  const [{ total }] = await transaction.from(identities.as("i")).count("* as total");
  const selected = products
    ? { productId: "sc.IdProducto", product, quantity, ...(costs ? { monto: amount, avgUnitCost: average } : {}) }
    : {
        invoiceId: "mc.IdFactura",
        fecha: transaction.raw("CAST(DATE_FORMAT(mc.Fecha, '%Y-%m-%d') AS CHAR)"),
        unidades: quantity,
        ...(costs ? { monto: amount } : {}),
        ...(providers ? { proveedorId: "mc.IdProveedor", proveedor: provider } : {}),
      };
  const rows = await base
    .clone()
    .select(selected)
    .groupByRaw("BINARY ??", [identity])
    .orderBy(sort[sortBy], query.sortDir)
    .orderBy(identity)
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  const totals = await base
    .clone()
    .select({ [products ? "quantity" : "unidades"]: quantity, ...(costs ? { monto: amount } : {}) })
    .first();
  return {
    data: products ? rows.map((row) => ({ ...row, productId: reportId(row.productId) })) : rows,
    pagination: { page: query.page, limit: query.limit, total: Number(total) },
    totals,
  };
}

async function purchaseKpis(transaction, access, query) {
  const { base, costs } = purchaseBase(transaction, access, query, false);
  const { quantity, amount, average } = metrics(transaction);
  const row = await base
    .select({
      totalInvoices: transaction.raw("COUNT(DISTINCT BINARY mc.IdFactura)"),
      totalQuantity: quantity,
      ...(costs
        ? {
            totalPurchased: amount,
            avgUnitCost: average,
            avgTicket: transaction.raw(
              "CASE WHEN COUNT(sc.IdFactura) = COUNT(sc.Precio * sc.Cantidad) THEN ROUND(SUM(COALESCE(sc.Precio * sc.Cantidad, 0)) / NULLIF(COUNT(DISTINCT BINARY mc.IdFactura), 0), 2) END",
            ),
          }
        : {}),
    })
    .first();
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? null : Number(value)]));
}

async function dashboard(transaction, access, query) {
  const { costs, providers } = purchaseBase(transaction, access, query, false);
  const current = await purchaseKpis(transaction, access, query);
  const previous = query.compareFrom
    ? await purchaseKpis(transaction, access, { ...query, from: query.compareFrom, to: query.compareTo })
    : null;
  const products = await purchases(
    transaction,
    access,
    { ...query, page: 1, limit: 30, sortBy: costs ? "monto" : "quantity", sortDir: "desc" },
    true,
  );
  const { quantity, amount } = metrics(transaction);
  let topProviders;
  if (providers) {
    const { base } = purchaseBase(transaction, access, query, false);
    topProviders = await base
      .select({
        id: "mc.IdProveedor",
        name: transaction.raw(
          "COALESCE(NULLIF(v.Empresa, ''), MAX(NULLIF(mc.Nombre, '')), CONCAT('Proveedor no registrado (', COALESCE(mc.IdProveedor, 'sin ID'), ')'))",
        ),
        quantity,
        invoiceCount: transaction.raw("COUNT(DISTINCT BINARY mc.IdFactura)"),
        ...(costs ? { totalPurchased: amount } : {}),
      })
      .groupByRaw("BINARY mc.IdProveedor")
      .orderBy(costs ? "totalPurchased" : "quantity", "desc")
      .orderBy("mc.IdProveedor")
      .limit(30);
  }
  const { base } = purchaseBase(transaction, access, query, true);
  const groups = await base
    .leftJoin("grupos as g", function () {
      this.on(transaction.raw("BINARY g.IdGrupo = BINARY p.Grupo"));
    })
    .select({
      groupId: "p.Grupo",
      categoria: transaction.raw(
        "COALESCE(NULLIF(g.Descripcion, ''), CONCAT('Grupo no registrado (', COALESCE(p.Grupo, 'sin ID'), ')'))",
      ),
      quantity,
      ...(costs ? { totalPurchased: amount } : {}),
    })
    .groupByRaw("BINARY p.Grupo")
    .orderBy("p.Grupo")
    .limit(501);
  if (groups.length > 500) fail(413);
  return {
    kpis: {
      ...current,
      compareQuantity: previous?.totalQuantity ?? null,
      compareInvoices: previous?.totalInvoices ?? null,
      ...(costs ? { comparePurchased: previous?.totalPurchased ?? null } : {}),
    },
    topProducts: products.data.map(({ monto, ...row }) => ({ ...row, ...(costs ? { totalPurchased: monto } : {}) })),
    ...(providers ? { bestProvider: topProviders[0] || null, topProviders } : {}),
    groupPurchasesChart: groups,
  };
}

async function pareto(transaction, access, query) {
  if (!access.hasGlobal("purchases.costs")) fail(403);
  const result = await purchases(
    transaction,
    access,
    { ...query, page: 1, limit: 5001, sortBy: "monto", sortDir: "desc" },
    true,
  );
  if (result.pagination.total > 5000) fail(413);
  return classify(
    result.data.map(({ monto, ...row }) => ({
      ...row,
      quantity: row.quantity == null ? null : Number(row.quantity),
      totalPurchased: monto == null ? null : Number(monto),
    })),
    "totalPurchased",
  );
}

function createPurchaseReports({ sessions }) {
  const router = express.Router();
  for (const [path, work, compare] of [
    ["/purchases/dashboard", dashboard, true],
    ["/purchases/pareto", pareto, false],
  ])
    router.get(path, async (req, res, next) => {
      try {
        res.json(
          await sessions.withSession(req.sessionID, {}, ({ transaction, access }) =>
            work(transaction, access, options(req.query, { listing: false, compare })),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  for (const [path, products] of [
    ["/purchases/invoices", false],
    ["/purchases/products", true],
  ])
    router.get(path, async (req, res, next) => {
      try {
        res.json(
          await sessions.withSession(req.sessionID, {}, ({ transaction, access }) =>
            purchases(transaction, access, options(req.query), products),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  return router;
}

module.exports = { createPurchaseReports };
