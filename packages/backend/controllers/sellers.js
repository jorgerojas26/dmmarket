const knex = require("../database");
const { reportId, identityKey, missingName, filterIdentity, searchText } = require("../utils/report-identity");

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const round1 = (value) => Math.round(Number(value || 0) * 10) / 10;
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const DAY_MS = 86400000;

const sellerIdExpr = (alias) =>
  `CASE WHEN ${alias}.IdVend IS NULL THEN '__none__' WHEN ${alias}.IdVend = '' THEN '__empty__' ELSE ${alias}.IdVend END`;

const displayId = (value) => (value === "__none__" ? null : value === "__empty__" ? "" : value);

const sellerName = (catalogByKey, sellerId) => {
  const name = catalogByKey.get(identityKey(sellerId))?.name?.trim();
  return name || missingName("Vendedor", displayId(reportId(sellerId)));
};

const getPreviousPeriod = (from, to) => {
  const days = Math.round((new Date(to) - new Date(from)) / DAY_MS);
  const prevFrom = new Date(from);
  prevFrom.setDate(prevFrom.getDate() - days);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);

  return {
    from: prevFrom.toISOString().split("T")[0],
    to: prevTo.toISOString().split("T")[0],
  };
};

const withSales = ({ masterTable, slaveTable, idInvoice, from, to }) =>
  knex(`${slaveTable} as sf`)
    .innerJoin(`${masterTable} as mf`, function () {
      this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
    })
    .whereBetween("mf.Fecha", [from, to]);

const fetchCatalog = () =>
  knex
    .select(
      "IdVend as sellerId",
      "Empresa as name",
      "Rif as rif",
      "Ci as ci",
      "Telfs as phone",
      "Email as email",
      "Status as status",
    )
    .from("vendedores");

const salesAmounts = (slaveTable) => [
  knex.raw(`ROUND(COALESCE(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 0), 2) as sales`),
  knex.raw(
    `ROUND(COALESCE(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 0), 2) as profit`,
  ),
];

const GET_SELLERS_DASHBOARD = async (req, res) => {
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const catalog = await fetchCatalog();
    const catalogByKey = new Map(catalog.map((seller) => [identityKey(seller.sellerId), seller]));

    const sellerMonths = await withSales({ masterTable, slaveTable, idInvoice, from, to })
      .select(
        knex.raw(`${sellerIdExpr("mf")} as sellerId`),
        knex.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m') AS CHAR) as month"),
        knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as invoiceCount`),
        knex.raw("MAX(mf.Fecha) as lastSale"),
        ...salesAmounts("sf"),
      )
      .groupBy(knex.raw(sellerIdExpr("mf")))
      .groupBy(knex.raw("DATE_FORMAT(mf.Fecha, '%Y-%m')"))
      .orderBy("month", "asc");

    const previousPeriod = getPreviousPeriod(from, to);
    const previousSellers = await withSales({
      masterTable,
      slaveTable,
      idInvoice,
      ...previousPeriod,
    })
      .select(
        knex.raw(`${sellerIdExpr("mf")} as sellerId`),
        knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as invoices`),
        ...salesAmounts("sf"),
      )
      .groupBy(knex.raw(sellerIdExpr("mf")));
    const previousByKey = new Map(previousSellers.map((row) => [identityKey(row.sellerId), row]));
    const previousSales = previousSellers.reduce((total, row) => total + Number(row.sales || 0), 0);

    const bySeller = new Map();
    const byMonth = new Map();
    for (const row of sellerMonths) {
      const key = identityKey(row.sellerId);
      const seller = bySeller.get(key) || {
        sellerId: reportId(row.sellerId),
        sales: 0,
        profit: 0,
        invoiceCount: 0,
        lastSale: null,
        lastSaleTime: 0,
      };
      seller.sales += Number(row.sales || 0);
      seller.profit += Number(row.profit || 0);
      seller.invoiceCount += Number(row.invoiceCount || 0);
      const lastSaleTime = row.lastSale ? new Date(row.lastSale).getTime() : 0;
      if (lastSaleTime > seller.lastSaleTime) {
        seller.lastSaleTime = lastSaleTime;
        seller.lastSale = row.lastSale;
      }
      bySeller.set(key, seller);

      const month = byMonth.get(row.month) || { month: row.month, sales: 0, invoiceCount: 0 };
      month.sales += Number(row.sales || 0);
      month.invoiceCount += Number(row.invoiceCount || 0);
      byMonth.set(row.month, month);
    }

    const ranking = [...bySeller.values()].map((row) => {
      const sales = round2(row.sales);
      const previousSalesRow = Number(previousByKey.get(identityKey(row.sellerId))?.sales || 0);
      return {
        sellerId: reportId(row.sellerId),
        name: sellerName(catalogByKey, row.sellerId),
        sales,
        profit: round2(row.profit),
        previousSales: round2(previousSalesRow),
        changePercent: previousSalesRow > 0 ? round2(((sales - previousSalesRow) / previousSalesRow) * 100) : null,
        invoiceCount: row.invoiceCount,
        lastSale: row.lastSale,
        marginPercent: row.sales > 0 ? round2((row.profit / row.sales) * 100) : 0,
        avgTicket: row.invoiceCount > 0 ? round2(row.sales / row.invoiceCount) : 0,
      };
    });
    const totalSales = sum(ranking, "sales");
    for (const row of ranking) {
      row.sharePercent = totalSales > 0 ? round2((row.sales / totalSales) * 100) : 0;
    }
    ranking.sort((a, b) => b.sales - a.sales);

    const activeKeys = new Set(ranking.map((row) => identityKey(row.sellerId)));
    const inactiveSellers = catalog
      .filter((seller) => !activeKeys.has(identityKey(seller.sellerId)))
      .map((seller) => ({
        sellerId: reportId(seller.sellerId),
        name: seller.name?.trim() || missingName("Vendedor", seller.sellerId),
        phone: seller.phone || null,
      }));

    const totalProfit = sum(ranking, "profit");
    const totalInvoices = sum(ranking, "invoiceCount");
    const teamMarginPercent = totalSales > 0 ? round2((totalProfit / totalSales) * 100) : 0;
    const endOfRange = new Date(to).getTime();
    const improvedSellers = ranking.filter((row) => row.sales > row.previousSales).length;
    const lowMarginSellers = ranking.filter((row) => row.marginPercent < teamMarginPercent).length;
    const staleSellers = ranking.filter(
      (row) => row.lastSale && (endOfRange - new Date(row.lastSale).getTime()) / DAY_MS > 30,
    ).length;

    res.status(200).json({
      kpis: {
        totalSellers: catalog.length,
        activeSellers: ranking.length,
        inactiveSellers: inactiveSellers.length,
        coveragePercent: catalog.length > 0 ? round2((ranking.length / catalog.length) * 100) : 0,
        totalSales: round2(totalSales),
        totalInvoices,
        avgSalesPerSeller: ranking.length > 0 ? round2(totalSales / ranking.length) : 0,
        avgInvoicesPerSeller: ranking.length > 0 ? round1(totalInvoices / ranking.length) : 0,
        marginPercent: teamMarginPercent,
        improvedSellers,
        staleSellers,
        lowMarginSellers,
        compareSales: round2(previousSales),
      },
      ranking,
      monthlyTrend: [...byMonth.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((row) => ({
          month: row.month,
          sales: round2(row.sales),
          invoiceCount: row.invoiceCount,
        })),
      inactiveSellers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener el dashboard de vendedores" });
  }
};

const GET_SELLERS_LIST = async (req, res) => {
  const { from, to, search, page = 1, limit = 20, sortBy = "sales", sortDir = "desc" } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const hasRange = !!(from && to);

  try {
    const catalog = await fetchCatalog();
    const catalogByKey = new Map(catalog.map((seller) => [identityKey(seller.sellerId), seller]));

    const query = knex(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .select(
        knex.raw(`${sellerIdExpr("mf")} as sellerId`),
        knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as invoiceCount`),
        knex.raw("COUNT(DISTINCT mf.IdCliente) as clientCount"),
        knex.raw("MAX(mf.Fecha) as lastSale"),
        ...salesAmounts("sf"),
      )
      .groupBy(knex.raw(sellerIdExpr("mf")));
    if (hasRange) query.whereBetween("mf.Fecha", [from, to]);
    const aggregates = await query;
    const aggregateByKey = new Map(aggregates.map((row) => [identityKey(row.sellerId), row]));

    const identities = new Map();
    for (const seller of catalog) {
      identities.set(identityKey(seller.sellerId), {
        sellerId: reportId(seller.sellerId),
        name: seller.name?.trim() || missingName("Vendedor", seller.sellerId),
        phone: seller.phone || null,
        invoiceCount: 0,
        clientCount: 0,
        lastSale: null,
        sales: 0,
        profit: 0,
      });
    }
    for (const [key, row] of aggregateByKey) {
      const current = identities.get(key);
      identities.set(key, {
        sellerId: reportId(row.sellerId),
        name: current?.name || sellerName(catalogByKey, row.sellerId),
        phone: current?.phone || null,
        invoiceCount: Number(row.invoiceCount || 0),
        clientCount: Number(row.clientCount || 0),
        lastSale: row.lastSale || null,
        sales: Number(row.sales || 0),
        profit: Number(row.profit || 0),
      });
    }

    const endOfRange = hasRange ? new Date(to).getTime() : Date.now();
    const rows = [...identities.values()]
      .filter(
        (row) =>
          !search ||
          searchText(row.name).includes(searchText(search)) ||
          searchText(row.sellerId).includes(searchText(search)),
      )
      .map((row) => ({
        ...row,
        sales: round2(row.sales),
        profit: round2(row.profit),
        marginPercent: row.sales > 0 ? round2((row.profit / row.sales) * 100) : 0,
        avgTicket: row.invoiceCount > 0 ? round2(row.sales / row.invoiceCount) : 0,
        daysInactive: row.lastSale
          ? Math.max(0, Math.round((endOfRange - new Date(row.lastSale).getTime()) / DAY_MS))
          : null,
      }));

    const totalSales = sum(rows, "sales");
    for (const row of rows) {
      row.sharePercent = totalSales > 0 ? round2((row.sales / totalSales) * 100) : 0;
    }

    const sortable = new Set([
      "sellerId",
      "name",
      "sales",
      "profit",
      "marginPercent",
      "invoiceCount",
      "clientCount",
      "avgTicket",
      "lastSale",
      "daysInactive",
      "sharePercent",
    ]);
    const sortColumn = sortable.has(sortBy) ? sortBy : "sales";
    const direction = String(sortDir).toLowerCase() === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const comparison = ["name", "sellerId", "lastSale"].includes(sortColumn)
        ? searchText(a[sortColumn]).localeCompare(searchText(b[sortColumn]))
        : Number(a[sortColumn] || 0) - Number(b[sortColumn] || 0);
      return comparison * direction || searchText(a.name).localeCompare(searchText(b.name));
    });

    res.status(200).json({
      data: rows.slice((pageNum - 1) * limitNum, pageNum * limitNum),
      total: rows.length,
      page: pageNum,
      limit: limitNum,
      totals: {
        sales: round2(totalSales),
        profit: round2(sum(rows, "profit")),
        invoiceCount: sum(rows, "invoiceCount"),
        clientCount: sum(rows, "clientCount"),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener el desglose de vendedores" });
  }
};

const GET_SELLER_SUMMARY = async (req, res) => {
  const { sellerId } = req.params;
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  const scope = (query) => filterIdentity(query, "mf.IdVend", sellerId);

  try {
    const previousPeriod = getPreviousPeriod(from, to);
    const [[totals], [previous], monthlyTrend, topClients, topProducts, catalog] = await Promise.all([
      withSales({ masterTable, slaveTable, idInvoice, from, to })
        .modify(scope)
        .select(
          knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as invoices`),
          knex.raw("COUNT(DISTINCT mf.IdCliente) as clients"),
          knex.raw("MAX(mf.Fecha) as lastSale"),
          ...salesAmounts("sf"),
        ),
      withSales({ masterTable, slaveTable, idInvoice, ...previousPeriod })
        .modify(scope)
        .select(knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as invoices`), ...salesAmounts("sf")),
      withSales({ masterTable, slaveTable, idInvoice, from, to })
        .modify(scope)
        .select(
          knex.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m') AS CHAR) as month"),
          knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as invoiceCount`),
          ...salesAmounts("sf"),
        )
        .groupBy(knex.raw("DATE_FORMAT(mf.Fecha, '%Y-%m')"))
        .orderBy("month", "asc"),
      withSales({ masterTable, slaveTable, idInvoice, from, to })
        .modify(scope)
        .leftJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
        .select(
          knex.raw(
            "CASE WHEN mf.IdCliente IS NULL THEN '__none__' WHEN mf.IdCliente = '' THEN '__empty__' ELSE mf.IdCliente END as clientId",
          ),
          knex.raw(
            "COALESCE(NULLIF(clientes.Empresa, ''), CONCAT('Cliente no registrado (', COALESCE(NULLIF(mf.IdCliente, ''), 'sin ID'), ')')) as name",
          ),
          knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as invoices`),
          ...salesAmounts("sf"),
        )
        .groupBy("mf.IdCliente")
        .orderBy("sales", "desc")
        .limit(10),
      withSales({ masterTable, slaveTable, idInvoice, from, to })
        .modify(scope)
        .leftJoin("productos", "productos.IdProducto", "sf.IdProducto")
        .select(
          knex.raw("sf.IdProducto as productId"),
          knex.raw(
            "COALESCE(NULLIF(productos.Descripcion, ''), MAX(NULLIF(sf.Descripcion, '')), CONCAT('Producto no registrado (', COALESCE(sf.IdProducto, 'sin ID'), ')')) as product",
          ),
          knex.raw("ROUND(SUM(sf.Cantidad), 3) as quantity"),
          ...salesAmounts("sf"),
        )
        .groupBy("sf.IdProducto", "productos.Descripcion")
        .orderBy("sales", "desc")
        .limit(10),
      fetchCatalog(),
    ]);

    const catalogEntry = catalog.find((seller) => identityKey(seller.sellerId) === identityKey(sellerId));
    const sales = Number(totals.sales || 0);
    const profit = Number(totals.profit || 0);

    res.status(200).json({
      seller: {
        sellerId: reportId(sellerId),
        name: catalogEntry?.name?.trim() || missingName("Vendedor", displayId(sellerId)),
        rif: catalogEntry?.rif || null,
        ci: catalogEntry?.ci || null,
        phone: catalogEntry?.phone || null,
        email: catalogEntry?.email || null,
        status: catalogEntry?.status || null,
      },
      totals: {
        sales: round2(sales),
        profit: round2(profit),
        marginPercent: sales > 0 ? round2((profit / sales) * 100) : 0,
        invoices: Number(totals.invoices || 0),
        clients: Number(totals.clients || 0),
        avgTicket: Number(totals.invoices || 0) > 0 ? round2(sales / Number(totals.invoices)) : 0,
        lastSale: totals.lastSale || null,
      },
      compare: {
        sales: Number(previous?.sales || 0),
        profit: Number(previous?.profit || 0),
        invoices: Number(previous?.invoices || 0),
      },
      monthlyTrend: monthlyTrend.map((row) => ({
        month: row.month,
        sales: round2(row.sales),
        invoiceCount: Number(row.invoiceCount || 0),
      })),
      topClients: topClients.map((row) => ({
        clientId: reportId(row.clientId),
        name: row.name,
        invoices: Number(row.invoices || 0),
        sales: round2(row.sales),
        profit: round2(row.profit),
      })),
      topProducts: topProducts.map((row) => ({
        productId: reportId(row.productId),
        product: row.product,
        quantity: Number(row.quantity || 0),
        sales: round2(row.sales),
        profit: round2(row.profit),
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener el detalle del vendedor" });
  }
};

const GET_SELLER_SALES = async (req, res) => {
  const { sellerId } = req.params;
  const { from, to, page = 1, limit = 20, search, sortBy = "fecha", sortDir = "desc" } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  const offset = (Number(page) - 1) * Number(limit);
  const sortColumns = {
    invoiceId: `mf.${idInvoice}`,
    fecha: "mf.Fecha",
    monto: "monto",
    utilidad: "utilidad",
  };
  const sortColumn = Object.hasOwn(sortColumns, sortBy) ? sortColumns[sortBy] : sortColumns.fecha;
  const direction = String(sortDir).toLowerCase() === "asc" ? "asc" : "desc";

  const withSearch = (query) => {
    if (search) {
      query.andWhere(function () {
        this.where(`mf.${idInvoice}`, "like", `%${search}%`)
          .orWhere("mf.Nombre", "like", `%${search}%`)
          .orWhere("mf.Rif", "like", `%${search}%`);
      });
    }
    return query;
  };
  const applyFilters = (query) => withSearch(query.modify((builder) => filterIdentity(builder, "mf.IdVend", sellerId)));

  const moneySelect = [
    knex.raw("ROUND(COALESCE(SUM(sf.Precio * sf.Cantidad), 0), 2) as monto"),
    knex.raw("ROUND(COALESCE(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 0), 2) as utilidad"),
  ];

  try {
    const countQuery = applyFilters(
      knex
        .countDistinct({ count: `mf.${idInvoice}` })
        .from(`${slaveTable} as sf`)
        .innerJoin(`${masterTable} as mf`, function () {
          this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
        })
        .whereBetween("mf.Fecha", [from, to]),
    );
    const dataQuery = applyFilters(
      withSales({ masterTable, slaveTable, idInvoice, from, to })
        .select(
          knex.raw(`mf.${idInvoice} as invoiceId`),
          knex.raw(
            "COALESCE(NULLIF(mf.Nombre, ''), CONCAT('Cliente no registrado (', COALESCE(NULLIF(mf.IdCliente, ''), 'sin ID'), ')')) as client",
          ),
          "mf.Rif as rif",
          "mf.Fecha as fecha",
          ...moneySelect,
        )
        .groupBy(`mf.${idInvoice}`)
        .orderBy(sortColumn, direction)
        .orderBy(`mf.${idInvoice}`, direction)
        .limit(Number(limit))
        .offset(Number(offset)),
    );
    const totalsQuery = applyFilters(
      withSales({ masterTable, slaveTable, idInvoice, from, to }).select(
        knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as totalInvoices`),
        ...moneySelect,
      ),
    );

    const [[{ count }], data, [totals]] = await Promise.all([countQuery, dataQuery, totalsQuery]);

    res.status(200).json({
      data: data.map((sale) => ({
        ...sale,
        monto: round2(sale.monto),
        utilidad: round2(sale.utilidad),
      })),
      totals: {
        monto: round2(totals.monto),
        utilidad: round2(totals.utilidad),
        invoiceCount: Number(totals.totalInvoices || 0),
      },
      total: Number(count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener las ventas del vendedor" });
  }
};

module.exports = {
  GET_SELLERS_DASHBOARD,
  GET_SELLERS_LIST,
  GET_SELLER_SUMMARY,
  GET_SELLER_SALES,
};
