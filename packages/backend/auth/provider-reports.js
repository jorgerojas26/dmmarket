const { providerList } = require("./provider-list");
const express = require("express");
const { parties, best } = require("./provider-aggregates");
const { parameters, listSales, salesBase, kpis, invoiceDetail } = require("./sales-reports");
const { purchases, purchaseKpis, purchaseBase, metrics } = require("./purchase-reports");

function fail(status) {
  const error = new Error("La consulta de proveedores no está permitida.");
  error.status = status;
  throw error;
}

function identifier(value) {
  if (typeof value !== "string" || !/^[\p{L}\p{N}._-]{1,32}$/u.test(value)) fail(400);
  return value;
}

async function directory(transaction, query, optionsOnly) {
  const sortBy = query.sortBy || "Empresa";
  const sorts = { IdProveedor: "p.IdProveedor", Empresa: "p.Empresa" };
  if (!Object.hasOwn(sorts, sortBy)) fail(400);
  const base = transaction("proveedores as p");
  if (query.search)
    base.where(function () {
      this.where("p.Empresa", "like", `%${query.search}%`).orWhere("p.IdProveedor", "like", `%${query.search}%`);
    });
  const [{ total }] = await base.clone().count("* as total");
  const data = await base
    .clone()
    .select("p.IdProveedor", "p.Empresa")
    .orderBy(sorts[sortBy], query.sortDir)
    .orderBy("p.IdProveedor")
    .limit(optionsOnly ? 20 : query.limit)
    .offset(optionsOnly ? 0 : (query.page - 1) * query.limit);
  return optionsOnly ? data : { data, total: Number(total), page: query.page, limit: query.limit };
}

async function provider(transaction, access, query, id) {
  const row = await transaction("proveedores")
    .whereRaw("BINARY IdProveedor = ?", [id])
    .select("IdProveedor", "Empresa")
    .first();
  if (row) return row;
  if (access.hasGlobal("purchases.read")) {
    const { base } = purchaseBase(transaction, access, { ...query, proveedorId: id }, false);
    if (await base.first("mc.IdFactura")) return { IdProveedor: id, Empresa: `Proveedor no registrado (${id})` };
  }
  const scope = access.scopeFor("sales.read");
  if (scope.global || scope.sellerIds.length) {
    const { base } = salesBase(transaction, access, { ...query, proveedorId: id });
    if (await base.first("sf.IdProducto")) return { IdProveedor: id, Empresa: `Proveedor no registrado (${id})` };
  }
  fail(404);
}

async function summary(transaction, access, query, id) {
  const identity = await provider(transaction, access, query, id);
  const sales = access.scopeFor("sales.read");
  const selling = sales.global || sales.sellerIds.length > 0;
  const sellers = access.scopeFor("sellers.read");
  const sellerAvailable =
    selling &&
    (sellers.global || sellers.sellerIds.length > 0) &&
    (sellers.global || sales.global || sellers.sellerIds.some((seller) => sales.sellerIds.includes(seller)));
  const salesKpis = selling ? await kpis(transaction, access, { ...query, proveedorId: id }) : null;
  let complete = true;
  if (salesKpis) {
    const { base } = salesBase(transaction, access, { ...query, proveedorId: id });
    const financial = Object.hasOwn(salesKpis, "totalNetProfit");
    const missing = await base
      .select({
        prices: transaction.raw("COUNT(*)-COUNT(sf.Precio*sf.Cantidad)"),
        quantities: transaction.raw("COUNT(*)-COUNT(sf.Cantidad)"),
        ...(financial ? { costs: transaction.raw("COUNT(*)-COUNT((sf.Precio-sf.Costo)*sf.Cantidad)") } : {}),
      })
      .first();
    if (Number(missing.prices) > 0) {
      complete = false;
      salesKpis.totalRawProfit = null;
      salesKpis.avgTicket = null;
    }
    if (Number(missing.quantities) > 0) salesKpis.totalQuantity = null;
    if (financial && (Number(missing.costs) > 0 || !complete)) {
      salesKpis.totalNetProfit = null;
      salesKpis.avgMarginPercent = null;
    }
  }
  return {
    provider: identity,
    ...(selling ? { sales: salesKpis } : {}),
    ...(access.hasGlobal("purchases.read")
      ? { purchases: await purchaseKpis(transaction, access, { ...query, proveedorId: id }) }
      : {}),
    ...(sellerAvailable
      ? {
          bestSeller: !complete
            ? null
            : (
                await parties(
                  transaction,
                  access,
                  { ...query, page: 1, limit: 1, sortBy: "amount", sortDir: "desc" },
                  id,
                  true,
                )
              ).data[0]?.name || null,
        }
      : {}),
  };
}

async function purchaseDetail(transaction, access, query, id, documentId) {
  const { base, costs } = purchaseBase(transaction, access, { ...query, proveedorId: id }, false);
  base.whereRaw("BINARY mc.IdFactura = ?", [documentId]);
  const header = await base
    .clone()
    .first({ invoiceId: "mc.IdFactura", fecha: transaction.raw("CAST(DATE_FORMAT(mc.Fecha, '%Y-%m-%d') AS CHAR)") });
  if (!header) fail(404);
  const products = await base
    .clone()
    .whereNotNull("sc.IdFactura")
    .select({
      productId: "sc.IdProducto",
      descripcion: transaction.raw(
        "COALESCE(NULLIF(p.Descripcion, ''), NULLIF(sc.Descripcion, ''), CONCAT('Producto no registrado (', COALESCE(sc.IdProducto, 'sin ID'), ')'))",
      ),
      cantidad: "sc.Cantidad",
      ...(costs ? { precio: "sc.Precio", subtotal: transaction.raw("ROUND(sc.Precio * sc.Cantidad, 2)") } : {}),
    })
    .limit(1001);
  if (products.length > 1000) fail(413);
  const { quantity, amount } = metrics(transaction);
  const totals = await base
    .clone()
    .select({ unidades: quantity, ...(costs ? { total: amount } : {}) })
    .first();
  return { ...header, ...totals, productos: products };
}

function createProviderReports({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (!access.hasGlobal("providers.read")) fail(403);
          const query = parameters(req.query, options);
          const id = req.params.providerId ? identifier(req.params.providerId) : null;
          return work(transaction, access, query, id, req.params);
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/providers/options",
    handle((tx, _access, query) => directory(tx, query, true), { range: false, keys: ["search"] }),
  );
  router.get(
    "/providers/list",
    handle((tx, access, query) => providerList(tx, access, query), {
      range: false,
      keys: ["from", "to", "showNoe", "search", "page", "limit", "sortBy", "sortDir"],
    }),
  );
  router.get("/providers/best", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (!access.hasGlobal("providers.read")) fail(403);
          const { mode = "ventas", ...input } = req.query;
          const query = parameters(input, { keys: ["from", "to", "showNoe", "employeeId", "categoryId"] });
          if (mode === "compras" && (query.showNoe !== undefined || query.employeeId)) fail(400);
          return best(transaction, access, query, mode);
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  for (const [path, sellers] of [
    ["clients", false],
    ["sellers", true],
  ])
    router.get(
      `/providers/:providerId/${path}`,
      handle((tx, access, query, id) => parties(tx, access, query, id, sellers), {
        keys: ["from", "to", "showNoe", "employeeId", "productId", "page", "limit", "search", "sortBy", "sortDir"],
      }),
    );
  router.get("/providers/:providerId/summary", handle(summary, { keys: ["from", "to", "showNoe", "employeeId"] }));
  for (const [path, kind] of [
    ["sales", "invoices"],
    ["products", "products"],
  ])
    router.get(
      `/providers/:providerId/${path}`,
      handle((tx, access, query, id) => listSales(tx, access, { ...query, proveedorId: id }, kind), {
        keys: [
          "from",
          "to",
          "showNoe",
          "employeeId",
          "clientId",
          "productId",
          "page",
          "limit",
          "search",
          "sortBy",
          "sortDir",
        ],
      }),
    );
  router.get(
    "/providers/:providerId/purchases",
    handle(
      async (tx, access, query, id) => ({
        ...(await purchases(tx, access, { ...query, proveedorId: id }, false)),
        exportAllowed: access.hasGlobal("purchases.export"),
      }),
      {
        keys: ["from", "to", "page", "limit", "search", "sortBy", "sortDir"],
      },
    ),
  );
  router.get(
    "/providers/:providerId/purchases/:invoiceId",
    handle((tx, access, query, id, params) => purchaseDetail(tx, access, query, id, identifier(params.invoiceId)), {
      range: false,
      keys: ["from", "to"],
    }),
  );
  router.get(
    "/providers/:providerId/sales/:invoiceId",
    handle(
      (tx, access, query, id, params) =>
        invoiceDetail(tx, access, { ...query, proveedorId: id }, identifier(params.invoiceId)),
      { range: false, keys: ["from", "to", "showNoe", "employeeId"] },
    ),
  );
  return router;
}

module.exports = { createProviderReports, directory, purchaseDetail };
