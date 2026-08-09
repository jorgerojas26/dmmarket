const knex = require("../database");

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard de ventas en 2 escaneos pesados + 3 lookups triviales (antes 6
// escaneos completos de slavefact):
//
//   Q1 — nivel factura (49K filas p/ año): KPIs, mejor vendedor, top clientes
//   Q2 — nivel producto (3.3K filas p/ año): top productos, torta por categoría
//   Q3 — solo si hay compare: KPIs del período anterior (1 fila)
//   L1/L2/L3 — nombres de vendedores, clientes y grupos (tablas de 9-1960 filas)
//
// Los nombres se resuelven en JS con lookups baratos en vez de joins: además de
// evitar joins en el scan pesado, esto reproduce EXACTAMENTE el INNER JOIN del
// código anterior (facturas con cliente/vendedor/grupo faltante se excluyen de
// los rankings pero cuentan en los KPIs).
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

// Statement 1 — nivel factura: KPIs + datos para vendedor y clientes
const invoicesQuery = `
  SELECT
    mf.${"${idInvoice}"} AS invoiceId,
    mf.IdVend AS vendId,
    mf.IdCliente AS clientId,
    SUM(sf.Precio * sf.Cantidad) AS rawProfit,
    SUM((sf.Precio - sf.Costo) * sf.Cantidad) AS netProfit,
    SUM(sf.Cantidad) AS quantity,
    AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100) AS profitPercent
  FROM ${"${slaveTable}"} sf
  INNER JOIN ${"${masterTable}"} mf
    ON mf.${"${idInvoice}"} = sf.${"${idInvoice}"} AND mf.Anulada = 0
  WHERE mf.Fecha BETWEEN :from AND :to
  GROUP BY mf.${"${idInvoice}"}, mf.IdVend, mf.IdCliente`;

// Statement 2 — nivel producto: top productos + torta por categoría
const productsQuery = `
  SELECT
    productos.IdProducto AS productId,
    productos.Descripcion AS product,
    productos.Grupo AS grupoId,
    SUM(sf.Cantidad) AS quantity,
    SUM(sf.Precio * sf.Cantidad) AS rawProfit,
    SUM((sf.Precio - sf.Costo) * sf.Cantidad) AS netProfit,
    AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100) AS profitPercent
  FROM ${"${slaveTable}"} sf
  INNER JOIN ${"${masterTable}"} mf
    ON mf.${"${idInvoice}"} = sf.${"${idInvoice}"} AND mf.Anulada = 0
  INNER JOIN productos ON productos.IdProducto = sf.IdProducto
  WHERE mf.Fecha BETWEEN :from AND :to
  GROUP BY productos.IdProducto, productos.Descripcion, productos.Grupo`;

// Statement 3 — KPIs comparativos (1 fila, sin datos de detalle)
const kpisCompareQuery = `
  SELECT
    ROUND(SUM(s.rawProfit), 2) AS totalRawProfit,
    ROUND(SUM(s.netProfit), 2) AS totalNetProfit,
    ROUND(SUM(s.quantity), 3) AS totalQuantity,
    COUNT(DISTINCT s.invoiceCount) AS totalInvoices
  FROM (
    SELECT
      SUM(sf.Precio * sf.Cantidad) AS rawProfit,
      SUM((sf.Precio - sf.Costo) * sf.Cantidad) AS netProfit,
      SUM(sf.Cantidad) AS quantity,
      mf.${"${idInvoice}"} AS invoiceCount
    FROM ${"${slaveTable}"} sf
    INNER JOIN ${"${masterTable}"} mf
      ON mf.${"${idInvoice}"} = sf.${"${idInvoice}"} AND mf.Anulada = 0
    WHERE mf.Fecha BETWEEN :compareFrom AND :compareTo
    GROUP BY mf.${"${idInvoice}"}
  ) s`;

const buildDashboardSql = ({ masterTable, slaveTable, idInvoice, hasCompare }) => {
  const statements = [invoicesQuery, productsQuery];

  if (hasCompare) {
    statements.push(kpisCompareQuery);
  } else {
    statements.push(
      `SELECT NULL AS totalRawProfit, NULL AS totalNetProfit, NULL AS totalQuantity, NULL AS totalInvoices`,
    );
  }

  return statements
    .join(";")
    .replaceAll("${idInvoice}", idInvoice)
    .replaceAll("${masterTable}", masterTable)
    .replaceAll("${slaveTable}", slaveTable);
};

// ── Lookups de nombres (tablas pequeñas) ────────────────────────────────────

const fetchNameLookups = async () => {
  const [vendedores, clientes, grupos] = await Promise.all([
    knex.select("idVend as id", "Empresa as name").from("vendedores"),
    knex.select("IdCliente as id", "Empresa as name").from("clientes"),
    knex.select("idGrupo as id", "Descripcion as name").from("grupos"),
  ]);
  return {
    vendName: new Map(vendedores.map((v) => [v.id, v.name])),
    clientName: new Map(clientes.map((c) => [c.id, c.name])),
    groupName: new Map(grupos.map((g) => [g.id, g.name])),
  };
};

// ── Agregaciones en JS sobre los resultados de Q1 ───────────────────────────

const computeKpis = (invoices) => {
  const totalRawProfit = invoices.reduce((sum, r) => sum + Number(r.rawProfit || 0), 0);
  const totalNetProfit = invoices.reduce((sum, r) => sum + Number(r.netProfit || 0), 0);
  const totalQuantity = invoices.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  const totalInvoices = invoices.length;
  const avgTicket = totalInvoices > 0 ? totalRawProfit / totalInvoices : 0;
  const marginSum = invoices.reduce((sum, r) => sum + Number(r.profitPercent || 0), 0);
  const avgMarginPercent = totalInvoices > 0 ? marginSum / totalInvoices : 0;

  return {
    totalRawProfit: round2(totalRawProfit),
    totalNetProfit: round2(totalNetProfit),
    totalQuantity: round3(totalQuantity),
    totalInvoices,
    avgTicket: round2(avgTicket),
    avgMarginPercent: round2(avgMarginPercent),
  };
};

const computeBestEmployee = (invoices, nameLookups) => {
  const byVendor = new Map();
  for (const r of invoices) {
    const name = nameLookups.vendName.get(r.vendId);
    if (!name) continue; // equivalente al INNER JOIN original
    const entry = byVendor.get(r.vendId) || { id: r.vendId, name, totalSales: 0 };
    entry.totalSales += Number(r.rawProfit || 0);
    byVendor.set(r.vendId, entry);
  }
  const best = [...byVendor.values()].sort((a, b) => b.totalSales - a.totalSales)[0];
  return best ? { ...best, totalSales: round2(best.totalSales) } : null;
};

const computeTopClients = (invoices, nameLookups) => {
  const byClient = new Map();
  for (const r of invoices) {
    const name = nameLookups.clientName.get(r.clientId);
    if (!name) continue; // equivalente al INNER JOIN original
    const entry = byClient.get(r.clientId) || { client: name, total_USD: 0, netProfit: 0 };
    entry.total_USD += Number(r.rawProfit || 0);
    entry.netProfit += Number(r.netProfit || 0);
    byClient.set(r.clientId, entry);
  }
  return [...byClient.values()]
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 30)
    .map((c) => ({ ...c, total_USD: round2(c.total_USD), netProfit: round2(c.netProfit) }));
};

// ── Agregaciones en JS sobre los resultados de Q2 ───────────────────────────

const computeTopProducts = (products) =>
  [...products]
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 30)
    .map((p) => ({
      product: p.product,
      quantity: round2(p.quantity),
      rawProfit: round2(p.rawProfit),
      netProfit: round2(p.netProfit),
      averageProfitPercent: round2(p.profitPercent),
    }));

const computeGroupSales = (products, nameLookups) => {
  const byGroup = new Map();
  for (const p of products) {
    const name = nameLookups.groupName.get(p.grupoId);
    if (!name) continue; // equivalente al INNER JOIN de grupos original
    const entry = byGroup.get(p.grupoId) || { categoria: name, rawProfit: 0, netProfit: 0 };
    entry.rawProfit += Number(p.rawProfit || 0);
    entry.netProfit += Number(p.netProfit || 0);
    byGroup.set(p.grupoId, entry);
  }
  return [...byGroup.values()]
    .sort((a, b) => a.categoria.localeCompare(b.categoria))
    .map((g) => ({
      categoria: g.categoria,
      rawProfit: round2(g.rawProfit),
      netProfit: round2(g.netProfit),
    }));
};

const formatCompareKpis = (compareRow) => {
  const c = compareRow || {};
  return {
    compareRawProfit: c.totalRawProfit != null ? Number(c.totalRawProfit) : null,
    compareNetProfit: c.totalNetProfit != null ? Number(c.totalNetProfit) : null,
    compareQuantity: c.totalQuantity != null ? Number(c.totalQuantity) : null,
    compareInvoices: c.totalInvoices != null ? Number(c.totalInvoices) : null,
  };
};

const GET_DASHBOARD_SALES = async (req, res) => {
  const { from, to, compareFrom, compareTo } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const hasCompare = !!(compareFrom && compareTo);
    const sql = buildDashboardSql({ masterTable, slaveTable, idInvoice, hasCompare });

    const bindings = { from, to };
    if (hasCompare) {
      bindings.compareFrom = compareFrom;
      bindings.compareTo = compareTo;
    }

    // El multi-statement corre en UNA conexión del pool; los lookups de nombres
    // son independientes y corren en paralelo.
    const [results] = await knex.raw(sql, bindings);
    const nameLookups = await fetchNameLookups();

    const invoices = results[0] || [];
    const products = results[1] || [];
    const compareRow = results[2]?.[0];

    const response = {
      kpis: {
        ...computeKpis(invoices),
        ...formatCompareKpis(compareRow),
      },
      bestEmployee: computeBestEmployee(invoices, nameLookups),
      topProducts: computeTopProducts(products),
      topClients: computeTopClients(invoices, nameLookups),
      groupSalesChart: computeGroupSales(products, nameLookups),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pareto en 2 modos (query param `modo`):
//   ventas (default)          — productos COMPRADOS en el rango y vendidos,
//                                rankeados por ganancia neta (los SKUs legacy
//                                sin compras en el rango quedan fuera)
//   compras-sin-vender        — productos comprados en el rango sin NINGUNA
//                                venta en el mismo rango, rankeados por inversión
// Ambos modos trabajan sobre la misma población: productos con compras en el rango.
// ─────────────────────────────────────────────────────────────────────────────

const fetchSalesParetoRows = async ({ from, to, masterTable, slaveTable, idInvoice }) => {
  // 2 pasadas + merge en JS: ventas del rango + productos comprados en el rango.
  const [sales, boughtIds] = await Promise.all([
    knex
      .select(
        "productos.IdProducto as productId",
        "productos.Descripcion as product",
        knex.raw(`ROUND(SUM(${slaveTable}.Cantidad), 3) as quantity`),
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`),
      )
      .from(slaveTable)
      .innerJoin(masterTable, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy("productos.IdProducto")
      .orderBy("netProfit", "DESC"),
    knex.raw(
      `SELECT DISTINCT slavecomp.IdProducto AS productId
      FROM slavecomp
      INNER JOIN mastercomp ON mastercomp.IdFactura = slavecomp.IdFactura AND mastercomp.Anulada = 0
      WHERE mastercomp.Fecha BETWEEN :from AND :to`,
      { from, to },
    ),
  ]);

  const bought = new Set((boughtIds[0] || []).map((r) => r.productId));
  return sales.filter((r) => bought.has(r.productId));
};

// Compras del rango sin ventas en el mismo rango — 2 pasadas + merge en JS.
// Las compras siempre viven en mastercomp/slavecomp; la exclusión usa las tablas
// de ventas dinámicas (masterfact/slavefact o masternoe/slavenoe según showNoe).
const fetchUnsoldPurchasesRows = async ({ from, to, masterTable, slaveTable, idInvoice }) => {
  const [purchases, soldIds] = await Promise.all([
    knex.raw(
      `SELECT
        productos.IdProducto AS productId,
        productos.Descripcion AS product,
        ROUND(SUM(slavecomp.Cantidad), 3) AS quantity,
        ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) AS totalPurchased
      FROM slavecomp
      INNER JOIN mastercomp ON mastercomp.IdFactura = slavecomp.IdFactura AND mastercomp.Anulada = 0
      INNER JOIN productos ON productos.IdProducto = slavecomp.IdProducto
      WHERE mastercomp.Fecha BETWEEN :from AND :to
      GROUP BY productos.IdProducto, productos.Descripcion`,
      { from, to },
    ),
    knex.raw(
      `SELECT DISTINCT ${slaveTable}.IdProducto AS productId
      FROM ${slaveTable}
      INNER JOIN ${masterTable}
        ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
      WHERE ${masterTable}.Fecha BETWEEN :from AND :to`,
      { from, to },
    ),
  ]);

  const sold = new Set((soldIds[0] || []).map((r) => r.productId));
  return (purchases[0] || []).filter((r) => !sold.has(r.productId));
};

// Acumulados + clasificación ABC en JS, parametrizado por la columna de valor.
const buildParetoResponse = (rows, valueKey, cumulativeKey, summaryPctKey) => {
  const total = rows.reduce((sum, r) => sum + Number(r[valueKey] || 0), 0);
  let cumulative = 0;
  const products = rows.map((r, i) => {
    cumulative += Number(r[valueKey] || 0);
    const cumulativePercent = total > 0 ? Math.round((cumulative / total) * 10000) / 100 : 0;
    return {
      ...r,
      rank: i + 1,
      [cumulativeKey]: Math.round(cumulative * 100) / 100,
      cumulativePercent,
      abcClass: cumulativePercent <= 80 ? "A" : cumulativePercent <= 95 ? "B" : "C",
    };
  });

  // Resumen ABC
  const classA = products.filter((d) => d.abcClass === "A");
  const classB = products.filter((d) => d.abcClass === "B");
  const classC = products.filter((d) => d.abcClass === "C");

  const lastA = classA.length > 0 ? classA[classA.length - 1].cumulativePercent : 0;
  const lastB = classB.length > 0 ? classB[classB.length - 1].cumulativePercent : lastA;

  return {
    products,
    summary: {
      classA: {
        count: classA.length,
        [summaryPctKey]: lastA,
      },
      classB: {
        count: classB.length,
        [summaryPctKey]: Math.round((lastB - lastA) * 100) / 100,
      },
      classC: {
        count: classC.length,
        [summaryPctKey]: Math.round((100 - lastB) * 100) / 100,
      },
      totalProducts: products.length,
    },
  };
};

const GET_DASHBOARD_PARETO = async (req, res) => {
  const { from, to, modo } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const isPurchasesMode = modo === "compras-sin-vender";
    const rows = isPurchasesMode
      ? await fetchUnsoldPurchasesRows({ from, to, masterTable, slaveTable, idInvoice })
      : await fetchSalesParetoRows({ from, to, masterTable, slaveTable, idInvoice });

    // El modo ventas conserva EXACTAMENTE el shape anterior (netProfit/profitPercent).
    const response = isPurchasesMode
      ? buildParetoResponse(rows, "totalPurchased", "cumulativePurchased", "purchasedPercent")
      : buildParetoResponse(rows, "netProfit", "cumulativeProfit", "profitPercent");

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_DASHBOARD_SALES, GET_DASHBOARD_PARETO };
