const express = require("express");
const { parameters, listSales } = require("./sales-reports");
const { purchases, pareto: purchasePareto, options: purchaseOptions } = require("./purchase-reports");
const { inventory, options: inventoryOptions } = require("./inventory-reports");
const { directory } = require("./provider-reports");
const { appendEvent } = require("./identity");

function fail(status) {
  throw Object.assign(new Error("La exportación no está permitida."), { status });
}

function salesCoverage(access, query) {
  const read = access.scopeFor("sales.read");
  const exporting = access.scopeFor("sales.export");
  if (!read.global && !read.sellerIds.length) fail(403);
  if (exporting.global) return;
  if (!exporting.sellerIds.length) fail(403);
  if (query.employeeId) {
    if (["__none__", "__empty__"].includes(query.employeeId) || !access.canRecord("sales.export", query.employeeId))
      fail(403);
  } else if (read.global || !access.covers("sales.export", read.sellerIds)) fail(403);
}

async function dataset(resource, tx, access, input) {
  if (Object.hasOwn(input, "page") || Object.hasOwn(input, "limit")) fail(400);
  let result;
  let candidates;
  let title;
  if (resource === "sales") {
    const { kind = "documents", ...filters } = input;
    if (!["documents", "products"].includes(kind)) fail(400);
    const query = parameters(filters, {
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
    result = await listSales(
      tx,
      access,
      { ...query, page: 1, limit: 5001 },
      kind === "products" ? "products" : "invoices",
    );
    title = "Ventas autorizadas";
    candidates =
      kind === "products"
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

function createExportReports({ sessions }) {
  const router = express.Router();
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
