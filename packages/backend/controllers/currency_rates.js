const { parameters } = require("./sales");
const { fechaEnCaracas } = require("../bcv");

function fail(status) {
  throw Object.assign(new Error("Operación no permitida."), { status });
}
function empty(input) {
  if (Object.keys(input).length) fail(400);
}
function asRate(row) {
  if (!row) return null;
  if (!Number.isFinite(Number(row.Venta)) || Number(row.Venta) <= 0) fail(503);
  return { fecha: row.Fecha, tasa: Number(row.Venta) };
}
const dateColumn = (tx) => tx.raw("CAST(DATE_FORMAT(Fecha, '%Y-%m-%d') AS CHAR)");

async function rateHistory(tx, req) {
  const end = req.query.to || fechaEnCaracas();
  const from =
    req.query.from ||
    (Number.isFinite(Date.parse(end))
      ? new Date(Date.parse(end) - 89 * 86400000).toISOString().slice(0, 10)
      : "invalid");
  const query = parameters({ ...req.query, from, to: end }, { keys: ["from", "to"] });
  const rows = await tx("bcv_tasas")
    .whereBetween("Fecha", [query.from, query.to])
    .select({ Fecha: dateColumn(tx), Venta: "Venta" })
    .orderBy("Fecha")
    .limit(368);
  if (rows.length > 367) fail(413);
  return rows.map(asRate);
}

async function latestRate(tx, req) {
  empty(req.query);
  const row = await tx("bcv_tasas")
    .where("Fecha", "<=", fechaEnCaracas())
    .select({ Fecha: dateColumn(tx), Venta: "Venta" })
    .orderBy("Fecha", "desc")
    .first();
  if (!row) fail(404);
  return asRate(row);
}

async function rateStatus(tx, req, rateService, lastSync) {
  empty(req.query);
  const disponible = await tx.schema.hasTable("bcv_tasas");
  if (!disponible) return { disponible: false, ultimaTasa: null, ultimaPublicada: null, publicadaHasta: null };
  const current = await tx("bcv_tasas")
    .where("Fecha", "<=", fechaEnCaracas())
    .select({ Fecha: dateColumn(tx), Venta: "Venta" })
    .orderBy("Fecha", "desc")
    .first();
  const newest = await tx("bcv_tasas")
    .select({ Fecha: dateColumn(tx), Venta: "Venta" })
    .orderBy("Fecha", "desc")
    .first();
  const operational = typeof rateService.estado === "function" ? await rateService.estado() : {};
  return {
    disponible: true,
    lastRequest: lastSync,
    sincronizando: lastSync?.outcome === "running" || operational.sincronizando === true,
    ultimaSincronizacion: operational.ultimaSincronizacion || lastSync?.completedAt || null,
    intervaloMinutos: operational.intervaloMinutos || null,
    ultimaTasa: asRate(current),
    ultimaPublicada: asRate(newest),
    publicadaHasta: newest?.Fecha || null,
  };
}

async function rateForDate(tx, req) {
  empty(req.query);
  const date = req.params.date;
  parameters({ from: date, to: date });
  if (date > fechaEnCaracas()) fail(400);
  const row = await tx("bcv_tasas")
    .where("Fecha", "<=", date)
    .select({ Fecha: dateColumn(tx), Venta: "Venta" })
    .orderBy("Fecha", "desc")
    .first();
  if (!row) fail(404);
  return { ...asRate(row), solicitada: date, exacta: row.Fecha === date };
}

async function currentRates(transaction) {
  return transaction("divisas").select("Simbolo", "Cambio").orderBy("Simbolo").limit(100);
}

module.exports = { currentRates, rateHistory, latestRate, rateStatus, rateForDate };
