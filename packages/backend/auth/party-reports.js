const { withReportCache } = require("./report-cache");
const express = require("express");
const { Types } = require("mysql2");
const { exactKey, groupRows, sumValues, roundAmount, formatAmount, descendingAmount } = require("./report-aggregation");
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
  const financial = financialFields(access, query, scope);
  const allowed = clients
    ? ["IdCliente", "Empresa", "total_ventas", "num_ventas", "last_factura", ...(financial ? ["utilidad"] : [])]
    : [
        "sellerId",
        "name",
        "sales",
        "invoiceCount",
        "clientCount",
        "lastSale",
        ...(financial ? ["profit", "marginPercent"] : []),
      ];
  const sortBy = query.sortBy || (clients ? "total_ventas" : "sales");
  if (["profit", "utilidad", "marginPercent"].includes(sortBy) && !financial) fail(403);
  if (!allowed.includes(sortBy)) fail(400);
  const idColumn = clients ? "c.IdCliente" : "v.idVend";
  const nameColumn = clients ? "c.Empresa" : "v.Empresa";
  const personal = clients
    ? access.hasGlobal("clients.personal")
      ? { rif: "c.Rif" }
      : {}
    : sellerColumns(transaction, access);
  const pattern = `%${query.search || ""}%`;
  const catalogQuery = transaction(clients ? "clientes as c" : "vendedores as v");
  const read = access.scopeFor(clients ? "clients.read" : "sellers.read");
  if (!read.global) catalogQuery.whereIn(transaction.raw("BINARY ??", [idColumn]), read.sellerIds);
  if (!clients && query.employeeId)
    filterIdentity(catalogQuery, transaction.raw("BINARY ??", [idColumn]), query.employeeId);
  if (clients && query.ruta) catalogQuery.whereRaw("BINARY c.Ruta = ?", [query.ruta]);
  const catalog = await catalogQuery.select({
    id: idColumn,
    name: nameColumn,
    matches: transaction.raw("(?? LIKE ? OR BINARY ?? LIKE ?)", [nameColumn, pattern, idColumn, pattern]),
    ...personal,
  });
  const { base, invoice } = salesBase(transaction, access, query, { clients: false, sellers: false, products: false });
  if (!scope.global) base.whereIn(transaction.raw("BINARY mf.IdVend"), scope.sellerIds);
  const partyId = clients ? "mf.IdCliente" : "mf.IdVend";
  const aggregateQuery = base
    .select({
      id: partyId,
      sales: transaction.raw("SUM(sf.Precio * sf.Cantidad)"),
      invoices: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
      clients: transaction.raw("COUNT(DISTINCT BINARY mf.IdCliente)"),
      lastSale: transaction.raw("MAX(mf.Fecha)"),
      daysInactive: transaction.raw("DATEDIFF(?, MAX(mf.Fecha))", [query.to]),
      matches: transaction.raw("BINARY ?? LIKE ?", [partyId, pattern]),
      ...(financial ? { profit: transaction.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad)") } : {}),
    })
    .groupByRaw("BINARY ??", [partyId])
    .toSQL();
  const [aggregates, fields] = await transaction.raw(aggregateQuery.sql, aggregateQuery.bindings);
  const decimalAmounts =
    !transaction.client.config.connection.decimalNumbers &&
    [Types.DECIMAL, Types.NEWDECIMAL].includes(fields.find((field) => field.name === "sales")?.columnType);
  const money = (value) => formatAmount(value, decimalAmounts);
  const cohort = new Map(catalog.map((row) => [exactKey(row.id), { id: row.id, catalog: row }]));
  for (const aggregate of aggregates) {
    const key = exactKey(aggregate.id);
    const row = cohort.get(key) || { id: aggregate.id };
    row.aggregate = aggregate;
    cohort.set(key, row);
  }
  const matches = [...cohort.values()].filter(
    (row) => !query.search || Number(row.catalog?.matches) || Number(row.aggregate?.matches),
  );
  const totals = {
    [clients ? "total_ventas" : "sales"]: money(
      sumValues(
        matches.map((row) => row.aggregate || {}),
        "sales",
      ),
    ),
    [clients ? "num_ventas" : "invoiceCount"]: matches.reduce(
      (total, row) => total + Number(row.aggregate?.invoices || 0),
      0,
    ),
    ...(financial
      ? {
          [clients ? "utilidad" : "profit"]: money(
            sumValues(
              matches.map((row) => row.aggregate || {}),
              "profit",
            ),
          ),
        }
      : {}),
  };
  const projected = matches.map((record) => {
    const rawId = record.id == null ? null : String(record.id);
    const aggregate = record.aggregate || {};
    const amount = sumValues([aggregate], "sales");
    const profit = financial ? sumValues([aggregate], "profit") : null;
    const sales = roundAmount(amount);
    const invoices = Number(aggregate.invoices || 0);
    const name = record.catalog?.name?.trim()
      ? record.catalog.name
      : `${clients ? "Cliente" : "Vendedor"} no registrado (${rawId ?? "sin ID"})`;
    const margin = amount && !amount.isZero() && profit ? profit.div(amount).times(100) : 0;
    const contacts = Object.fromEntries(Object.keys(personal).map((field) => [field, record.catalog?.[field] ?? null]));
    const row = clients
      ? {
          IdCliente: reportId(rawId),
          Empresa: name,
          total_ventas: money(amount),
          num_ventas: invoices,
          last_factura: aggregate.lastSale ?? null,
          ...contacts,
          ...(financial ? { utilidad: money(profit) } : {}),
        }
      : {
          sellerId: reportId(rawId),
          name,
          sales: money(amount),
          invoiceCount: invoices,
          clientCount: Number(aggregate.clients || 0),
          lastSale: aggregate.lastSale ?? null,
          daysInactive: aggregate.daysInactive == null ? null : Number(aggregate.daysInactive),
          avgTicket: money(amount && invoices ? amount.div(invoices) : 0),
          ...contacts,
          ...(financial ? { profit: money(profit), marginPercent: money(margin) } : {}),
          sharePercent: totals.sales > 0 ? Math.round((sales / totals.sales) * 10000) / 100 : null,
        };
    return {
      id: rawId,
      data: clients ? row : sellerRow(access, row, "sellerId"),
      sortValue: sortBy === "marginPercent" ? margin : row[sortBy],
    };
  });
  const compareIds = (first, second) =>
    first == null
      ? second == null
        ? 0
        : -1
      : second == null
        ? 1
        : Buffer.compare(Buffer.from(String(first)), Buffer.from(String(second)));
  projected.sort((first, second) => {
    let compared;
    if (["IdCliente", "sellerId"].includes(sortBy)) compared = compareIds(first.id, second.id);
    else if (["Empresa", "name"].includes(sortBy))
      compared = String(first.sortValue).localeCompare(String(second.sortValue), "en", { sensitivity: "base" });
    else if (["last_factura", "lastSale"].includes(sortBy))
      compared = descendingAmount(
        second.sortValue == null ? null : Date.parse(second.sortValue),
        first.sortValue == null ? null : Date.parse(first.sortValue),
      );
    else compared = descendingAmount(second.sortValue, first.sortValue);
    return (query.sortDir === "desc" ? -compared : compared) || compareIds(first.id, second.id);
  });
  return {
    data: projected.slice((query.page - 1) * query.limit, query.page * query.limit).map((row) => row.data),
    total: projected.length,
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
  const financial = financialFields(access, query, scope);
  const catalogQuery = transaction("vendedores as v");
  const read = access.scopeFor("sellers.read");
  if (!read.global) catalogQuery.whereIn(transaction.raw("BINARY v.idVend"), read.sellerIds);
  if (query.employeeId) filterIdentity(catalogQuery, transaction.raw("BINARY v.idVend"), query.employeeId);
  const catalog = await catalogQuery
    .select({ sellerId: "v.idVend", name: "v.Empresa", ...sellerColumns(transaction, access) })
    .orderByRaw("BINARY v.idVend")
    .limit(5001);
  if (catalog.length > 5000) fail(413);
  const span = Date.parse(query.to) - Date.parse(query.from) + 86400000;
  const previousRange = {
    from: new Date(Date.parse(query.from) - span).toISOString().slice(0, 10),
    to: new Date(Date.parse(query.from) - 86400000).toISOString().slice(0, 10),
  };
  parameters(previousRange);
  const load = (range, monthly) => {
    const { base, invoice } = salesBase(transaction, access, range, {
      clients: false,
      sellers: false,
      products: false,
    });
    if (!scope.global) base.whereIn(transaction.raw("BINARY mf.IdVend"), scope.sellerIds);
    base
      .select({
        sellerId: "mf.IdVend",
        sales: transaction.raw("SUM(sf.Precio * sf.Cantidad)"),
        invoiceCount: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
        lastSale: transaction.raw("MAX(mf.Fecha)"),
        daysInactive: transaction.raw("DATEDIFF(?, MAX(mf.Fecha))", [query.to]),
        ...(financial ? { profit: transaction.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad)") } : {}),
      })
      .groupByRaw("BINARY mf.IdVend");
    if (monthly)
      base
        .select({ month: transaction.raw("CAST(DATE_FORMAT(mf.Fecha, '%Y-%m') AS CHAR)") })
        .groupByRaw("DATE_FORMAT(mf.Fecha, '%Y-%m')");
    return base;
  };
  const current = await load(query, true);
  const previous = await load({ ...query, ...previousRange }, false);
  const catalogById = new Map(catalog.map((row) => [exactKey(row.sellerId), sellerRow(access, row, "sellerId")]));
  const currentGroups = groupRows(current, "sellerId");
  const previousById = new Map(previous.map((row) => [exactKey(row.sellerId), row]));
  const cohort = new Map(catalogById);
  for (const rows of currentGroups)
    if (!cohort.has(exactKey(rows[0].sellerId))) cohort.set(exactKey(rows[0].sellerId), { sellerId: rows[0].sellerId });
  if (cohort.size > 5000 || new Set([...catalogById.keys(), ...previousById.keys()]).size > 5000) fail(413);
  const totalSales = roundAmount(sumValues(current, "sales"));
  const totalProfit = financial ? roundAmount(sumValues(current, "profit")) : null;
  const totalInvoices = current.reduce((total, row) => total + Number(row.invoiceCount), 0);
  const round = (value) => Math.round(value * 100) / 100;
  const nameFor = (id) => {
    const name = catalogById.get(exactKey(id))?.name;
    return name?.trim() ? name : `Vendedor no registrado (${id ?? "sin ID"})`;
  };
  const ranking = currentGroups
    .map((rows) => {
      const sellerId = rows[0].sellerId;
      const amount = sumValues(rows, "sales");
      const profit = financial ? sumValues(rows, "profit") : null;
      const sales = roundAmount(amount);
      const previousSales = roundAmount(previousById.get(exactKey(sellerId))?.sales);
      const invoiceCount = rows.reduce((total, row) => total + Number(row.invoiceCount), 0);
      const latest = rows.reduce(
        (last, row) => (!last || (row.lastSale && Date.parse(row.lastSale) > Date.parse(last.lastSale)) ? row : last),
        null,
      );
      return {
        sellerId: reportId(sellerId),
        name: nameFor(sellerId),
        sales,
        previousSales,
        changePercent: previousSales ? round(((sales - previousSales) / previousSales) * 100) : null,
        invoiceCount,
        lastSale: latest?.lastSale ?? null,
        daysInactive: latest?.daysInactive == null ? null : Number(latest.daysInactive),
        avgTicket: amount && invoiceCount ? roundAmount(amount.div(invoiceCount)) : 0,
        sharePercent: totalSales ? round((sales / totalSales) * 100) : 0,
        ...(financial
          ? {
              profit: roundAmount(profit),
              marginPercent: amount && !amount.isZero() && profit ? roundAmount(profit.div(amount).times(100)) : 0,
            }
          : {}),
      };
    })
    .sort(
      (first, second) =>
        second.sales - first.sales ||
        (first.sellerId === "__none__"
          ? -1
          : second.sellerId === "__none__"
            ? 1
            : Buffer.compare(Buffer.from(String(first.sellerId)), Buffer.from(String(second.sellerId)))),
    );
  const active = new Set(currentGroups.map((rows) => exactKey(rows[0].sellerId)));
  const inactiveSellers = [...cohort.values()]
    .filter((row) => !active.has(exactKey(row.sellerId)))
    .map((row) => ({
      sellerId: reportId(row.sellerId),
      name: nameFor(row.sellerId),
      ...(Object.hasOwn(row, "phone") ? { phone: row.phone } : {}),
    }));
  const marginPercent = financial && totalSales ? round((totalProfit / totalSales) * 100) : 0;
  return {
    kpis: {
      totalSellers: cohort.size,
      activeSellers: ranking.length,
      inactiveSellers: inactiveSellers.length,
      coveragePercent: cohort.size ? round((ranking.length / cohort.size) * 100) : 0,
      totalSales,
      totalInvoices,
      avgSalesPerSeller: ranking.length ? round(totalSales / ranking.length) : 0,
      avgInvoicesPerSeller: ranking.length ? round(totalInvoices / ranking.length) : 0,
      compareSales: roundAmount(sumValues(previous, "sales")),
      improvedSellers: ranking.filter((row) => row.sales > row.previousSales).length,
      staleSellers: ranking.filter((row) => row.daysInactive > 30).length,
      ...(financial
        ? { marginPercent, lowMarginSellers: ranking.filter((row) => row.marginPercent < marginPercent).length }
        : {}),
    },
    ranking,
    monthlyTrend: groupRows(current, "month")
      .map((rows) => ({
        month: rows[0].month,
        sales: roundAmount(sumValues(rows, "sales")),
        invoiceCount: rows.reduce((total, row) => total + Number(row.invoiceCount), 0),
      }))
      .sort((first, second) => first.month.localeCompare(second.month)),
    inactiveSellers,
  };
}

function createPartyReports({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      const result = await withReportCache(req, res, sessions, async ({ transaction, access }) =>
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
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) =>
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
