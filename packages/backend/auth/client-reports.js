const express = require("express");
const { reportId, missingName, filterIdentity } = require("../utils/report-identity");
const { parameters, salesBase, financialFields } = require("./sales-reports");
const { salesDocuments } = require("./sales-documents");
const { clientDashboard } = require("./client-dashboard");

function fail(status) {
  const error = new Error("La consulta de clientes no está permitida.");
  error.status = status;
  throw error;
}

function identifier(value) {
  if (typeof value !== "string" || !/^[\p{L}\p{N}._-]{1,32}$/u.test(value)) fail(400);
  return value;
}

async function monthly(transaction, access, query, id) {
  identifier(id);
  const { base, invoice } = salesBase(transaction, access, { ...query, clientId: id });
  const rows = await base
    .select({
      month: transaction.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m') AS CHAR)"),
      amount: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      invoiceCount: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
    })
    .groupByRaw("DATE_FORMAT(mf.Fecha, '%Y-%m')")
    .orderBy("month");
  const catalog = transaction("clientes");
  filterIdentity(catalog, transaction.raw("BINARY IdCliente"), id);
  const client = await catalog.first("Empresa");
  const amounts = new Map(rows.map((row) => [row.month, row]));
  const cursor = new Date(`${query.from.slice(0, 7)}-01T00:00:00Z`);
  const lastMonth = Date.parse(`${query.to.slice(0, 7)}-01T00:00:00Z`);
  const data = [];
  while (cursor.getTime() <= lastMonth) {
    const month = cursor.toISOString().slice(0, 7);
    const row = amounts.get(month);
    data.push({
      x: month,
      y: row?.amount == null ? null : Number(row.amount),
      invoiceCount: Number(row?.invoiceCount || 0),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return { id: client?.Empresa || missingName("Cliente", ["__none__", "__empty__"].includes(id) ? null : id), data };
}

async function bestProduct(transaction, access, query, id) {
  identifier(id);
  const { base } = salesBase(transaction, access, query);
  const financial = financialFields(access, query);
  const rows = await base
    .whereRaw("BINARY sf.IdProducto = ?", [id])
    .select({
      clientId: "mf.IdCliente",
      client: transaction.raw(
        "COALESCE(NULLIF(c.Empresa, ''), CONCAT('Cliente no registrado (', COALESCE(mf.IdCliente, 'sin ID'), ')'))",
      ),
      quantity_total: transaction.raw("ROUND(SUM(sf.Cantidad), 3)"),
      total_USD: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      ...(financial ? { utilidad: transaction.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)") } : {}),
    })
    .groupBy("mf.IdCliente", "c.Empresa")
    .orderBy("total_USD", "desc")
    .orderBy("mf.IdCliente")
    .limit(5001);
  if (rows.length > 5000) fail(413);
  return rows.map((row) => ({ ...row, clientId: reportId(row.clientId) }));
}

async function inactiveClients(transaction, access, query) {
  const { base, slave, invoice } = salesDocuments(transaction, access, query);
  const documents = () => base.clone();
  const activity = documents()
    .select(transaction.raw("1"))
    .whereBetween("mf.Fecha", [query.from, query.to])
    .whereRaw("BINARY mf.IdCliente = BINARY c.IdCliente");
  const history = documents()
    .leftJoin(`${slave} as sf`, `sf.${invoice}`, `mf.${invoice}`)
    .where("mf.Fecha", "<=", query.to)
    .select({
      clientId: "mf.IdCliente",
      lastSale: transaction.raw("MAX(mf.Fecha)"),
      revenue: transaction.raw("SUM(sf.Precio * sf.Cantidad)"),
    })
    .groupByRaw("BINARY mf.IdCliente");
  const source = transaction("clientes as c")
    .leftJoin("rutas as r", "r.Id_Ruta", "c.Ruta")
    .leftJoin(history.as("h"), function () {
      this.on(transaction.raw("BINARY h.clientId = BINARY c.IdCliente"));
    })
    .whereNotExists(activity);
  if (query.search) source.where("c.Empresa", "like", `%${query.search}%`);
  if (query.ruta) source.whereRaw("BINARY c.Ruta = ?", [query.ruta]);
  const selected = {
    IdCliente: "c.IdCliente",
    Empresa: "c.Empresa",
    ruta: "c.Ruta",
    ruta_nombre: transaction.raw("COALESCE(r.Nombre, c.Ruta)"),
    last_factura: transaction.raw("CAST(DATE_FORMAT(h.lastSale, '%Y-%m-%d') AS CHAR)"),
    dias_inactivo: transaction.raw("DATEDIFF(?, h.lastSale)", [query.to]),
    revenue_historico: transaction.raw("ROUND(COALESCE(h.revenue, 0), 2)"),
  };
  const sort = {
    IdCliente: selected.IdCliente,
    Empresa: selected.Empresa,
    ruta: selected.ruta_nombre,
    last_factura: "h.lastSale",
    dias_inactivo: selected.dias_inactivo,
    revenue_historico: selected.revenue_historico,
  };
  const sortBy = query.sortBy || "revenue_historico";
  if (!Object.hasOwn(sort, sortBy)) fail(400);
  const [{ total }] = await source.clone().count("* as total");
  const data = await source
    .clone()
    .select(selected)
    .orderBy(sort[sortBy], query.sortDir)
    .orderBy("c.IdCliente")
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  return { data, total: Number(total), page: query.page, limit: query.limit };
}

function createClientReports({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, {}, ({ transaction, access }) => {
          if (!access.hasGlobal("clients.read")) fail(403);
          return work(transaction, access, parameters(req.query, options), req.params);
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/clients/average/month/:clientId",
    handle((transaction, access, query, params) => monthly(transaction, access, query, params.clientId), {
      keys: ["from", "to", "showNoe"],
    }),
  );
  router.get(
    "/clients/best/product/:productId",
    handle((transaction, access, query, params) => bestProduct(transaction, access, query, params.productId), {
      keys: ["from", "to", "showNoe", "employeeId", "ruta"],
    }),
  );
  router.get(
    "/clients/sin-facturar",
    handle(inactiveClients, {
      keys: ["from", "to", "showNoe", "search", "ruta", "employeeId", "sortBy", "sortDir", "page", "limit"],
    }),
  );
  router.get("/clients/dashboard", handle(clientDashboard, { keys: ["from", "to", "showNoe", "ruta", "employeeId"] }));
  router.get(
    "/clients/routes",
    handle(
      async (transaction) => {
        const rows = await transaction("clientes as c")
          .join("rutas as r", "r.Id_Ruta", "c.Ruta")
          .select({ Id_Ruta: "c.Ruta", Nombre: "r.Nombre", clientes: transaction.raw("COUNT(*)") })
          .groupBy("c.Ruta", "r.Nombre")
          .orderBy("c.Ruta")
          .limit(501);
        if (rows.length > 500) fail(413);
        return rows;
      },
      { range: false, keys: [] },
    ),
  );
  return router;
}

module.exports = { createClientReports, inactiveClients };
