const knex = require("../database");

const buildDashboardQuery = ({ masterTable, slaveTable, idInvoice, hasCompare }) => {
  // Statement 1 — KPIs del período actual
  const kpisCurrent = `
    SELECT 
      ROUND(SUM(s.rawProfit), 2) as totalRawProfit,
      ROUND(SUM(s.netProfit), 2) as totalNetProfit,
      ROUND(SUM(s.quantity), 3) as totalQuantity,
      COUNT(DISTINCT s.invoiceCount) as totalInvoices,
      ROUND(SUM(s.rawProfit) / NULLIF(COUNT(DISTINCT s.invoiceCount), 0), 2) as avgTicket,
      ROUND(AVG(s.averageProfitPercent), 2) as avgMarginPercent
    FROM (
      SELECT 
        SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad) as rawProfit,
        SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad) as netProfit,
        SUM(${slaveTable}.Cantidad) as quantity,
        ${masterTable}.${idInvoice} as invoiceCount,
        AVG((${slaveTable}.Precio - ${slaveTable}.Costo) / NULLIF(${slaveTable}.Precio, 0) * 100) as averageProfitPercent
      FROM ${slaveTable}
      INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
      WHERE ${masterTable}.Fecha BETWEEN :from AND :to
      GROUP BY ${masterTable}.${idInvoice}
    ) s`;

  // Statement 2 — Mejor vendedor (top 1 por total ventas)
  const bestEmployee = `
    SELECT 
      ${masterTable}.IdVend as id,
      vendedores.Empresa as name,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalSales
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN vendedores ON vendedores.idVend = ${masterTable}.IdVend
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY ${masterTable}.IdVend
    ORDER BY totalSales DESC
    LIMIT 1`;

  // Statement 3 — Top 30 productos por ganancia neta
  const topProducts = `
    SELECT 
      productos.Descripcion as product,
      ROUND(SUM(${slaveTable}.Cantidad), 3) as quantity,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit,
      ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit,
      ROUND(AVG((${slaveTable}.Precio - ${slaveTable}.Costo) / NULLIF(${slaveTable}.Precio, 0) * 100), 2) as averageProfitPercent
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN productos ON productos.IdProducto = ${slaveTable}.IdProducto
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY productos.IdProducto
    ORDER BY netProfit DESC
    LIMIT 30`;

  // Statement 4 — Top 30 clientes por utilidad neta
  const topClients = `
    SELECT 
      clientes.Empresa as client,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as total_USD,
      ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN clientes ON clientes.IdCliente = ${masterTable}.IdCliente
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY clientes.IdCliente
    ORDER BY netProfit DESC
    LIMIT 30`;

  // Statement 5 — KPIs comparativos
  const kpisCompare = hasCompare
    ? kpisCurrent.replaceAll(':from', ':compareFrom').replaceAll(':to', ':compareTo')
    : `SELECT NULL as totalRawProfit, NULL as totalNetProfit, NULL as totalQuantity, NULL as totalInvoices`;

  // Statement 6 — Gráfico de categorías (torta)
  const groupSales = `
    SELECT 
      grupos.Descripcion as categoria,
      ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit,
      ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit
    FROM ${slaveTable}
    INNER JOIN ${masterTable} ON ${masterTable}.${idInvoice} = ${slaveTable}.${idInvoice} AND ${masterTable}.Anulada = 0
    INNER JOIN productos ON productos.IdProducto = ${slaveTable}.IdProducto
    INNER JOIN grupos ON grupos.idGrupo = productos.Grupo
    WHERE ${masterTable}.Fecha BETWEEN :from AND :to
    GROUP BY grupos.idGrupo`;

  return [
    kpisCurrent,
    bestEmployee,
    topProducts,
    topClients,
    kpisCompare,
    groupSales,
  ].join(';');
};

const formatKpis = (currentResultSet, compareResultSet) => {
  const c = (currentResultSet && currentResultSet[0]) ? currentResultSet[0] : {};
  const p = (compareResultSet && compareResultSet[0]) ? compareResultSet[0] : {};

  return {
    totalRawProfit: Number(c.totalRawProfit) || 0,
    totalNetProfit: Number(c.totalNetProfit) || 0,
    totalQuantity: Number(c.totalQuantity) || 0,
    totalInvoices: Number(c.totalInvoices) || 0,
    avgTicket: Number(c.avgTicket) || 0,
    avgMarginPercent: Number(c.avgMarginPercent) || 0,
    compareRawProfit: p.totalRawProfit != null ? Number(p.totalRawProfit) : null,
    compareNetProfit: p.totalNetProfit != null ? Number(p.totalNetProfit) : null,
    compareQuantity: p.totalQuantity != null ? Number(p.totalQuantity) : null,
    compareInvoices: p.totalInvoices != null ? Number(p.totalInvoices) : null,
  };
};

const GET_DASHBOARD_SALES = async (req, res) => {
  const { from, to, compareFrom, compareTo } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  // Validar parámetros obligatorios
  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const hasCompare = !!(compareFrom && compareTo);

    // Construir SQL multi-statement con named bindings (:from, :to, :compareFrom, :compareTo)
    const sql = buildDashboardQuery({ masterTable, slaveTable, idInvoice, hasCompare });

    // Pasar solo los bindings que el SQL realmente usa
    const bindings = { from, to };
    if (hasCompare) {
      bindings.compareFrom = compareFrom;
      bindings.compareTo = compareTo;
    }

    // Una sola llamada a MySQL. knex reemplaza :from/:to/:compareFrom/:compareTo con ? + escaping.
    const [results] = await knex.raw(sql, bindings);

    // results es un array de arrays: results[0] = KPIs, results[1] = bestEmployee, etc.
    const response = {
      kpis: formatKpis(results[0], results[4]),
      bestEmployee: results[1][0] || null,
      topProducts: results[2] || [],
      topClients: results[3] || [],
      groupSalesChart: results[5] || [],
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_DASHBOARD_SALES };
