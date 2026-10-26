const { reportId, missingName } = require("../utils/report-identity");
const { financialFields, parameters } = require("./sales-reports");
const { salesDocuments } = require("./sales-documents");

const key = (value) => JSON.stringify(value == null ? null : String(value));
const round = (value) => Math.round(value * 100) / 100;
const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);

function bounded(rows, limit) {
  if (rows.length > limit) {
    const error = new Error("La consulta de clientes supera el límite permitido.");
    error.status = 413;
    throw error;
  }
  return rows;
}

function abc(rows, field, percentKey) {
  const sorted = [...rows].sort((a, b) => b[field] - a[field] || key(a.clientId).localeCompare(key(b.clientId)));
  const total = sum(sorted, field);
  const valid = total > 0 && sorted.every((row) => row[field] >= 0);
  let cumulative = 0;
  const classes = {
    A: { count: 0, [percentKey]: valid || !rows.length ? 0 : null },
    B: { count: 0, [percentKey]: valid || !rows.length ? 0 : null },
    C: { count: 0, [percentKey]: valid || !rows.length ? 0 : null },
  };
  const clients = sorted.map((row, index) => {
    cumulative += row[field];
    const percentage = valid ? (cumulative / total) * 100 : null;
    const abcClass = valid ? (percentage <= 80 ? "A" : percentage <= 95 ? "B" : "C") : null;
    if (abcClass) {
      classes[abcClass].count++;
      classes[abcClass][percentKey] += (row[field] / total) * 100;
    }
    return {
      clientId: reportId(row.clientId),
      name: row.name,
      total_usd: row.total_usd,
      [field]: row[field],
      rank: index + 1,
      cumulativePercent: percentage == null ? null : round(percentage),
      abcClass,
    };
  });
  for (const item of Object.values(classes)) if (item[percentKey] != null) item[percentKey] = round(item[percentKey]);
  return { clients, summary: { totalClients: rows.length, classA: classes.A, classB: classes.B, classC: classes.C } };
}

async function clientDashboard(transaction, access, query) {
  salesDocuments(transaction, access, query);
  const span = Date.parse(query.to) - Date.parse(query.from) + 86400000;
  const previousRange = {
    from: new Date(Date.parse(query.from) - span).toISOString().slice(0, 10),
    to: new Date(Date.parse(query.from) - 86400000).toISOString().slice(0, 10),
  };
  parameters(previousRange);
  const financial = financialFields(access, query);
  const catalogQuery = transaction("clientes as c")
    .leftJoin("rutas as r", function () {
      this.on(transaction.raw("r.Id_Ruta = c.Ruta AND BINARY r.Id_Ruta = BINARY c.Ruta"));
    })
    .select({
      clientId: "c.IdCliente",
      name: "c.Empresa",
      routeId: "c.Ruta",
      routeName: transaction.raw("COALESCE(r.Nombre, c.Ruta)"),
    });
  if (query.ruta) catalogQuery.whereRaw("BINARY c.Ruta = ?", [query.ruta]);
  const catalog = bounded(await catalogQuery.orderBy("c.IdCliente").limit(5001), 5000);
  const catalogById = new Map(catalog.map((row) => [key(row.clientId), row]));
  const documents = (range) => {
    const result = salesDocuments(transaction, access, range);
    result.base.whereBetween("mf.Fecha", [range.from, range.to]);
    if (query.ruta)
      result.base
        .join("clientes as c", function () {
          this.on(transaction.raw("c.IdCliente = mf.IdCliente AND BINARY c.IdCliente = BINARY mf.IdCliente"));
        })
        .whereRaw("BINARY c.Ruta = ?", [query.ruta]);
    return result;
  };
  const revenues = async (range) => {
    const { base, slave, invoice } = documents(range);
    const rows = bounded(
      await base
        .leftJoin(`${slave} as sf`, `sf.${invoice}`, `mf.${invoice}`)
        .select({
          clientId: "mf.IdCliente",
          total_usd: transaction.raw("ROUND(COALESCE(SUM(sf.Precio * sf.Cantidad), 0), 2)"),
          invoice_count: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
          ...(financial
            ? { utilidad: transaction.raw("ROUND(COALESCE(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 0), 2)") }
            : {}),
        })
        .groupByRaw("BINARY mf.IdCliente")
        .limit(5001),
      5000,
    );
    return rows.map((row) => ({
      ...row,
      name: catalogById.get(key(row.clientId))?.name || missingName("Cliente", row.clientId),
      total_usd: Number(row.total_usd),
      invoice_count: Number(row.invoice_count),
      ...(financial ? { utilidad: Number(row.utilidad) } : {}),
    }));
  };
  const current = (await revenues(query)).sort(
    (a, b) => b.total_usd - a.total_usd || key(a.clientId).localeCompare(key(b.clientId)),
  );
  const previous = await revenues({ ...query, ...previousRange });
  const active = new Set(current.map((row) => key(row.clientId)));
  const before = new Set(previous.map((row) => key(row.clientId)));
  const knownActive = catalog.filter((row) => active.has(key(row.clientId))).length;
  const retained = current.filter((row) => before.has(key(row.clientId))).length;
  const previousSales = sum(previous, "total_usd");
  const retainedSales = sum(
    previous.filter((row) => active.has(key(row.clientId))),
    "total_usd",
  );
  const totalSales = sum(current, "total_usd");
  const concentration = Object.fromEntries(
    [5, 10, 20].map((count) => [
      `top${count}`,
      totalSales > 0 && current.every((row) => row.total_usd >= 0)
        ? round((sum(current.slice(0, count), "total_usd") / totalSales) * 100)
        : current.length
          ? null
          : 0,
    ]),
  );
  const { base: activity } = documents(query);
  const months = bounded(
    await activity
      .select({ clientId: "mf.IdCliente", month: transaction.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m') AS CHAR)") })
      .groupByRaw("BINARY mf.IdCliente, DATE_FORMAT(mf.Fecha, '%Y-%m')")
      .orderBy("month")
      .limit(70001),
    70000,
  );
  const byMonth = new Map();
  for (const row of months) {
    const entry = byMonth.get(row.month) || { month: row.month, count: 0, unregistered: 0 };
    if (catalogById.has(key(row.clientId))) entry.count++;
    else entry.unregistered++;
    byMonth.set(row.month, entry);
  }
  const routeMap = new Map();
  for (const row of catalog) {
    if (row.routeId == null || row.routeId === "") continue;
    const entry = routeMap.get(key(row.routeId)) || {
      Id_Ruta: row.routeId,
      Nombre: row.routeName,
      asignados: 0,
      activos: 0,
    };
    entry.asignados++;
    if (active.has(key(row.clientId))) entry.activos++;
    routeMap.set(key(row.routeId), entry);
  }
  const segments = new Map();
  const thresholds = [
    ["A: >100K", 100000],
    ["B: 20K-100K", 20000],
    ["C: 5K-20K", 5000],
    ["D: 1K-5K", 1000],
    ["E: <1K", -Infinity],
  ];
  for (const row of current) {
    const [segment] = thresholds.find(([, min]) => row.total_usd >= min);
    const entry = segments.get(segment) || { segment, num_clients: 0, revenue: 0, invoices: 0 };
    entry.num_clients++;
    entry.revenue += row.total_usd;
    entry.invoices += row.invoice_count;
    segments.set(segment, entry);
  }
  return {
    kpis: {
      totalClients: catalog.length,
      activeClients: knownActive,
      unregisteredActiveClients: current.length - knownActive,
      activePercent: catalog.length ? round((knownActive / catalog.length) * 100) : 0,
      sinFacturar: catalog.length - knownActive,
      withoutRoute: catalog.filter((row) => row.routeId == null || row.routeId === "").length,
      concentration,
      retention: {
        retainedRevenue: round(retainedSales),
        prevPeriodRevenue: round(previousSales),
        rate: previousSales > 0 ? round((retainedSales / previousSales) * 100) : null,
      },
      avgFrequency: current.length ? round(sum(current, "invoice_count") / current.length) : 0,
    },
    monthlyActive: [...byMonth.values()],
    revenueBySegment: thresholds
      .filter(([name]) => segments.has(name))
      .map(([name]) => {
        const row = segments.get(name);
        return {
          segment: name,
          num_clients: row.num_clients,
          revenue: round(row.revenue),
          revenue_pct: totalSales > 0 ? round((row.revenue / totalSales) * 100) : null,
          avg_invoices: round(row.invoices / row.num_clients),
        };
      }),
    waterfall: {
      retained,
      lost: before.size - retained,
      gained: active.size - retained,
      previous: before.size,
      current: active.size,
    },
    treemapTop50: current
      .slice(0, 50)
      .map((row) => ({ clientId: reportId(row.clientId), name: row.name, value: row.total_usd })),
    abc: abc(current, "total_usd", "revenuePercent"),
    ...(financial ? { abcUtility: abc(current, "utilidad", "utilityPercent") } : {}),
    coverage: {
      totalClients: catalog.length,
      routes: [...routeMap.values()].map((row) => ({
        ...row,
        coberturaPct: round((row.activos / row.asignados) * 100),
        sharePct: catalog.length ? round((row.asignados / catalog.length) * 100) : 0,
      })),
    },
  };
}

module.exports = { clientDashboard };
