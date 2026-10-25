const express = require("express");
const { parameters, listSales, invoiceDetail, salesBase } = require("./sales-reports");
const { canExportSales } = require("./sales-export");
const { pareto: salesPareto, options: paretoOptions } = require("./pareto-reports");
const { purchases, pareto: purchasePareto, options: purchaseOptions } = require("./purchase-reports");
const { inventory, options: inventoryOptions } = require("./inventory-reports");
const { directory } = require("./provider-reports");
const { dispatchExport } = require("./dispatch-export");
const { partyList } = require("./party-reports");
const { inactiveClients } = require("./client-reports");
const { clientDashboard } = require("./client-dashboard");
const { createReceivablesService } = require("../receivables");
const { appendEvent } = require("./identity");

function fail(status) {
  throw Object.assign(new Error("La exportación no está permitida."), { status });
}

function salesCoverage(access, query) {
  if (!canExportSales(access, query)) fail(403);
}

async function dataset(resource, tx, access, input) {
  if (Object.hasOwn(input, "page") || Object.hasOwn(input, "limit")) fail(400);
  let result;
  let candidates;
  let title;
  if (resource === "sales") {
    const { kind = "documents", ...filters } = input;
    if (!["documents", "products", "pareto"].includes(kind)) fail(400);
    const query =
      kind === "pareto"
        ? paretoOptions(filters)
        : parameters(filters, {
            keys: [
              "from",
              "to",
              "showNoe",
              "employeeId",
              "clientId",
              "categoryId",
              "ruta",
              "proveedorId",
              "search",
              "sortBy",
              "sortDir",
            ],
          });
    salesCoverage(access, query);
    if (kind === "pareto") {
      if (Object.hasOwn(filters, "newPage") || Object.hasOwn(filters, "newLimit")) fail(400);
      const report = await salesPareto(tx, access, query);
      const rows = [
        ...report.products.map((row) => ({ ...row, isNew: false })),
        ...report.newProducts.map((row) => ({ ...row, isNew: true })),
      ];
      result = { data: rows, total: rows.length };
    } else
      result = await listSales(
        tx,
        access,
        { ...query, page: 1, limit: 5001 },
        kind === "products" ? "products" : "invoices",
      );
    title = "Ventas autorizadas";
    candidates =
      kind === "pareto"
        ? [
            ["productId", "ID"],
            ["product", "Producto"],
            ["quantity", "Unidades"],
            ["netProfit", "Ganancia"],
            ["rawProfit", "Ventas"],
            ["totalPurchased", "Compras"],
            ["cumulativePercent", "Acumulado (%)"],
            ["abcClass", "Clase"],
            ["rank", "Posición"],
            ["inventoryValue", "Valor inventario"],
            ["firstPurchaseDate", "Primera compra"],
            ["isNew", "Nuevo"],
          ]
        : kind === "products"
          ? [
              ["productId", "ID"],
              ["product", "Producto"],
              ["quantity", "Cantidad"],
              ["peso", "Peso"],
              ["rawProfit", "Total Ventas"],
              ["netProfit", "Utilidad"],
              ["averageProfitPercent", "Margen (%)"],
            ]
          : [
              ["invoiceId", "Documento"],
              ["fecha", "Fecha"],
              ["cliente", "Cliente"],
              ["vendedor", "Vendedor"],
              ["monto", "Total Ventas"],
              ["utilidad", "Utilidad"],
              ["promedio", "Margen (%)"],
            ];
  } else if (resource === "purchases") {
    if (!access.hasGlobal("purchases.export")) fail(403);
    const { kind = "documents", ...filters } = input;
    if (!["documents", "products", "pareto"].includes(kind)) fail(400);
    const query = purchaseOptions(filters, { listing: kind !== "pareto" });
    if (kind === "pareto") {
      const report = await purchasePareto(tx, access, query);
      result = { data: report.products, total: report.products.length };
    } else result = await purchases(tx, access, { ...query, page: 1, limit: 5001 }, kind === "products");
    title = "Compras autorizadas";
    candidates =
      kind === "pareto"
        ? [
            ["productId", "ID"],
            ["rank", "Posición"],
            ["product", "Producto"],
            ["quantity", "Cantidad"],
            ["totalPurchased", "Monto comprado"],
            ["cumulativePercent", "Acumulado (%)"],
            ["abcClass", "Clase"],
          ]
        : kind === "products"
          ? [
              ["productId", "ID"],
              ["product", "Producto"],
              ["quantity", "Cantidad"],
              ["monto", "Total Compras"],
              ["avgUnitCost", "Costo promedio"],
            ]
          : [
              ["invoiceId", "Documento"],
              ["fecha", "Fecha"],
              ["proveedor", "Proveedor"],
              ["unidades", "Unidades"],
              ["monto", "Total Compras"],
            ];
  } else if (resource === "clients") {
    if (!access.hasGlobal("clients.export") || !access.hasGlobal("clients.read")) fail(403);
    const { kind = "directory", mode = "ventas", ...filters } = input;
    if (!["directory", "inactive", "pareto"].includes(kind) || !["ventas", "utilidad"].includes(mode)) fail(400);
    const query = parameters(filters, {
      keys: ["from", "to", "showNoe", "search", "ruta", "sortBy", "sortDir", "employeeId"],
    });
    if (kind === "pareto") {
      const report = await clientDashboard(tx, access, query);
      const selected = mode === "utilidad" ? report.abcUtility : report.abc;
      if (!selected) fail(403);
      result = { data: selected.clients, total: selected.clients.length };
    } else
      result =
        kind === "inactive"
          ? await inactiveClients(tx, access, { ...query, page: 1, limit: 5001 })
          : await partyList(tx, access, { ...query, page: 1, limit: 5001 }, true);
    title = "Clientes autorizados";
    candidates =
      kind === "pareto"
        ? [
            ["clientId", "ID"],
            ["name", "Cliente"],
            ["rank", "Posición"],
            ["total_usd", "Venta total"],
            ["utilidad", "Utilidad"],
            ["cumulativePercent", "Acumulado (%)"],
            ["abcClass", "Clase"],
          ]
        : [
            ["IdCliente", "ID"],
            ["Empresa", "Empresa"],
            ["total_ventas", "Total Ventas"],
            ["num_ventas", "Número de ventas"],
            ["utilidad", "Utilidad"],
            ["revenue_historico", "Histórico"],
            ["dias_inactivo", "Días sin facturar"],
            ["last_factura", "Última factura"],
            ["ruta", "Ruta"],
          ];
  } else if (resource === "receivables") {
    if (!access.hasGlobal("receivables.read") || !access.hasGlobal("receivables.export")) fail(403);
    if (Object.keys(input).some((key) => !["search", "ruta", "state", "due", "sortBy", "sortDir"].includes(key)))
      fail(400);
    const service = createReceivablesService({
      db: tx,
      personal: access.hasGlobal("clients.personal"),
      referenceRate: access.hasGlobal("rates.read"),
    });
    result = await service.list(input, 5001);
    title = "Cuentas por cobrar";
    candidates = [
      ["id", "ID"],
      ["name", "Cliente"],
      ["balance", "Saldo"],
      ["overdue", "Vencido"],
      ["pendingCount", "Documentos pendientes"],
      ["lastPayment", "Último abono"],
    ];
  } else if (resource === "inventory") {
    if (!access.hasGlobal("inventory.export")) fail(403);
    const query = inventoryOptions(input);
    result = await inventory(tx, access, { ...query, page: 1, limit: 5001 });
    title = "Inventario autorizado";
    candidates = [
      ["IdProducto", "ID"],
      ["Descripcion", "Producto"],
      ["Grupo", "Grupo"],
      ["Peso", "Peso"],
      ["Existencia", "Existencias"],
      ["Proveedor", "Proveedor"],
      ["PrecioA", "Precio A"],
      ["inventoryValue", "Valor actual a precio A"],
    ];
  } else if (resource === "providers") {
    if (!access.hasGlobal("providers.read") || !access.hasGlobal("providers.export")) fail(403);
    const query = parameters(input, { range: false, keys: ["search", "sortBy", "sortDir"] });
    result = await directory(tx, { ...query, page: 1, limit: 5001 }, false);
    title = "Proveedores autorizados";
    candidates = [
      ["IdProveedor", "ID"],
      ["Empresa", "Proveedor"],
    ];
  } else fail(404);
  const total = result.pagination?.total ?? result.total;
  if (Number(total) > 5000 || result.data.length > 5000) fail(413);
  const columns = candidates
    .filter(([key]) => result.data.some((row) => Object.hasOwn(row, key)))
    .map(([key, label]) => ({ key, label }));
  return {
    title,
    filename: `dmmarket-${resource}.pdf`,
    columns,
    data: result.data.map((row) =>
      Object.fromEntries(
        columns.map(({ key }) => [key, row[key] instanceof Date ? row[key].toISOString().slice(0, 10) : row[key]]),
      ),
    ),
    total: Number(total),
  };
}

function createExportReports({ sessions, security }) {
  const router = express.Router();
  router.get("/exports/receivables/:clientId", async (req, res, next) => {
    try {
      if (
        Object.keys(req.query).some((key) => key !== "documents") ||
        !/^[-\p{L}\p{N}._]{1,15}$/u.test(req.params.clientId)
      )
        fail(400);
      if (req.query.documents !== undefined && !["all", "pending"].includes(req.query.documents)) fail(400);
      res.json(
        await sessions.withSession(req.sessionID, {}, async ({ transaction, access, user }) => {
          if (!access.hasGlobal("receivables.read") || !access.hasGlobal("receivables.export")) fail(403);
          const service = createReceivablesService({
            db: transaction,
            personal: access.hasGlobal("clients.personal"),
            referenceRate: access.hasGlobal("rates.read"),
          });
          const result = await service.detail(
            req.params.clientId,
            { documents: req.query.documents || "pending" },
            5001,
          );
          if (result.documents.total > 5000 || result.timeline.total > 5000) fail(413);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: "receivables:client",
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post("/exports/sales/dispatch", security.csrfProtection, async (req, res, next) => {
    try {
      if (!req.is("application/json")) fail(415);
      res.json(
        await sessions.withSession(req.sessionID, {}, async ({ transaction, access, user }) => {
          const result = await dispatchExport(transaction, access, req.body);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: `sales:dispatch:${result.invoices.length}`,
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/exports/sales/:invoiceId", async (req, res, next) => {
    try {
      const query = parameters(req.query, { range: false, keys: ["showNoe"] });
      res.json(
        await sessions.withSession(req.sessionID, {}, async ({ transaction, access, user }) => {
          const scope = access.scopeFor("sales.export");
          if (!scope.global && !scope.sellerIds.length) fail(403);
          const { base, invoice } = salesBase(transaction, access, query);
          const headers = await base
            .whereRaw("BINARY ?? = ?", [`mf.${invoice}`, req.params.invoiceId])
            .select({ sellerId: "mf.IdVend" })
            .groupByRaw("BINARY mf.IdVend");
          if (!headers.length) fail(404);
          if (!headers.every((header) => access.canRecord("sales.export", header.sellerId))) fail(403);
          const result = await invoiceDetail(transaction, access, query, req.params.invoiceId);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: "sales:document",
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/exports/:resource", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, {}, async ({ transaction, access, user }) => {
          const result = await dataset(req.params.resource, transaction, access, req.query);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: `${req.params.resource}:${result.total}`,
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createExportReports };
