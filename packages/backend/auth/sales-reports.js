const express = require("express");
const { canExportSales } = require("./sales-export");
const { filterIdentity } = require("../utils/report-identity");

function fail(status) {
  const error = new Error("La consulta de ventas no está permitida.");
  error.status = status;
  throw error;
}

function parameters(query, { range = true, compare = false, keys = null } = {}) {
  const allowed = [
    "from",
    "to",
    "showNoe",
    "page",
    "limit",
    "sortBy",
    "sortDir",
    "search",
    "clientId",
    "categoryId",
    "employeeId",
    "ruta",
    "proveedorId",
  ];
  if (
    keys &&
    Object.keys(query).some((key) => !keys.includes(key) && !(compare && ["compareFrom", "compareTo"].includes(key)))
  )
    fail(400);
  if (compare) allowed.push("compareFrom", "compareTo");
  if (
    Object.keys(query).some((key) => !allowed.includes(key)) ||
    Object.values(query).some((value) => typeof value !== "string" || value.length > 128)
  )
    fail(400);
  if (query.showNoe !== undefined && !["false", "true"].includes(query.showNoe)) fail(400);
  if (range || query.from || query.to) {
    for (const value of [query.from, query.to]) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value || "") ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        fail(400);
    }
    const span = Date.parse(query.to) - Date.parse(query.from);
    if (span < 0 || span > 366 * 86400000) fail(400);
  }
  if (compare && (query.compareFrom || query.compareTo)) parameters({ from: query.compareFrom, to: query.compareTo });
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    fail(400);
  if (query.sortDir !== undefined && !["asc", "desc"].includes(query.sortDir.toLowerCase())) fail(400);
  return { ...query, page, limit, sortDir: (query.sortDir || "desc").toLowerCase() };
}

function financialFields(access, query, read = access.scopeFor("sales.read")) {
  return ["sales.costs", "sales.profit"].every(
    (capability) =>
      access.hasGlobal(capability) ||
      (query.employeeId
        ? !["__none__", "__empty__"].includes(query.employeeId) && access.canRecord(capability, query.employeeId)
        : !read.global && access.covers(capability, read.sellerIds)),
  );
}

function salesBase(transaction, access, query) {
  const read = access.scopeFor("sales.read");
  if (!read.global && !read.sellerIds.length) fail(403);
  const noe = query.showNoe === "true";
  const master = noe ? "masternoe" : "masterfact";
  const slave = noe ? "slavenoe" : "slavefact";
  const invoice = noe ? "IdNoe" : "IdFactura";
  const base = transaction(`${slave} as sf`)
    .join(`${master} as mf`, function () {
      this.on(transaction.raw("BINARY ?? = BINARY ??", [`mf.${invoice}`, `sf.${invoice}`])).andOn("mf.Anulada", 0);
    })
    .leftJoin("clientes as c", function () {
      this.on(transaction.raw("BINARY c.IdCliente = BINARY mf.IdCliente"));
    })
    .leftJoin("vendedores as v", function () {
      this.on(transaction.raw("BINARY v.idVend = BINARY mf.IdVend"));
    })
    .leftJoin("productos as p", function () {
      this.on(transaction.raw("BINARY p.IdProducto = BINARY sf.IdProducto"));
    });
  if (query.from) base.whereBetween("mf.Fecha", [query.from, query.to]);
  if (!read.global) base.whereIn(transaction.raw("BINARY mf.IdVend"), read.sellerIds);
  for (const [parameter, column] of Object.entries({
    clientId: "mf.IdCliente",
    categoryId: "p.Grupo",
    employeeId: "mf.IdVend",
    ruta: "c.Ruta",
    proveedorId: "p.Proveedor",
  }))
    if (query[parameter]) {
      if (["clientId", "employeeId"].includes(parameter))
        filterIdentity(base, transaction.raw("BINARY ??", [column]), query[parameter]);
      else base.whereRaw("BINARY ?? = ?", [column, query[parameter]]);
    }
  return { base, invoice };
}

async function listSales(transaction, access, query, kind) {
  const financial = financialFields(access, query);
  const { base, invoice } = salesBase(transaction, access, query);
  if (query.invoiceIds) base.whereIn(transaction.raw("BINARY ??", [`mf.${invoice}`]), query.invoiceIds);
  const products = kind === "products";
  const group = products ? "sf.IdProducto" : `mf.${invoice}`;
  if (query.search)
    base.where(function () {
      if (products) this.where("p.Descripcion", "like", `%${query.search}%`);
      else if (query.invoiceSearch)
        this.where("c.Empresa", "like", `%${query.search}%`).orWhere(`mf.${invoice}`, "like", `%${query.search}%`);
      else
        this.where("c.Empresa", "like", `%${query.search}%`)
          .orWhere(`mf.${invoice}`, "like", `%${query.search}%`)
          .orWhere("p.Descripcion", "like", `%${query.search}%`)
          .orWhere("sf.IdProducto", "like", `%${query.search}%`);
    });
  const raw = (sql, values) => transaction.raw(sql, values);
  const amount = raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)");
  const profit = raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)");
  const percent = raw("ROUND(AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100), 2)");
  const quantity = raw("ROUND(SUM(sf.Cantidad), 3)");
  const weight = raw("CASE WHEN COUNT(p.Peso) = COUNT(*) THEN ROUND(SUM(sf.Cantidad * p.Peso), 3) END");
  const sort = products
    ? {
        product: "p.Descripcion",
        quantity,
        peso: weight,
        rawProfit: amount,
        netProfit: profit,
        averageProfitPercent: percent,
      }
    : {
        invoiceId: `mf.${invoice}`,
        fecha: "mf.Fecha",
        monto: amount,
        cliente: "c.Empresa",
        vendedor: "v.Empresa",
        ...(access.hasGlobal("clients.personal") ? { rif: "mf.Rif" } : {}),
        utilidad: profit,
        promedio: percent,
      };
  const sortBy = query.sortBy || (products ? "rawProfit" : "fecha");
  if (sortBy === "rif" && !access.hasGlobal("clients.personal")) fail(403);
  if (!Object.hasOwn(sort, sortBy)) fail(400);
  if (!financial && ["netProfit", "averageProfitPercent", "utilidad", "promedio"].includes(sortBy)) fail(403);
  const metrics = products ? { quantity, peso: weight, rawProfit: amount } : { monto: amount };
  if (financial)
    Object.assign(
      metrics,
      products ? { netProfit: profit, averageProfitPercent: percent } : { utilidad: profit, promedio: percent },
    );
  const columns = products
    ? {
        productId: "sf.IdProducto",
        product: raw("COALESCE(p.Descripcion, CONCAT('Producto no registrado (', sf.IdProducto, ')'))"),
      }
    : {
        invoiceId: `mf.${invoice}`,
        fecha: "mf.Fecha",
        cliente: raw("COALESCE(c.Empresa, 'Cliente no registrado')"),
        vendedor: raw("COALESCE(v.Empresa, 'Vendedor no registrado')"),
        sellerId: "mf.IdVend",
        sellerCount: raw("COUNT(DISTINCT BINARY mf.IdVend)"),
      };
  const count = await transaction
    .from(base.clone().select({ id: group }).groupByRaw("BINARY ??", [group]).as("i"))
    .count("* as total")
    .first();
  const data = await base
    .clone()
    .select({ ...columns, ...metrics })
    .groupByRaw("BINARY ??", [group])
    .orderBy(sort[sortBy], query.sortDir)
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  const totals = await base.clone().select(metrics).first();
  return {
    data: products
      ? data
      : data.map(({ sellerId, sellerCount, ...row }) => ({
          ...row,
          exportAllowed:
            access.hasGlobal("sales.export") ||
            (Number(sellerCount) === 1 && access.canRecord("sales.export", sellerId)),
        })),
    pagination: { page: query.page, limit: query.limit, total: Number(count.total) },
    totals,
    exportAllowed: canExportSales(access, query),
  };
}

function rowNumber(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

async function invoiceList(transaction, access, query) {
  const aliases = { createdAt: "fecha", client: "cliente" };
  const normalized = { ...query, invoiceSearch: true, sortBy: aliases[query.sortBy] || query.sortBy };
  const summary = await listSales(transaction, access, normalized, "invoices");
  const financial = financialFields(access, query);
  const personal = access.hasGlobal("clients.personal");
  const { base, invoice } = salesBase(transaction, access, query);
  if (query.search)
    base.where(function () {
      this.where("c.Empresa", "like", `%${query.search}%`).orWhere(`mf.${invoice}`, "like", `%${query.search}%`);
    });
  const ids = summary.data.map((row) => row.invoiceId);
  base.leftJoin("grupos as dispatchGroup", function () {
    this.on(transaction.raw("BINARY dispatchGroup.IdGrupo = BINARY p.Grupo"));
  });
  const lines = ids.length
    ? await base
        .whereIn(`mf.${invoice}`, ids)
        .select({
          invoiceId: `mf.${invoice}`,
          productId: "sf.IdProducto",
          product: "sf.Descripcion",
          group: "dispatchGroup.Descripcion",
          quantity: "sf.Cantidad",
          price: "sf.Precio",
          peso: "p.Peso",
          ...(financial ? { cost: "sf.Costo" } : {}),
          ...(personal ? { rif: "mf.Rif" } : {}),
        })
        .limit(5001)
    : [];
  if (lines.length > 5000) fail(413);
  return {
    data: summary.data.map((row) => {
      const own = lines.filter((line) => String(line.invoiceId) === String(row.invoiceId));
      return {
        invoiceId: row.invoiceId,
        exportAllowed: row.exportAllowed,
        client: row.cliente,
        createdAt: row.fecha,
        total: rowNumber(row.monto),
        ...(financial ? { utilidad: rowNumber(row.utilidad) } : {}),
        ...(personal ? { rif: own[0]?.rif ?? null } : {}),
        products: own.map((line) => ({
          productId: line.productId,
          product: line.product,
          group: line.group,
          quantity: line.quantity == null ? null : Number(line.quantity),
          price: line.price == null ? null : Number(line.price),
          peso: line.peso === null ? null : rowNumber(line.peso),
          ...(financial ? { cost: line.cost == null ? null : Number(line.cost) } : {}),
        })),
      };
    }),
    pagination: summary.pagination,
    exportAllowed: summary.exportAllowed,
    totals: {
      total: rowNumber(summary.totals.monto),
      ...(financial ? { utilidad: rowNumber(summary.totals.utilidad) } : {}),
    },
  };
}

async function invoiceDetail(transaction, access, query, id) {
  if (typeof id !== "string" || !id || id.length > 128 || /[\p{Cc}\p{Cs}]/u.test(id)) fail(400);
  const { base, invoice } = salesBase(transaction, access, query);
  base.whereRaw("BINARY ?? = ?", [`mf.${invoice}`, id]);
  const personal = access.hasGlobal("clients.personal");
  const header = await base.clone().first({
    idFactura: `mf.${invoice}`,
    fecha: "mf.Fecha",
    sellerId: "mf.IdVend",
    cliente: transaction.raw("COALESCE(c.Empresa, 'Cliente no registrado')"),
    vendedor: transaction.raw("COALESCE(v.Empresa, 'Vendedor no registrado')"),
    ...(personal ? { rif: "mf.Rif" } : {}),
  });
  if (!header) fail(404);
  const sellers = await base.clone().select({ id: "mf.IdVend" }).groupByRaw("BINARY mf.IdVend");
  const financial = ["sales.costs", "sales.profit"].every((capability) =>
    access.covers(
      capability,
      sellers.map((row) => row.id),
    ),
  );
  const metrics = { total: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)") };
  if (financial) metrics.utilidad = transaction.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)");
  const totals = await base.clone().select(metrics).first();
  const lines = await base
    .clone()
    .select({
      descripcion: "sf.Descripcion",
      cantidad: "sf.Cantidad",
      precio: "sf.Precio",
      subtotal: transaction.raw("ROUND(sf.Precio * sf.Cantidad, 2)"),
      ...(financial
        ? { costo: "sf.Costo", utilidad: transaction.raw("ROUND((sf.Precio - sf.Costo) * sf.Cantidad, 2)") }
        : {}),
    })
    .limit(1001);
  if (lines.length > 1000) fail(413);
  return {
    idFactura: header.idFactura,
    fecha: header.fecha,
    cliente: header.cliente,
    vendedor: header.vendedor,
    total: rowNumber(totals.total),
    ...(financial ? { utilidad: rowNumber(totals.utilidad) } : {}),
    ...(personal ? { rif: header.rif } : {}),
    productos: lines.map((line) => ({
      descripcion: line.descripcion,
      cantidad: rowNumber(line.cantidad),
      precio: rowNumber(line.precio),
      subtotal: rowNumber(line.subtotal),
      ...(financial ? { costo: rowNumber(line.costo), utilidad: rowNumber(line.utilidad) } : {}),
    })),
  };
}

async function groupSales(transaction, access, query) {
  const { base } = salesBase(transaction, access, query);
  if (query.search) base.where("p.Descripcion", "like", `%${query.search}%`);
  const financial = financialFields(access, query);
  const rows = await base
    .leftJoin("grupos as g", "g.idGrupo", "p.Grupo")
    .select({
      groupId: "p.Grupo",
      categoria: transaction.raw(
        "COALESCE(NULLIF(g.Descripcion, ''), CONCAT('Grupo no registrado (', COALESCE(p.Grupo, 'sin ID'), ')'))",
      ),
      rawProfit: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      ...(financial ? { netProfit: transaction.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)") } : {}),
    })
    .groupBy("p.Grupo", "g.Descripcion")
    .orderBy("p.Grupo")
    .limit(501);
  if (rows.length > 500) fail(413);
  return rows;
}

async function kpis(transaction, access, query) {
  const { base, invoice } = salesBase(transaction, access, query);
  const financial = financialFields(access, query);
  const perInvoice = base
    .select({
      invoiceId: `mf.${invoice}`,
      amount: transaction.raw("SUM(sf.Precio * sf.Cantidad)"),
      quantity: transaction.raw("SUM(sf.Cantidad)"),
      ...(financial
        ? {
            profit: transaction.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad)"),
            margin: transaction.raw("AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100)"),
          }
        : {}),
    })
    .groupBy(`mf.${invoice}`);
  const result = await transaction
    .from(perInvoice.as("s"))
    .select({
      totalRawProfit: transaction.raw("ROUND(COALESCE(SUM(s.amount), 0), 2)"),
      totalQuantity: transaction.raw("ROUND(COALESCE(SUM(s.quantity), 0), 3)"),
      totalInvoices: transaction.raw("COUNT(*)"),
      avgTicket: transaction.raw("ROUND(COALESCE(SUM(s.amount) / NULLIF(COUNT(*), 0), 0), 2)"),
      ...(financial
        ? {
            totalNetProfit: transaction.raw("ROUND(COALESCE(SUM(s.profit), 0), 2)"),
            avgMarginPercent: transaction.raw(
              "ROUND(COALESCE(SUM(COALESCE(s.margin, 0)) / NULLIF(COUNT(*), 0), 0), 2)",
            ),
          }
        : {}),
    })
    .first();
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, rowNumber(value)]));
}

async function dashboard(transaction, access, query) {
  const financial = financialFields(access, query);
  const summary = await kpis(transaction, access, query);
  const compare = query.compareFrom
    ? await kpis(transaction, access, { ...query, from: query.compareFrom, to: query.compareTo })
    : null;
  Object.assign(summary, {
    compareRawProfit: compare?.totalRawProfit ?? null,
    compareQuantity: compare?.totalQuantity ?? null,
    compareInvoices: compare?.totalInvoices ?? null,
    ...(financial ? { compareNetProfit: compare?.totalNetProfit ?? null } : {}),
  });
  const raw = (sql) => transaction.raw(sql);
  const { base, invoice } = salesBase(transaction, access, query);
  const best = await base
    .clone()
    .select({
      id: "mf.IdVend",
      name: raw("COALESCE(v.Empresa, 'Vendedor no registrado')"),
      totalSales: raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
    })
    .groupBy("mf.IdVend", "v.Empresa")
    .orderBy("totalSales", "desc")
    .first();
  const clients = await base
    .clone()
    .select({
      clientId: "mf.IdCliente",
      invoiceCount: transaction.raw("COUNT(DISTINCT ??)", [`mf.${invoice}`]),
      client: raw("COALESCE(c.Empresa, 'Cliente no registrado')"),
      total_USD: raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      ...(financial ? { netProfit: raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)") } : {}),
    })
    .groupBy("mf.IdCliente", "c.Empresa")
    .orderBy(financial ? "netProfit" : "total_USD", "desc")
    .limit(30);
  const products = await listSales(
    transaction,
    access,
    { ...query, page: 1, limit: 30, sortBy: financial ? "netProfit" : "rawProfit", sortDir: "desc" },
    "products",
  );
  return {
    kpis: summary,
    exportAllowed: canExportSales(access, query),
    bestEmployee: best ? { ...best, totalSales: rowNumber(best.totalSales) } : null,
    topProducts: products.data,
    topClients: clients,
    groupSalesChart: await groupSales(transaction, access, query),
  };
}

function createSalesReports({ sessions }) {
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
  router.get(
    "/sales/facturas",
    handle((transaction, access, query) => listSales(transaction, access, query, "invoices")),
  );
  router.get(
    "/sales/productos",
    handle((transaction, access, query) => listSales(transaction, access, query, "products")),
  );
  router.get("/invoices", handle(invoiceList));
  router.get(
    "/invoices/selection",
    handle(async (transaction, access, query) => {
      if (Object.hasOwn(query, "search") && typeof query.search !== "string") fail(400);
      const result = await invoiceList(transaction, access, { ...query, page: 1, limit: 5001 });
      if (result.pagination.total > 5000) fail(413);
      return result;
    }),
  );
  router.get(
    "/invoices/sales",
    handle(async (transaction, access, query) => {
      const products = await listSales(transaction, access, query, "products");
      return {
        data: products.data,
        pagination: products.pagination,
        group_sales_chart_data: await groupSales(transaction, access, query),
      };
    }),
  );
  const chartKeys = ["from", "to", "showNoe", "employeeId", "clientId", "categoryId", "ruta", "proveedorId"];
  router.get("/invoices/group", handle(groupSales, { keys: chartKeys }));
  router.get(
    "/invoices/sales/:categoryId",
    handle(
      (transaction, access, query, params) =>
        groupSales(transaction, access, { ...query, categoryId: params.categoryId }),
      { keys: chartKeys },
    ),
  );
  router.get(
    "/groups/sales/:groupId",
    handle(async (transaction, access, query, params) => {
      const products = await listSales(
        transaction,
        access,
        { ...query, categoryId: params.groupId, page: 1, limit: 100 },
        "products",
      );
      if (products.pagination.total > 100) fail(413);
      return products.data;
    }),
  );
  router.get("/invoices/:invoiceId/detail", (req, res, next) => {
    if (
      Object.keys(req.query).some(
        (key) =>
          !["showNoe", "from", "to", "employeeId", "clientId", "categoryId", "ruta", "proveedorId"].includes(key),
      )
    ) {
      try {
        fail(400);
      } catch (error) {
        return next(error);
      }
    }
    return handle((transaction, access, query, params) => invoiceDetail(transaction, access, query, params.invoiceId), {
      range: false,
    })(req, res, next);
  });
  router.get("/dashboard/sales", handle(dashboard, { compare: true, keys: chartKeys }));
  router.get("/groups", async (req, res, next) => {
    try {
      const result = await sessions.withSession(req.sessionID, {}, async ({ transaction, access }) => {
        if (Object.keys(req.query).length) fail(400);
        if (
          !["sales.read", "purchases.read", "inventory.read", "commissions.read"].some((capability) => {
            const scope = access.scopeFor(capability);
            return scope.global || scope.sellerIds.length;
          })
        )
          fail(403);
        const groups = await transaction("grupos")
          .select({ groupId: "IdGrupo", name: "Descripcion" })
          .orderBy("IdGrupo")
          .limit(501);
        if (groups.length > 500) fail(413);
        return groups;
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = {
  createSalesReports,
  parameters,
  salesBase,
  financialFields,
  listSales,
  invoiceList,
  invoiceDetail,
  dashboard,
  kpis,
};
