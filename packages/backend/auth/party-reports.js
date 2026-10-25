const express = require("express");
const { reportId, filterIdentity, missingName } = require("../utils/report-identity");
const { parameters, salesBase, financialFields, listSales, dashboard, kpis } = require("./sales-reports");

function fail(status) {
  const error = new Error("La consulta de clientes o vendedores no está permitida.");
  error.status = status;
  throw error;
}

function requireCapability(access, capability) {
  const scope = access.scopeFor(capability);
  if (!scope.global && !scope.sellerIds.length) fail(403);
  return scope;
}

function identifier(value) {
  if (typeof value !== "string" || !/^[\p{L}\p{N}._-]{1,32}$/u.test(value)) fail(400);
  return value;
}

function sellerSalesScope(access) {
  const sellers = requireCapability(access, "sellers.read");
  const sales = requireCapability(access, "sales.read");
  if (sellers.global) return sales;
  if (sales.global) return sellers;
  const sellerIds = sellers.sellerIds.filter((id) => sales.sellerIds.includes(id));
  if (!sellerIds.length) fail(403);
  return { global: false, sellerIds };
}

function sellerColumns(transaction, access) {
  const scope = access.scopeFor("sellers.personal");
  const fields = { rif: "v.Rif", ci: "v.Ci", phone: "v.Telfs", email: "v.Email" };
  if (scope.global) return fields;
  if (!scope.sellerIds.length) return {};
  const placeholders = scope.sellerIds.map(() => "?").join(",");
  return Object.fromEntries(
    Object.entries(fields).map(([field, column]) => [
      field,
      transaction.raw(`CASE WHEN BINARY v.idVend IN (${placeholders}) THEN ?? END`, [...scope.sellerIds, column]),
    ]),
  );
}

function sellerRow(access, row, idKey) {
  if (access.canRecord("sellers.personal", row[idKey])) return row;
  const { rif, ci, phone, email, ...publicRow } = row;
  return publicRow;
}

async function directory(transaction, access, query, clients) {
  const scope = requireCapability(access, clients ? "clients.read" : "sellers.read");
  const normalized = { ...query };
  if (Object.hasOwn(normalized, "filter")) {
    if (Object.hasOwn(normalized, "search")) fail(400);
    normalized.search = normalized.filter;
    delete normalized.filter;
  }
  const options = parameters(normalized, {
    range: false,
    keys: ["search", "sortBy", "sortDir", ...(clients ? ["ruta"] : [])],
  });
  const source = transaction(clients ? "clientes as c" : "vendedores as v");
  const idColumn = clients ? "c.IdCliente" : "v.idVend";
  const nameColumn = clients ? "c.Empresa" : "v.Empresa";
  if (!scope.global) source.whereIn(transaction.raw("BINARY ??", [idColumn]), scope.sellerIds);
  if (options.search)
    source.where(function () {
      this.where(nameColumn, "like", `%${options.search}%`).orWhere(idColumn, "like", `%${options.search}%`);
    });
  if (clients && options.ruta) source.whereRaw("BINARY c.Ruta = ?", [options.ruta]);
  const personal = clients
    ? access.hasGlobal("clients.personal")
    : access.hasGlobal("sellers.personal") || (!scope.global && access.covers("sellers.personal", scope.sellerIds));
  const sort = {
    name: nameColumn,
    id: idColumn,
    ...(personal
      ? { rif: clients ? "c.Rif" : "v.Rif", ...(!clients ? { ci: "v.Ci", phone: "v.Telfs", email: "v.Email" } : {}) }
      : {}),
  };
  const sortBy = options.sortBy || "name";
  if (["rif", "ci", "phone", "email"].includes(sortBy) && !personal) fail(403);
  if (!Object.hasOwn(sort, sortBy)) fail(400);
  const rows = await source
    .select({
      [clients ? "IdCliente" : "id"]: idColumn,
      name: nameColumn,
      ...(clients ? (personal ? { rif: "c.Rif" } : {}) : sellerColumns(transaction, access)),
    })
    .orderBy(sort[sortBy], options.sortDir)
    .orderBy(idColumn)
    .limit(5001);
  if (rows.length > 5000) fail(413);
  return clients ? rows : rows.map((row) => sellerRow(access, row, "id"));
}

function canExportSellers(access, query) {
  const read = access.scopeFor("sellers.read");
  if (!read.global && !read.sellerIds.length) return false;
  return (
    access.hasGlobal("sellers.export") ||
    (query.employeeId
      ? access.canRecord("sellers.export", query.employeeId)
      : !read.global && access.covers("sellers.export", read.sellerIds))
  );
}

async function partyList(transaction, access, query, clients) {
  if (clients) requireCapability(access, "clients.read");
  const salesRead = access.scopeFor("sales.read");
  if (!salesRead.global && !salesRead.sellerIds.length) {
    const sort = clients ? { Empresa: "name", IdCliente: "id" } : { name: "name", sellerId: "id" };
    const sortBy = query.sortBy || (clients ? "Empresa" : "name");
    if (!Object.hasOwn(sort, sortBy) || query.employeeId) fail(403);
    const catalog = await directory(
      transaction,
      access,
      {
        search: query.search || "",
        ...(clients ? { ruta: query.ruta || "" } : {}),
        sortBy: sort[sortBy],
        sortDir: query.sortDir,
      },
      clients,
    );
    return {
      data: catalog
        .slice((query.page - 1) * query.limit, query.page * query.limit)
        .map(({ name, id, ...row }) => (clients ? { ...row, Empresa: name } : { ...row, sellerId: id, name })),
      total: catalog.length,
      page: query.page,
      limit: query.limit,
      totals: {},
      ...(!clients ? { exportAllowed: canExportSellers(access, query) } : {}),
    };
  }
  const scope = clients ? requireCapability(access, "sales.read") : sellerSalesScope(access);
  const { base, invoice } = salesBase(transaction, access, query);
  const idColumn = clients ? "mf.IdCliente" : "mf.IdVend";
  if (!scope.global) base.whereIn(transaction.raw("BINARY mf.IdVend"), scope.sellerIds);
  const financial = financialFields(access, query, scope);
  const aggregate = base
    .select({
      partyId: idColumn,
      sales: transaction.raw("SUM(sf.Precio * sf.Cantidad)"),
      invoices: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
      clients: transaction.raw("COUNT(DISTINCT BINARY mf.IdCliente)"),
      lastSale: transaction.raw("MAX(mf.Fecha)"),
      ...(financial ? { profit: transaction.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad)") } : {}),
    })
    .groupByRaw("BINARY ??", [idColumn]);
  const catalog = transaction(clients ? "clientes" : "vendedores").select({
    id: transaction.raw("BINARY ??", [clients ? "IdCliente" : "idVend"]),
  });
  if (!clients && query.employeeId) filterIdentity(catalog, transaction.raw("BINARY idVend"), query.employeeId);
  const readScope = clients ? access.scopeFor("clients.read") : access.scopeFor("sellers.read");
  if (!readScope.global) catalog.whereIn(transaction.raw("BINARY idVend"), readScope.sellerIds);
  const { base: historical } = salesBase(transaction, access, query);
  if (!scope.global) historical.whereIn(transaction.raw("BINARY mf.IdVend"), scope.sellerIds);
  const identities = catalog.union(historical.distinct({ id: transaction.raw("BINARY ??", [idColumn]) }));
  const source = transaction
    .from(identities.as("i"))
    .leftJoin(clients ? "clientes as c" : "vendedores as v", function () {
      const identity = clients ? "c.IdCliente" : "v.idVend";
      this.on(identity, "=", transaction.raw("CAST(i.id AS CHAR)")).andOn(
        transaction.raw("BINARY ?? = BINARY i.id", [identity]),
      );
    })
    .leftJoin(aggregate.as("a"), function () {
      this.on(transaction.raw("BINARY a.partyId <=> BINARY i.id"));
    });
  const nameColumn = clients ? "c.Empresa" : "v.Empresa";
  const name = transaction.raw("CAST(COALESCE(NULLIF(??, ''), CONCAT(?, COALESCE(i.id, 'sin ID'), ')')) AS CHAR)", [
    nameColumn,
    clients ? "Cliente no registrado (" : "Vendedor no registrado (",
  ]);
  if (query.search)
    source.where(function () {
      this.where(nameColumn, "like", `%${query.search}%`).orWhere("i.id", "like", `%${query.search}%`);
    });
  if (clients && query.ruta) source.whereRaw("BINARY c.Ruta = ?", [query.ruta]);
  const raw = (sql) => transaction.raw(sql);
  const amount = raw("ROUND(COALESCE(a.sales, 0), 2)");
  const profit = raw("ROUND(COALESCE(a.profit, 0), 2)");
  const count = raw("COALESCE(a.invoices, 0)");
  const sort = clients
    ? {
        IdCliente: transaction.raw("CAST(i.id AS CHAR)"),
        Empresa: name,
        total_ventas: amount,
        num_ventas: count,
        last_factura: "a.lastSale",
        ...(financial ? { utilidad: profit } : {}),
      }
    : {
        sellerId: transaction.raw("CAST(i.id AS CHAR)"),
        name,
        sales: amount,
        invoiceCount: count,
        clientCount: raw("COALESCE(a.clients, 0)"),
        lastSale: "a.lastSale",
        ...(financial ? { profit, marginPercent: raw("COALESCE(a.profit / NULLIF(a.sales, 0) * 100, 0)") } : {}),
      };
  const sortBy = query.sortBy || (clients ? "total_ventas" : "sales");
  if (["profit", "utilidad", "marginPercent"].includes(sortBy) && !financial) fail(403);
  if (!Object.hasOwn(sort, sortBy)) fail(400);
  const [{ total }] = await source.clone().count("* as total");
  const selected = clients
    ? {
        IdCliente: transaction.raw("CAST(i.id AS CHAR)"),
        Empresa: name,
        total_ventas: amount,
        num_ventas: count,
        last_factura: "a.lastSale",
        ...(access.hasGlobal("clients.personal") ? { rif: "c.Rif" } : {}),
        ...(financial ? { utilidad: profit } : {}),
      }
    : {
        sellerId: transaction.raw("CAST(i.id AS CHAR)"),
        name,
        sales: amount,
        invoiceCount: count,
        clientCount: raw("COALESCE(a.clients, 0)"),
        lastSale: "a.lastSale",
        daysInactive: transaction.raw("DATEDIFF(?, a.lastSale)", [query.to]),
        avgTicket: raw("ROUND(COALESCE(a.sales / NULLIF(a.invoices, 0), 0), 2)"),
        ...sellerColumns(transaction, access),
        ...(financial
          ? { profit, marginPercent: raw("ROUND(COALESCE(a.profit / NULLIF(a.sales, 0) * 100, 0), 2)") }
          : {}),
      };
  const rows = await source
    .clone()
    .select(selected)
    .orderBy(sort[sortBy], query.sortDir)
    .orderBy("i.id")
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  const totals = await source
    .clone()
    .select({
      [clients ? "total_ventas" : "sales"]: raw("ROUND(COALESCE(SUM(a.sales), 0), 2)"),
      [clients ? "num_ventas" : "invoiceCount"]: raw("COALESCE(SUM(a.invoices), 0)"),
      ...(financial ? { [clients ? "utilidad" : "profit"]: raw("ROUND(COALESCE(SUM(a.profit), 0), 2)") } : {}),
    })
    .first();
  const identified = rows.map((row) => ({
    ...row,
    ...(!clients
      ? {
          sharePercent:
            Number(totals.sales) > 0 ? Math.round((Number(row.sales) / Number(totals.sales)) * 10000) / 100 : null,
        }
      : {}),
    [clients ? "IdCliente" : "sellerId"]: reportId(row[clients ? "IdCliente" : "sellerId"]),
  }));
  return {
    data: clients ? identified : identified.map((row) => sellerRow(access, row, "sellerId")),
    total: Number(total),
    page: query.page,
    limit: query.limit,
    totals,
    ...(!clients ? { exportAllowed: canExportSellers(access, query) } : {}),
  };
}

async function clientSummary(transaction, access, query, id) {
  requireCapability(access, "clients.read");
  const filtered = { ...query, clientId: identifier(id) };
  const summary = await kpis(transaction, access, filtered);
  const { base } = salesBase(transaction, access, filtered);
  const dates = await base
    .distinct({ date: transaction.raw("DATE_FORMAT(mf.Fecha, '%Y-%m-%d')") })
    .orderBy("date")
    .limit(368);
  let avgDaysBetweenSales = null;
  if (dates.length > 1)
    avgDaysBetweenSales =
      Math.round(((Date.parse(dates.at(-1).date) - Date.parse(dates[0].date)) / 86400000 / (dates.length - 1)) * 10) /
      10;
  return {
    totalAmount: summary.totalRawProfit,
    totalCount: summary.totalInvoices,
    avgTicket: summary.totalInvoices ? summary.avgTicket : null,
    avgDaysBetweenSales,
    dailySales: await base
      .clone()
      .select({
        fecha: transaction.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m-%d') AS CHAR)"),
        monto: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad),2)"),
      })
      .groupByRaw("DATE_FORMAT(mf.Fecha, '%Y-%m-%d')")
      .orderBy("fecha")
      .limit(368),
  };
}

async function sellerSummary(transaction, access, query, id) {
  identifier(id);
  if (
    ["__none__", "__empty__"].includes(id) ? !access.hasGlobal("sellers.read") : !access.canRecord("sellers.read", id)
  )
    fail(403);
  requireCapability(access, "sales.read");
  const sellerQuery = transaction("vendedores as v");
  filterIdentity(sellerQuery, transaction.raw("BINARY v.idVend"), id);
  let seller = await sellerQuery
    .select({ sellerId: "v.idVend", name: "v.Empresa", ...sellerColumns(transaction, access) })
    .first();
  if (!seller) {
    const { base } = salesBase(transaction, access, { ...query, employeeId: id });
    if (!(await base.clone().first("mf.IdVend"))) fail(404);
    seller = { sellerId: id, name: missingName("Vendedor", ["__none__", "__empty__"].includes(id) ? null : id) };
  }
  const span = Date.parse(query.to) - Date.parse(query.from) + 86400000;
  const compareFrom = new Date(Date.parse(query.from) - span).toISOString().slice(0, 10);
  const compareTo = new Date(Date.parse(query.from) - 86400000).toISOString().slice(0, 10);
  const filtered = { ...query, employeeId: id, compareFrom, compareTo };
  const result = await dashboard(transaction, access, filtered);
  const { base, invoice } = salesBase(transaction, access, filtered);
  const counts = await base.clone().countDistinct({ clients: "mf.IdCliente" }).max({ lastSale: "mf.Fecha" }).first();
  const trend = await base
    .clone()
    .select({
      month: transaction.raw("DATE_FORMAT(mf.Fecha, '%Y-%m')"),
      sales: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      invoiceCount: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
    })
    .groupByRaw("DATE_FORMAT(mf.Fecha, '%Y-%m')")
    .orderBy("month");
  const k = result.kpis;
  const financial = Object.hasOwn(k, "totalNetProfit");
  return {
    seller: sellerRow(access, seller, "sellerId"),
    totals: {
      sales: k.totalRawProfit,
      invoices: k.totalInvoices,
      clients: Number(counts.clients),
      avgTicket: k.avgTicket,
      lastSale: counts.lastSale,
      ...(financial
        ? {
            profit: k.totalNetProfit,
            marginPercent: k.totalRawProfit ? Math.round((k.totalNetProfit / k.totalRawProfit) * 10000) / 100 : 0,
          }
        : {}),
    },
    compare: {
      sales: k.compareRawProfit,
      invoices: k.compareInvoices,
      ...(financial ? { profit: k.compareNetProfit } : {}),
    },
    monthlyTrend: trend,
    topClients: result.topClients.map((row) => ({
      clientId: row.clientId,
      name: row.client,
      sales: row.total_USD,
      invoices: row.invoiceCount,
      ...(financial ? { profit: row.netProfit } : {}),
    })),
    topProducts: result.topProducts.map((row) => ({
      productId: row.productId,
      product: row.product,
      quantity: row.quantity,
      sales: row.rawProfit,
      ...(financial ? { profit: row.netProfit } : {}),
    })),
  };
}

async function sellerDashboard(transaction, access, query) {
  const scope = sellerSalesScope(access);
  const load = async (range) => {
    const result = await partyList(
      transaction,
      access,
      { ...range, page: 1, limit: 5001, sortBy: "sales", sortDir: "desc" },
      false,
    );
    if (result.total > 5000) fail(413);
    return result;
  };
  const span = Date.parse(query.to) - Date.parse(query.from) + 86400000;
  const previousRange = {
    from: new Date(Date.parse(query.from) - span).toISOString().slice(0, 10),
    to: new Date(Date.parse(query.from) - 86400000).toISOString().slice(0, 10),
  };
  parameters(previousRange);
  const current = await load(query);
  const previous = await load({ ...query, ...previousRange });
  const financial = Object.hasOwn(current.totals, "profit");
  const round = (value) => Math.round(value * 100) / 100;
  const totalSales = Number(current.totals.sales);
  const totalInvoices = Number(current.totals.invoiceCount);
  const marginPercent = financial && totalSales ? round((Number(current.totals.profit) / totalSales) * 100) : 0;
  const previousById = new Map(previous.data.map((row) => [row.sellerId, row]));
  const ranking = current.data
    .filter((row) => Number(row.invoiceCount) > 0)
    .map((row) => {
      const sales = Number(row.sales);
      const previousSales = Number(previousById.get(row.sellerId)?.sales || 0);
      return {
        sellerId: row.sellerId,
        name: row.name,
        sales,
        previousSales,
        changePercent: previousSales ? round(((sales - previousSales) / previousSales) * 100) : null,
        invoiceCount: Number(row.invoiceCount),
        lastSale: row.lastSale,
        daysInactive: row.daysInactive == null ? null : Number(row.daysInactive),
        avgTicket: Number(row.avgTicket),
        sharePercent: totalSales ? round((sales / totalSales) * 100) : 0,
        ...(financial ? { profit: Number(row.profit), marginPercent: Number(row.marginPercent) } : {}),
      };
    });
  const inactiveSellers = current.data
    .filter((row) => !Number(row.invoiceCount))
    .map((row) => ({
      sellerId: row.sellerId,
      name: row.name,
      ...(Object.hasOwn(row, "phone") ? { phone: row.phone } : {}),
    }));
  const { base, invoice } = salesBase(transaction, access, query);
  if (!scope.global) base.whereIn(transaction.raw("BINARY mf.IdVend"), scope.sellerIds);
  const trend = await base
    .select({
      month: transaction.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m') AS CHAR)"),
      sales: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      invoiceCount: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
    })
    .groupByRaw("DATE_FORMAT(mf.Fecha, '%Y-%m')")
    .orderBy("month");
  return {
    kpis: {
      totalSellers: current.total,
      activeSellers: ranking.length,
      inactiveSellers: inactiveSellers.length,
      coveragePercent: current.total ? round((ranking.length / current.total) * 100) : 0,
      totalSales,
      totalInvoices,
      avgSalesPerSeller: ranking.length ? round(totalSales / ranking.length) : 0,
      avgInvoicesPerSeller: ranking.length ? round(totalInvoices / ranking.length) : 0,
      compareSales: Number(previous.totals.sales),
      improvedSellers: ranking.filter((row) => row.sales > row.previousSales).length,
      staleSellers: ranking.filter((row) => row.daysInactive > 30).length,
      ...(financial
        ? { marginPercent, lowMarginSellers: ranking.filter((row) => row.marginPercent < marginPercent).length }
        : {}),
    },
    ranking,
    monthlyTrend: trend.map((row) => ({
      month: row.month,
      sales: Number(row.sales),
      invoiceCount: Number(row.invoiceCount),
    })),
    inactiveSellers,
  };
}

function createPartyReports({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      const result = await sessions.withSession(req.sessionID, {}, async ({ transaction, access }) =>
        work(transaction, access, parameters(req.query, options), req.params),
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
  const catalog = (clients) => async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, {}, ({ transaction, access }) =>
          directory(transaction, access, req.query, clients),
        ),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get("/clients", catalog(true));
  router.get("/employees", catalog(false));
  const listKeys = ["from", "to", "showNoe", "page", "limit", "sortBy", "sortDir", "search", "ruta", "employeeId"];
  router.get(
    "/clients/list",
    handle((transaction, access, query) => partyList(transaction, access, query, true), { keys: listKeys }),
  );
  router.get(
    "/sellers/list",
    handle((transaction, access, query) => partyList(transaction, access, query, false), {
      keys: listKeys.filter((key) => key !== "ruta"),
    }),
  );
  const summaryKeys = ["from", "to", "showNoe"];
  router.get("/sellers/dashboard", handle(sellerDashboard, { keys: [...summaryKeys, "employeeId"] }));
  router.get(
    "/clients/:clientId/summary",
    handle((transaction, access, query, params) => clientSummary(transaction, access, query, params.clientId), {
      keys: summaryKeys,
    }),
  );
  router.get(
    "/sellers/:sellerId/summary",
    handle((transaction, access, query, params) => sellerSummary(transaction, access, query, params.sellerId), {
      keys: summaryKeys,
    }),
  );
  router.get(
    "/clients/:clientId/sales",
    handle(async (transaction, access, query, params) => {
      requireCapability(access, "clients.read");
      const result = await listSales(
        transaction,
        access,
        {
          ...query,
          clientId: identifier(params.clientId),
          sortBy: query.sortBy === "idFactura" ? "invoiceId" : query.sortBy,
        },
        "invoices",
      );
      return {
        data: result.data.map(({ invoiceId, ...row }) => ({ idFactura: invoiceId, ...row })),
        total: result.pagination.total,
        exportAllowed: result.exportAllowed,
        page: query.page,
        limit: query.limit,
        totals: result.totals,
      };
    }),
  );
  router.get(
    "/sellers/:sellerId/sales",
    handle(async (transaction, access, query, params) => {
      const id = identifier(params.sellerId);
      if (
        ["__none__", "__empty__"].includes(id)
          ? !access.hasGlobal("sellers.read")
          : !access.canRecord("sellers.read", id)
      )
        fail(403);
      const result = await listSales(transaction, access, { ...query, employeeId: id }, "invoices");
      return {
        data: result.data.map(({ cliente, ...row }) => ({ ...row, client: cliente })),
        total: result.pagination.total,
        exportAllowed: result.exportAllowed,
        page: query.page,
        limit: query.limit,
        totals: { ...result.totals, invoiceCount: result.pagination.total },
      };
    }),
  );
  router.get(
    "/clients/best",
    handle(
      async (transaction, access, query) => {
        requireCapability(access, "clients.read");
        const { base } = salesBase(transaction, access, query);
        const rows = await base
          .select({
            client: transaction.raw(
              "COALESCE(c.Empresa, CONCAT('Cliente no registrado (', COALESCE(mf.IdCliente, 'sin ID'), ')'))",
            ),
            total_USD: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
          })
          .groupBy("mf.IdCliente", "c.Empresa")
          .orderBy("total_USD", "desc")
          .limit(5001);
        if (rows.length > 5000) fail(413);
        return rows;
      },
      { keys: ["from", "to", "showNoe", "ruta", "employeeId"] },
    ),
  );
  return router;
}

module.exports = { createPartyReports, sellerSalesScope, partyList, canExportSellers };
