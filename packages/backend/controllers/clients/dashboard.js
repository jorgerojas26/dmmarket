const knex = require("../../database");

// ── Helpers ──

/**
 * Returns { from, to } strings for the matching-length period
 * immediately before [from, to].
 */
const getPreviousPeriod = (from, to) => {
  const days = Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24));
  const prevFrom = new Date(from);
  prevFrom.setDate(prevFrom.getDate() - days);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);

  return {
    from: prevFrom.toISOString().split("T")[0],
    to: prevTo.toISOString().split("T")[0],
  };
};

// ── Pure domain functions (operate on already-fetched revenue rows) ──

const computeConcentration = (sortedRevenues, grandTotal) => {
  const concentration = { top5: 0, top10: 0, top20: 0 };
  let cumulative = 0;
  sortedRevenues.forEach((r, i) => {
    cumulative += Number(r.total_usd || 0);
    const pct = grandTotal > 0 ? Math.round((cumulative / grandTotal) * 1000) / 10 : 0;
    if (i === 4) concentration.top5 = pct;
    if (i === 9) concentration.top10 = pct;
    if (i === 19) concentration.top20 = pct;
  });
  if (sortedRevenues.length <= 5 && !concentration.top5) concentration.top5 = grandTotal > 0 ? 100 : 0;
  if (sortedRevenues.length <= 10 && !concentration.top10) concentration.top10 = grandTotal > 0 ? 100 : 0;
  if (sortedRevenues.length <= 20 && !concentration.top20) concentration.top20 = grandTotal > 0 ? 100 : 0;
  return concentration;
};

const computeAbc = (sortedRevenues, grandTotal, valueKey = "total_usd", summaryValueKey = "revenuePercent") => {
  let cumulative = 0;
  const abcClients = sortedRevenues.map((r, i) => {
    cumulative += Number(r[valueKey] || 0);
    const pct = grandTotal > 0 ? Math.round((cumulative / grandTotal) * 10000) / 100 : 0;
    return {
      name: r.name,
      total_usd: Number(r.total_usd),
      [valueKey]: Number(r[valueKey] || 0),
      rank: i + 1,
      cumulativePercent: pct,
      abcClass: pct <= 80 ? "A" : pct <= 95 ? "B" : "C",
    };
  });

  const classA = abcClients.filter((d) => d.abcClass === "A");
  const classB = abcClients.filter((d) => d.abcClass === "B");
  const classC = abcClients.filter((d) => d.abcClass === "C");

  const lastA = classA.length > 0 ? classA[classA.length - 1].cumulativePercent : 0;
  const lastB = classB.length > 0 ? classB[classB.length - 1].cumulativePercent : lastA;

  return {
    clients: abcClients,
    summary: {
      totalClients: abcClients.length,
      classA: { count: classA.length, [summaryValueKey]: lastA },
      classB: { count: classB.length, [summaryValueKey]: Math.round((lastB - lastA) * 100) / 100 },
      classC: { count: classC.length, [summaryValueKey]: 100 - lastB },
    },
  };
};

const computeSegments = (revenues, grandTotal) => {
  const SEGMENT_THRESHOLDS = [
    { key: "A: >100K", min: 100000 },
    { key: "B: 20K-100K", min: 20000 },
    { key: "C: 5K-20K", min: 5000 },
    { key: "D: 1K-5K", min: 1000 },
    { key: "E: <1K", min: -Infinity },
  ];

  const map = new Map();
  SEGMENT_THRESHOLDS.forEach((s) => {
    map.set(s.key, { segment: s.key, num_clients: 0, revenue: 0, total_invoices: 0 });
  });

  revenues.forEach((r) => {
    const totalUsd = Number(r.total_usd);
    const seg = SEGMENT_THRESHOLDS.find((t) => totalUsd >= t.min);
    if (!seg) return;
    const entry = map.get(seg.key);
    entry.num_clients += 1;
    entry.revenue += totalUsd;
    entry.total_invoices += Number(r.invoice_count);
  });

  return Array.from(map.values())
    .map((s) => ({
      segment: s.segment,
      num_clients: s.num_clients,
      revenue: Math.round(s.revenue * 100) / 100,
      revenue_pct: grandTotal > 0 ? Math.round((s.revenue / grandTotal) * 100 * 10) / 10 : 0,
      avg_invoices: s.num_clients > 0 ? Math.round((s.total_invoices / s.num_clients) * 10) / 10 : 0,
    }))
    .filter((s) => s.num_clients > 0);
};

const GET_CLIENTS_DASHBOARD = async (req, res) => {
  const { from, to, ruta } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const clients = await knex("clientes as c")
      .select(
        knex.raw("LOWER(c.IdCliente) as clientId"),
        "c.Ruta as routeId",
        knex.raw("LOWER(c.Ruta) as routeKey"),
        knex.raw("COALESCE(rutas.Nombre, c.Ruta) as routeName"),
        ruta ? knex.raw("c.Ruta = ? as in_route", [ruta]) : knex.raw("1 as in_route"),
      )
      .leftJoin("rutas", "rutas.Id_Ruta", "c.Ruta")
      .orderBy("c.Ruta", "asc");
    const scopedClients = clients.filter((c) => Number(c.in_route) === 1);
    const scopedClientIds = new Set(scopedClients.map((c) => c.clientId));

    const currentActivity = await knex(`${masterTable} as mf`)
      .select(
        knex.raw("LOWER(COALESCE(c.IdCliente, mf.IdCliente)) as clientId"),
        knex.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m') AS CHAR) as month"),
        knex.raw("COUNT(*) as invoice_count"),
      )
      .leftJoin("clientes as c", "c.IdCliente", "mf.IdCliente")
      .whereBetween("mf.Fecha", [from, to])
      .andWhere("mf.Anulada", 0)
      .groupBy("mf.IdCliente", knex.raw("DATE_FORMAT(mf.Fecha, '%Y-%m')"));

    const prevPeriod = getPreviousPeriod(from, to);
    const previousActivityQuery = knex(`${masterTable} as mf`)
      .select(
        knex.raw("LOWER(COALESCE(c.IdCliente, mf.IdCliente)) as clientId"),
        knex.raw("SUM(sf.Precio * sf.Cantidad) as total_usd"),
      )
      .leftJoin("clientes as c", "c.IdCliente", "mf.IdCliente")
      .leftJoin(`${slaveTable} as sf`, `sf.${idInvoice}`, `mf.${idInvoice}`)
      .whereBetween("mf.Fecha", [prevPeriod.from, prevPeriod.to])
      .andWhere("mf.Anulada", 0)
      .groupBy("mf.IdCliente");
    if (ruta) previousActivityQuery.where("c.Ruta", ruta);
    const previousActivity = await previousActivityQuery;

    const allClientsRevenueQuery = knex
      .select(
        knex.raw(
          "CASE WHEN NULLIF(mf.IdCliente, '') IS NULL THEN 'Cliente no registrado (sin ID)' ELSE COALESCE(NULLIF(clientes.Empresa, ''), NULLIF(MAX(mf.Nombre), ''), CONCAT('Cliente no registrado (', mf.IdCliente, ')')) END as name",
        ),
        "mf.IdCliente",
        knex.raw("COUNT(DISTINCT mf.??) as invoice_count", [idInvoice]),
        knex.raw("SUM(sf.Precio * sf.Cantidad) as total_usd"),
        knex.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad) as utilidad"),
      )
      .from(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .leftJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
      .whereBetween("mf.Fecha", [from, to])
      .groupBy("mf.IdCliente")
      .orderBy("total_usd", "desc");
    if (ruta) allClientsRevenueQuery.where("clientes.Ruta", ruta);
    const allClientsRevenue = await allClientsRevenueQuery;

    const currentClients = new Set();
    const globalCurrentClients = new Set();
    const clientsByMonth = new Map();
    let currentInvoices = 0;
    for (const row of currentActivity) {
      const monthClients = clientsByMonth.get(row.month) || new Set();
      if (row.clientId != null) {
        monthClients.add(row.clientId);
        globalCurrentClients.add(row.clientId);
      }
      clientsByMonth.set(row.month, monthClients);
      if (!ruta || scopedClientIds.has(row.clientId)) {
        currentInvoices += Number(row.invoice_count || 0);
        if (row.clientId != null) currentClients.add(row.clientId);
      }
    }

    const previousClients = new Set();
    let previousSales = 0;
    let retainedSales = 0;
    for (const row of previousActivity) {
      if (row.clientId != null) previousClients.add(row.clientId);
      const sales = Number(row.total_usd || 0);
      previousSales += sales;
      if (currentClients.has(row.clientId)) retainedSales += sales;
    }
    previousSales = Number(previousSales.toFixed(2));
    retainedSales = Number(retainedSales.toFixed(2));
    const retained = [...currentClients].filter((id) => previousClients.has(id)).length;
    const waterfall = {
      retained,
      lost: previousClients.size - retained,
      gained: currentClients.size - retained,
      previous: previousClients.size,
      current: currentClients.size,
    };

    const routeMap = new Map();
    for (const client of clients) {
      if (client.routeId == null) continue;
      const route = routeMap.get(client.routeKey) || {
        Id_Ruta: client.routeId,
        Nombre: client.routeName,
        asignados: 0,
        activos: 0,
      };
      route.asignados++;
      if (globalCurrentClients.has(client.clientId)) route.activos++;
      routeMap.set(client.routeKey, route);
    }
    const coverage = {
      totalClients: clients.length,
      routes: [...routeMap.values()]
        .map((r) => ({
          ...r,
          coberturaPct: Math.round((r.activos / r.asignados) * 1000) / 10,
          sharePct: Math.round((r.asignados / clients.length) * 1000) / 10,
        }))
        .sort((a, b) => b.asignados - a.asignados),
    };

    const grandTotal = allClientsRevenue.reduce((sum, r) => sum + Number(r.total_usd || 0), 0);
    const utilityClients = [...allClientsRevenue].sort((a, b) => Number(b.utilidad || 0) - Number(a.utilidad || 0));
    const grandUtility = utilityClients.reduce((sum, r) => sum + Number(r.utilidad || 0), 0);

    res.status(200).json({
      kpis: {
        totalClients: scopedClients.length,
        activeClients: currentClients.size,
        activePercent: scopedClients.length ? Math.round((currentClients.size / scopedClients.length) * 1000) / 10 : 0,
        sinFacturar: scopedClients.filter((c) => !currentClients.has(c.clientId)).length,
        withoutRoute: clients.filter((c) => c.routeId == null).length,
        concentration: computeConcentration(allClientsRevenue, grandTotal),
        retention: {
          retainedRevenue: retainedSales,
          prevPeriodRevenue: previousSales,
          rate: previousSales > 0 ? Math.round((retainedSales / previousSales) * 10000) / 100 : 0,
        },
        avgFrequency: currentClients.size ? Math.round((currentInvoices * 10) / currentClients.size) / 10 : 0,
      },
      monthlyActive: [...clientsByMonth]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, ids]) => ({
          month,
          count: ruta ? [...ids].filter((id) => scopedClientIds.has(id)).length : ids.size,
        }))
        .filter((row) => !ruta || row.count > 0),
      revenueBySegment: computeSegments(allClientsRevenue, grandTotal),
      waterfall,
      treemapTop50: allClientsRevenue.slice(0, 50).map((r) => ({ name: r.name, value: Number(r.total_usd) })),
      abc: computeAbc(allClientsRevenue, grandTotal),
      abcUtility: computeAbc(utilityClients, grandUtility, "utilidad", "utilityPercent"),
      coverage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_CLIENTS_DASHBOARD, computeAbc };
