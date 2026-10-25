const express = require("express");
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
  return {
    provider: identity,
    ...(sales.global || sales.sellerIds.length
      ? { sales: await kpis(transaction, access, { ...query, proveedorId: id }) }
      : {}),
    ...(access.hasGlobal("purchases.read")
      ? { purchases: await purchaseKpis(transaction, access, { ...query, proveedorId: id }) }
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
        await sessions.withSession(req.sessionID, {}, ({ transaction, access }) => {
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
    handle((tx, _access, query) => directory(tx, query, false), {
      range: false,
      keys: ["search", "page", "limit", "sortBy", "sortDir"],
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
        keys: ["from", "to", "showNoe", "employeeId", "page", "limit", "search", "sortBy", "sortDir"],
      }),
    );
  router.get(
    "/providers/:providerId/purchases",
    handle((tx, access, query, id) => purchases(tx, access, { ...query, proveedorId: id }, false), {
      keys: ["from", "to", "page", "limit", "search", "sortBy", "sortDir"],
    }),
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

module.exports = { createProviderReports, directory };
