const express = require("express");
const { parameters, salesBase, financialFields } = require("./sales-reports");

function fail(status) {
  const error = new Error("La consulta de comisiones no está permitida.");
  error.status = status;
  throw error;
}

function authorize(access, id) {
  if (typeof id !== "string" || !/^[\p{L}\p{N}._-]{1,32}$/u.test(id)) fail(400);
  if (!access.canRecord("commissions.read", id)) fail(403);
}

async function rates(transaction, access, id, input) {
  authorize(access, id);
  if (Object.keys(input).length) fail(400);
  if (!(await transaction("vendedores").whereRaw("BINARY idVend = ?", [id]).first("idVend"))) fail(404);
  const configured = transaction("vendedor_comisiones")
    .whereRaw("BINARY vendedorId = ?", [id])
    .select({ groupId: "grupoId", rate: transaction.raw("MIN(comision)"), copies: transaction.raw("COUNT(*)") })
    .groupByRaw("BINARY grupoId");
  const data = await transaction("grupos as g")
    .leftJoin(configured.as("r"), function () {
      this.on(transaction.raw("r.groupId = g.IdGrupo AND BINARY r.groupId = BINARY g.IdGrupo"));
    })
    .select({
      groupId: "g.IdGrupo",
      group: "g.Descripcion",
      commission: transaction.raw("CASE WHEN r.copies = 1 AND r.rate BETWEEN 0 AND 100 THEN r.rate END"),
    })
    .orderBy("g.IdGrupo")
    .limit(501);
  if (data.length > 500) fail(413);
  return data;
}

async function sales(transaction, access, id, input) {
  authorize(access, id);
  const query = parameters(input, { keys: ["from", "to", "showNoe", "page", "limit", "sortBy", "sortDir", "search"] });
  if (query.showNoe === "true" || !access.canRecord("sales.read", id)) fail(403);
  const filtered = { ...query, employeeId: id, showNoe: "false" };
  const { base } = salesBase(transaction, access, filtered);
  if (query.search)
    base.where(function () {
      this.where("mf.IdFactura", "like", `%${query.search}%`).orWhere("c.Empresa", "like", `%${query.search}%`);
    });
  const frozen = transaction("fact_vendedor_comisiones as f")
    .whereExists(
      transaction("masterfact as m")
        .select(transaction.raw("1"))
        .where("m.Anulada", 0)
        .whereRaw("BINARY m.IdVend = ?", [id])
        .whereBetween("m.Fecha", [query.from, query.to])
        .whereRaw("m.IdFactura = f.masterfactId AND BINARY m.IdFactura = BINARY f.masterfactId"),
    )
    .select({
      invoiceId: "f.masterfactId",
      groupId: "f.grupoId",
      rate: transaction.raw("MIN(f.comision)"),
      copies: transaction.raw("COUNT(*)"),
    })
    .groupByRaw("BINARY f.masterfactId, BINARY f.grupoId");
  base.leftJoin(frozen.as("f"), function () {
    this.on(transaction.raw("f.invoiceId = mf.IdFactura AND BINARY f.invoiceId = BINARY mf.IdFactura")).andOn(
      transaction.raw("f.groupId = p.Grupo AND BINARY f.groupId = BINARY p.Grupo"),
    );
  });
  const financial = financialFields(access, filtered);
  const sortBy = query.sortBy || "createdAt";
  if (sortBy === "utilidad" && !financial) fail(403);
  const sorts = {
    invoiceId: "mf.IdFactura",
    createdAt: "mf.Fecha",
    invoiceTotal: "invoiceTotal",
    commissionTotal: "commissionTotal",
    ...(financial ? { utilidad: "utilidad" } : {}),
  };
  if (!Object.hasOwn(sorts, sortBy)) fail(400);
  const selected = {
    invoiceTotal: transaction.raw(
      "CASE WHEN COUNT(sf.Precio * sf.Cantidad) = COUNT(*) THEN ROUND(SUM(sf.Precio * sf.Cantidad), 2) END",
    ),
    commissionTotal: transaction.raw(
      "CASE WHEN COUNT(sf.Precio * sf.Cantidad) = COUNT(*) AND SUM(CASE WHEN p.IdProducto IS NULL OR p.Grupo IS NULL OR f.copies IS NULL OR f.copies <> 1 OR f.rate IS NULL OR f.rate < 0 OR f.rate > 100 THEN 1 ELSE 0 END) = 0 THEN ROUND(SUM(sf.Precio * sf.Cantidad * f.rate / 100), 2) END",
    ),
    ...(financial
      ? {
          utilidad: transaction.raw(
            "CASE WHEN COUNT((sf.Precio - sf.Costo) * sf.Cantidad) = COUNT(*) THEN ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2) END",
          ),
        }
      : {}),
  };
  const [{ total }] = await transaction
    .from(base.clone().select("mf.IdFactura").groupByRaw("BINARY mf.IdFactura").as("i"))
    .count("* as total");
  const data = await base
    .clone()
    .select({
      invoiceId: "mf.IdFactura",
      client: transaction.raw("COALESCE(c.Empresa, 'Cliente no registrado')"),
      createdAt: transaction.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m-%d') AS CHAR)"),
      ...selected,
    })
    .groupByRaw("BINARY mf.IdFactura")
    .orderBy(sorts[sortBy], query.sortDir)
    .orderBy("mf.IdFactura")
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  return { data, pagination: { page: query.page, limit: query.limit, total: Number(total) } };
}

function createCommissionReports({ sessions }) {
  const router = express.Router();
  for (const [path, work] of [
    ["/employees/commissionInfo/:employeeId", rates],
    ["/employees/sales/:employeeId", sales],
  ])
    router.get(path, async (req, res, next) => {
      try {
        res.json(
          await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) =>
            work(transaction, access, req.params.employeeId, req.query),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  return router;
}

module.exports = { createCommissionReports };
