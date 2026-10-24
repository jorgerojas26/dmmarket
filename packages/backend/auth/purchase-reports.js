const express = require("express");
const { parameters } = require("./sales-reports");
const { reportId } = require("../utils/report-identity");

function fail(status) {
  const error = new Error("La consulta de compras no está permitida.");
  error.status = status;
  throw error;
}

function options(input) {
  if (Object.hasOwn(input, "groupId") && Object.hasOwn(input, "categoryId")) fail(400);
  const query = { ...input };
  if (Object.hasOwn(query, "groupId")) {
    query.categoryId = query.groupId;
    delete query.groupId;
  }
  return parameters(query, {
    keys: ["from", "to", "proveedorId", "categoryId", "page", "limit", "sortBy", "sortDir", "search"],
  });
}

async function purchases(transaction, access, query, products) {
  if (!access.hasGlobal("purchases.read")) fail(403);
  const costs = access.hasGlobal("purchases.costs");
  const providers = access.hasGlobal("providers.read");
  if (query.proveedorId && !providers) fail(403);
  const sortBy = query.sortBy || (products ? "product" : "fecha");
  if (["monto", "avgUnitCost"].includes(sortBy) && !costs) fail(403);
  if (sortBy === "proveedor" && !providers) fail(403);
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
  const provider = providers
    ? transaction.raw(
        "COALESCE(NULLIF(v.Empresa, ''), NULLIF(mc.Nombre, ''), CONCAT('Proveedor no registrado (', COALESCE(mc.IdProveedor, 'sin ID'), ')'))",
      )
    : null;
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

function createPurchaseReports({ sessions }) {
  const router = express.Router();
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
