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

const computeAbc = (sortedRevenues, grandTotal) => {
  let cumulative = 0;
  const abcClients = sortedRevenues.map((r, i) => {
    cumulative += Number(r.total_usd || 0);
    const pct = grandTotal > 0 ? Math.round((cumulative / grandTotal) * 10000) / 100 : 0;
    return {
      name: r.name,
      total_usd: Number(r.total_usd),
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
    clients: abcClients.slice(0, 50),
    summary: {
      totalClients: abcClients.length,
      classA: { count: classA.length, revenuePercent: lastA },
      classB: { count: classB.length, revenuePercent: Math.round((lastB - lastA) * 100) / 100 },
      classC: { count: classC.length, revenuePercent: 100 - lastB },
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
  SEGMENT_THRESHOLDS.forEach((s) => map.set(s.key, { segment: s.key, num_clients: 0, revenue: 0, total_invoices: 0 }));

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

// ── Controller ──

const GET_CLIENTS_DASHBOARD = async (req, res) => {
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    // Shared query: all client revenues in period
    const allClientsRevenue = await knex
      .select(
        "clientes.Empresa as name",
        "mf.IdCliente",
        knex.raw(`COUNT(DISTINCT mf.??) as invoice_count`, [idInvoice]),
        knex.raw(`ROUND(SUM(sf.Precio * sf.Cantidad), 2) as total_usd`),
      )
      .from(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
      .whereBetween("mf.Fecha", [from, to])
      .groupBy("mf.IdCliente")
      .orderBy("total_usd", "desc");

    const grandTotal = allClientsRevenue.reduce((sum, r) => sum + Number(r.total_usd || 0), 0);

    const concentration = computeConcentration(allClientsRevenue, grandTotal);
    const abc = computeAbc(allClientsRevenue, grandTotal);
    const revenueBySegment = computeSegments(allClientsRevenue, grandTotal);
    const treemapTop50 = allClientsRevenue.slice(0, 50).map((r) => ({
      name: r.name,
      value: Number(r.total_usd),
    }));

    const prevPeriod = getPreviousPeriod(from, to);

    const [
      totalClientsRow,
      activeClientsRow,
      retentionRow,
      frequencyRow,
      crossSellRow,
      revenueAtRiskRow,
      monthlyActive,
      waterfallRows,
      inactiveBuckets,
    ] = await Promise.all([
      // 1. Total clients
      knex("clientes").count("* as total").first(),

      // 2. Active clients
      knex(`${masterTable} as mf`)
        .countDistinct("mf.IdCliente as total")
        .whereBetween("mf.Fecha", [from, to])
        .andWhere("mf.Anulada", 0)
        .first(),

      // 3. Retention rate ($)
      (async () => {
        const currentClients = knex(`${masterTable}`)
          .distinct("IdCliente")
          .whereBetween("Fecha", [from, to])
          .andWhere("Anulada", 0);

        const retainedRevenue = await knex(`${masterTable} as mf`)
          .innerJoin(`${slaveTable} as sf`, function () {
            this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
          })
          .select(knex.raw(`ROUND(SUM(sf.Precio * sf.Cantidad), 2) as total`))
          .whereBetween("mf.Fecha", [prevPeriod.from, prevPeriod.to])
          .whereIn("mf.IdCliente", currentClients)
          .first();

        const prevTotalRevenue = await knex(`${masterTable} as mf`)
          .innerJoin(`${slaveTable} as sf`, function () {
            this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
          })
          .select(knex.raw(`ROUND(SUM(sf.Precio * sf.Cantidad), 2) as total`))
          .whereBetween("mf.Fecha", [prevPeriod.from, prevPeriod.to])
          .first();

        const prevTotal = Number(prevTotalRevenue?.total) || 0;
        const retained = Number(retainedRevenue?.total) || 0;
        return { retained, prevTotal, rate: prevTotal > 0 ? Math.round((retained / prevTotal) * 10000) / 100 : 0 };
      })(),

      // 4. Avg frequency
      knex(`${masterTable} as mf`)
        .select(
          knex.raw(
            `ROUND(COUNT(DISTINCT mf.${idInvoice}) / NULLIF(COUNT(DISTINCT mf.IdCliente), 0), 1) as avg_frequency`,
          ),
        )
        .whereBetween("mf.Fecha", [from, to])
        .andWhere("mf.Anulada", 0)
        .first(),

      // 5. Cross-sell depth
      knex
        .select(knex.raw("ROUND(AVG(distinct_prods), 1) as avg_products"))
        .from(
          knex
            .select("mf.IdCliente", knex.raw(`COUNT(DISTINCT sf.IdProducto) as distinct_prods`))
            .from(`${masterTable} as mf`)
            .innerJoin(`${slaveTable} as sf`, function () {
              this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
            })
            .whereBetween("mf.Fecha", [from, to])
            .groupBy("mf.IdCliente")
            .as("client_products"),
        )
        .first(),

      // 6. Revenue at risk (>60 days inactive)
      knex
        .select(knex.raw(`ROUND(SUM(total_usd), 2) as revenue_at_risk`), knex.raw(`COUNT(*) as clients_at_risk`))
        .from(
          knex
            .select(
              "mf.IdCliente",
              knex.raw(`SUM(sf.Precio * sf.Cantidad) as total_usd`),
              knex.raw(`MAX(mf.Fecha) as last_purchase`),
            )
            .from(`${masterTable} as mf`)
            .innerJoin(`${slaveTable} as sf`, function () {
              this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
            })
            .where("mf.Fecha", "<=", to)
            .groupBy("mf.IdCliente")
            .as("client_last"),
        )
        .where(knex.raw(`DATEDIFF(?, last_purchase) > 60`, [to]))
        .first(),

      // 7. Monthly active clients chart
      knex(`${masterTable} as mf`)
        .select(
          knex.raw("DATE_FORMAT(mf.Fecha, '%Y-%m') as month"),
          knex.raw("COUNT(DISTINCT mf.IdCliente) as count"),
          knex.raw(`ROUND(SUM(sf.Precio * sf.Cantidad), 2) as revenue`),
        )
        .innerJoin(`${slaveTable} as sf`, function () {
          this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
        })
        .whereBetween("mf.Fecha", [from, to])
        .andWhere("mf.Anulada", 0)
        .groupBy(knex.raw("DATE_FORMAT(mf.Fecha, '%Y-%m')"))
        .orderBy("month", "asc"),

      // 8. Waterfall retention
      (async () => {
        const [retained, lost, gained] = await Promise.all([
          knex(`${masterTable} as mf`)
            .countDistinct("mf.IdCliente as count")
            .whereBetween("mf.Fecha", [from, to])
            .andWhere("mf.Anulada", 0)
            .whereIn(
              "mf.IdCliente",
              knex(`${masterTable}`)
                .distinct("IdCliente")
                .whereBetween("Fecha", [prevPeriod.from, prevPeriod.to])
                .andWhere("Anulada", 0),
            )
            .first(),

          knex(`${masterTable}`)
            .countDistinct("IdCliente as count")
            .whereBetween("Fecha", [prevPeriod.from, prevPeriod.to])
            .andWhere("Anulada", 0)
            .whereNotIn(
              "IdCliente",
              knex(`${masterTable}`).distinct("IdCliente").whereBetween("Fecha", [from, to]).andWhere("Anulada", 0),
            )
            .first(),

          knex(`${masterTable}`)
            .countDistinct("IdCliente as count")
            .whereBetween("Fecha", [from, to])
            .andWhere("Anulada", 0)
            .whereNotIn(
              "IdCliente",
              knex(`${masterTable}`)
                .distinct("IdCliente")
                .whereBetween("Fecha", [prevPeriod.from, prevPeriod.to])
                .andWhere("Anulada", 0),
            )
            .first(),
        ]);

        return {
          retained: Number(retained?.count) || 0,
          lost: Number(lost?.count) || 0,
          gained: Number(gained?.count) || 0,
          previous: Number(retained?.count || 0) + Number(lost?.count || 0),
          current: Number(retained?.count || 0) + Number(gained?.count || 0),
        };
      })(),

      // 9. Inactive buckets
      knex
        .select(
          knex.raw(`
            CASE 
              WHEN days_since <= 7 THEN '0-7d'
              WHEN days_since <= 15 THEN '8-15d'
              WHEN days_since <= 30 THEN '16-30d'
              WHEN days_since <= 60 THEN '31-60d'
              WHEN days_since <= 90 THEN '61-90d'
              ELSE '>90d'
            END as bucket
          `),
          knex.raw("COUNT(*) as count"),
          knex.raw("ROUND(SUM(total_usd), 2) as revenue"),
        )
        .from(
          knex
            .select(
              "mf.IdCliente",
              knex.raw(`SUM(sf.Precio * sf.Cantidad) as total_usd`),
              knex.raw(`MAX(mf.Fecha) as last_purchase`),
              knex.raw(`DATEDIFF(?, MAX(mf.Fecha)) as days_since`, [to]),
            )
            .from(`${masterTable} as mf`)
            .innerJoin(`${slaveTable} as sf`, function () {
              this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
            })
            .where("mf.Fecha", "<=", to)
            .groupBy("mf.IdCliente")
            .as("inactive_data"),
        )
        .groupBy("bucket")
        .orderBy(knex.raw("MIN(days_since)"), "asc"),
    ]);

    res.status(200).json({
      kpis: {
        totalClients: Number(totalClientsRow?.total) || 0,
        activeClients: Number(activeClientsRow?.total) || 0,
        activePercent: totalClientsRow?.total
          ? Math.round((Number(activeClientsRow?.total) / Number(totalClientsRow?.total)) * 1000) / 10
          : 0,
        concentration,
        retention: {
          retainedRevenue: Number(retentionRow?.retained) || 0,
          prevPeriodRevenue: Number(retentionRow?.prevTotal) || 0,
          rate: Number(retentionRow?.rate) || 0,
        },
        avgFrequency: Number(frequencyRow?.avg_frequency) || 0,
        crossSellDepth: Number(crossSellRow?.avg_products) || 0,
        revenueAtRisk: {
          amount: Number(revenueAtRiskRow?.revenue_at_risk) || 0,
          clients: Number(revenueAtRiskRow?.clients_at_risk) || 0,
        },
      },
      monthlyActive: monthlyActive.map((r) => ({
        month: r.month,
        count: Number(r.count),
        revenue: Number(r.revenue),
      })),
      revenueBySegment,
      waterfall: waterfallRows,
      treemapTop50,
      abc,
      inactiveBuckets: inactiveBuckets.map((r) => ({
        bucket: r.bucket,
        count: Number(r.count),
        revenue: Number(r.revenue),
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_CLIENTS_DASHBOARD };
