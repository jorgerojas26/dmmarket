const express = require("express");

function fail(status) {
  const error = new Error("La consulta de ventas no está permitida.");
  error.status = status;
  throw error;
}

function parameters(query) {
  const allowed = [
    "from",
    "to",
    "showNoe",
    "page",
    "limit",
    "sortBy",
    "sortDir",
    "search",
    "clientId",
    "categoryId",
    "employeeId",
    "ruta",
    "proveedorId",
  ];
  if (
    Object.keys(query).some((key) => !allowed.includes(key)) ||
    Object.values(query).some((value) => typeof value !== "string" || value.length > 128)
  )
    fail(400);
  if (query.showNoe !== undefined && !["false", "true"].includes(query.showNoe)) fail(400);
  for (const value of [query.from, query.to]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value || "") ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      fail(400);
  }
  const span = Date.parse(query.to) - Date.parse(query.from);
  if (span < 0 || span > 366 * 86400000) fail(400);
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    fail(400);
  if (query.sortDir !== undefined && !["asc", "desc"].includes(query.sortDir.toLowerCase())) fail(400);
  return { ...query, page, limit, sortDir: (query.sortDir || "desc").toLowerCase() };
}

function financialFields(access, query) {
  const read = access.scopeFor("sales.read");
  return ["sales.costs", "sales.profit"].every(
    (capability) =>
      access.hasGlobal(capability) ||
      (query.employeeId
        ? access.canRecord(capability, query.employeeId)
        : !read.global && access.covers(capability, read.sellerIds)),
  );
}

function salesBase(transaction, access, query) {
  const read = access.scopeFor("sales.read");
  if (!read.global && !read.sellerIds.length) fail(403);
  const noe = query.showNoe === "true";
  const master = noe ? "masternoe" : "masterfact";
  const slave = noe ? "slavenoe" : "slavefact";
  const invoice = noe ? "IdNoe" : "IdFactura";
  const base = transaction(`${slave} as sf`)
    .join(`${master} as mf`, function () {
      this.on(`mf.${invoice}`, `sf.${invoice}`).andOn("mf.Anulada", 0);
    })
    .leftJoin("clientes as c", "c.IdCliente", "mf.IdCliente")
    .leftJoin("vendedores as v", "v.idVend", "mf.IdVend")
    .leftJoin("productos as p", "p.IdProducto", "sf.IdProducto")
    .whereBetween("mf.Fecha", [query.from, query.to]);
  if (!read.global) base.whereIn("mf.IdVend", read.sellerIds);
  for (const [parameter, column] of Object.entries({
    clientId: "mf.IdCliente",
    categoryId: "p.Grupo",
    employeeId: "mf.IdVend",
    ruta: "c.Ruta",
    proveedorId: "p.Proveedor",
  }))
    if (query[parameter]) base.where(column, query[parameter]);
  return { base, invoice };
}

function createSalesReports({ sessions }) {
  const router = express.Router();
  const handle = (kind) => async (req, res, next) => {
    try {
      const result = await sessions.withSession(req.sessionID, {}, async ({ transaction, access }) => {
        const query = parameters(req.query);
        const financial = financialFields(access, query);
        const { base, invoice } = salesBase(transaction, access, query);
        const products = kind === "products";
        const group = products ? "sf.IdProducto" : `mf.${invoice}`;
        if (query.search)
          base.where(function () {
            if (products) this.where("p.Descripcion", "like", `%${query.search}%`);
            else
              this.where("c.Empresa", "like", `%${query.search}%`)
                .orWhere(`mf.${invoice}`, "like", `%${query.search}%`)
                .orWhere("p.Descripcion", "like", `%${query.search}%`)
                .orWhere("sf.IdProducto", "like", `%${query.search}%`);
          });
        const raw = (sql, values) => transaction.raw(sql, values);
        const amount = raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)");
        const profit = raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)");
        const percent = raw("ROUND(AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100), 2)");
        const quantity = raw("ROUND(SUM(sf.Cantidad), 3)");
        const weight = raw("CASE WHEN COUNT(p.Peso) = COUNT(*) THEN ROUND(SUM(sf.Cantidad * p.Peso), 3) END");
        const sort = products
          ? {
              product: "p.Descripcion",
              quantity,
              peso: weight,
              rawProfit: amount,
              netProfit: profit,
              averageProfitPercent: percent,
            }
          : {
              invoiceId: `mf.${invoice}`,
              fecha: "mf.Fecha",
              monto: amount,
              cliente: "c.Empresa",
              vendedor: "v.Empresa",
              utilidad: profit,
              promedio: percent,
            };
        const sortBy = query.sortBy || (products ? "rawProfit" : "fecha");
        if (!Object.hasOwn(sort, sortBy)) fail(400);
        if (!financial && ["netProfit", "averageProfitPercent", "utilidad", "promedio"].includes(sortBy)) fail(403);
        const metrics = products ? { quantity, peso: weight, rawProfit: amount } : { monto: amount };
        if (financial)
          Object.assign(
            metrics,
            products ? { netProfit: profit, averageProfitPercent: percent } : { utilidad: profit, promedio: percent },
          );
        const columns = products
          ? { product: raw("COALESCE(p.Descripcion, CONCAT('Producto no registrado (', sf.IdProducto, ')'))") }
          : {
              invoiceId: `mf.${invoice}`,
              fecha: "mf.Fecha",
              cliente: raw("COALESCE(c.Empresa, 'Cliente no registrado')"),
              vendedor: raw("COALESCE(v.Empresa, 'Vendedor no registrado')"),
            };
        const count = await base.clone().countDistinct({ total: group }).first();
        const data = await base
          .clone()
          .select({ ...columns, ...metrics })
          .groupBy(group)
          .orderBy(sort[sortBy], query.sortDir)
          .limit(query.limit)
          .offset((query.page - 1) * query.limit);
        const totals = await base.clone().select(metrics).first();
        return { data, pagination: { page: query.page, limit: query.limit, total: Number(count.total) }, totals };
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
  router.get("/facturas", handle("invoices"));
  router.get("/productos", handle("products"));
  return router;
}

module.exports = { createSalesReports };
