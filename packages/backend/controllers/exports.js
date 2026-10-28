const { parameters, listSales } = require("./sales");
const { canExportSales } = require("./sales-export");
const { pareto: salesPareto, options: paretoOptions } = require("./dashboard");
const { purchases, pareto: purchasePareto, options: purchaseOptions } = require("./purchases");
const { inventory, options: inventoryOptions } = require("./products");
const { providerList } = require("./provider-list");
const { partyList, canExportSellers } = require("./parties");
const { inactiveClients } = require("./clients");
const { clientDashboard } = require("./clients/dashboard");
const { createReceivablesService } = require("../receivables");

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
  } else if (resource === "sellers") {
    const query = parameters(input, { keys: ["from", "to", "showNoe", "search", "sortBy", "sortDir", "employeeId"] });
    if (!canExportSellers(access, query)) fail(403);
    result = await partyList(tx, access, { ...query, page: 1, limit: 5001 }, false);
    title = "Vendedores autorizados";
    candidates = [
      ["sellerId", "ID"],
      ["name", "Vendedor"],
      ["sales", "Ventas"],
      ["profit", "Utilidad"],
      ["marginPercent", "Margen"],
      ["invoiceCount", "Facturas"],
      ["clientCount", "Clientes"],
      ["avgTicket", "Ticket Prom."],
      ["lastSale", "Última venta"],
      ["daysInactive", "Días sin vender"],
      ["sharePercent", "% del Total"],
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
    const query = parameters(input, { range: false, keys: ["from", "to", "showNoe", "search", "sortBy", "sortDir"] });
    result = await providerList(tx, access, { ...query, page: 1, limit: 5001 });
    title = "Proveedores autorizados";
    candidates = [
      ["IdProveedor", "ID"],
      ["Empresa", "Proveedor"],
      ["total_compras", "Total Compras"],
      ["num_compras", "Compras"],
      ["total_ventas", "Total Ventas"],
      ["num_ventas", "Ventas"],
      ["utilidad", "Utilidad"],
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

module.exports = { dataset, fail };
