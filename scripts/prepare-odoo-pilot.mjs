import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Uso: bun scripts/prepare-odoo-pilot.mjs /ruta/privada/a/la/extraccion");
const directory = fs.realpathSync(source);
const repository = fs.realpathSync(process.cwd());
if (directory === repository || directory.startsWith(repository + path.sep))
  throw new Error("Los datos comerciales deben permanecer fuera del repositorio");
const output = path.join(directory, "paquete");
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
fs.chmodSync(output, 0o700);
const load = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
const masters = load("origen-maestros.json");
const documents = load("origen-documentos.json");
const summary = load("origen-resumen.json");
const expected = load("reportes-esperados.json");
const files = [];
const warnings = [];
const externalId = (kind, value) => `solser_pilot.${kind}_${Buffer.from(String(value)).toString("hex") || "empty"}`;
const safeNumber = (value) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error("Importe no finito en el origen");
  return number;
};
const csvValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const write = (name, content, metadata = {}) => {
  const filename = path.join(output, name);
  fs.writeFileSync(filename, content, { mode: 0o600 });
  fs.chmodSync(filename, 0o600);
  files.push({
    name,
    bytes: Buffer.byteLength(content),
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
    ...metadata,
  });
};
const csv = (name, model, headers, rows, metadata = {}) => {
  if (rows.some((row) => row.length !== headers.length)) throw new Error(`Columnas inconsistentes en ${name}`);
  write(name, `\ufeff${[headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n")}\r\n`, {
    model,
    rows: rows.length,
    headers,
    ...metadata,
  });
};
const json = (name, value, metadata) => write(name, `${JSON.stringify(value, null, 2)}\n`, metadata);
const identifiers = new Set();
const register = (kind, value) => {
  const id = externalId(kind, value);
  if (identifiers.has(id)) throw new Error(`Identificador duplicado ${id}`);
  identifiers.add(id);
  return id;
};
const products = new Map(masters.productos.map((row) => [row.IdProducto, row]));
const groups = new Map(masters.grupos.map((row) => [row.IdGrupo, { ...row }]));
const clients = new Map(masters.clientes.map((row) => [row.IdCliente, { ...row }]));
const providers = new Map(masters.proveedores.map((row) => [row.IdProveedor, { ...row }]));
const placeholders = { groups: [], clients: [], providers: [] };
for (const row of masters.productos) {
  if (row.Grupo && !groups.has(row.Grupo)) {
    groups.set(row.Grupo, { IdGrupo: row.Grupo, Descripcion: `Grupo no registrado (${row.Grupo})` });
    placeholders.groups.push(row.Grupo);
  }
  if (row.Proveedor && !providers.has(row.Proveedor)) {
    providers.set(row.Proveedor, { IdProveedor: row.Proveedor, Empresa: `Proveedor no registrado (${row.Proveedor})` });
    placeholders.providers.push(row.Proveedor);
  }
}
const activeSales = documents.masterfact.filter((row) => row.Anulada === 0);
const activePurchases = documents.mastercomp.filter((row) => row.Anulada === 0);
for (const row of activeSales) {
  if (!clients.has(row.IdCliente)) {
    clients.set(row.IdCliente, {
      IdCliente: row.IdCliente,
      Empresa: `Cliente no registrado (${row.IdCliente ?? "sin ID"})`,
    });
    placeholders.clients.push(row.IdCliente);
  }
}
for (const row of activePurchases)
  if (!providers.has(row.IdProveedor)) throw new Error("Compra con proveedor inexistente");
for (const row of [...documents.slavefact, ...documents.slavecomp])
  if (!products.has(row.IdProducto)) throw new Error("Documento con producto inexistente");
for (const [kind, rows, column] of [
  ["product", masters.productos, "IdProducto"],
  ["category", [...groups.values()], "IdGrupo"],
  ["client", [...clients.values()], "IdCliente"],
  ["provider", [...providers.values()], "IdProveedor"],
  ["salesperson", masters.vendedores, "IdVend"],
  ["route", masters.rutas, "IdRuta"],
]) {
  if (kind === "route" && !rows.every((row) => column in row)) continue;
  for (const row of rows) register(kind, row[column]);
}
const unitNames = [...new Set(masters.productos.map((row) => row.Unidad || "SIN_UNIDAD"))];
for (const name of unitNames) register("unit", name);
csv(
  "01-unidades.csv",
  "uom.uom",
  ["id", "name", "relative_factor"],
  unitNames.map((unit) => [externalId("unit", unit), `Solser ${unit}`, 1]),
  { note: "Unidades independientes. No se conocen equivalencias caja/bulto/unidad." },
);
csv(
  "02-grupos.csv",
  "product.category",
  ["id", "name", "property_cost_method", "property_valuation"],
  [...groups.values()].map((row) => [
    externalId("category", row.IdGrupo),
    row.Descripcion || `Grupo ${row.IdGrupo}`,
    "standard",
    "periodic",
  ]),
);
const partnerRows = [];
for (const [kind, rows, key, customer, provider] of [
  ["client", [...clients.values()], "IdCliente", 1, 0],
  ["provider", [...providers.values()], "IdProveedor", 0, 1],
  ["salesperson", masters.vendedores, "IdVend", 0, 0],
]) {
  for (const row of rows)
    partnerRows.push([
      externalId(kind, row[key]),
      row.Empresa || `${kind} ${row[key]}`,
      `SOLSER:${kind}:${row[key]}`,
      row.Direccion || "",
      row.Telfs || "",
      customer,
      provider,
      `Origen: ${summary.database}; tipo: ${kind}; ID: ${row[key]}; ruta: ${row.Ruta || ""}. Datos fiscales y correos conservados en el JSON original, no inferidos.`,
    ]);
}
csv(
  "03-contactos.csv",
  "res.partner",
  ["id", "name", "ref", "street", "phone", "customer_rank", "supplier_rank", "comment"],
  partnerRows,
  { note: "No se crean usuarios ni invitaciones. No se mezclan cliente/proveedor por nombre o RIF." },
);
const taxable = masters.productos.filter((row) => Boolean(row.Gravado));
csv(
  "04-productos-USD-requiere-configuracion.csv",
  "product.product",
  [
    "id",
    "name",
    "default_code",
    "barcode",
    "type",
    "is_storable",
    "categ_id/id",
    "uom_id/id",
    "list_price",
    "standard_price",
    "available_in_pos",
    "taxes_id/.id",
    "supplier_taxes_id/.id",
  ],
  masters.productos.map((row) => [
    externalId("product", row.IdProducto),
    row.Descripcion || row.IdProducto,
    row.IdProducto,
    row.IdProducto,
    "consu",
    "True",
    row.Grupo ? externalId("category", row.Grupo) : "",
    externalId("unit", row.Unidad || "SIN_UNIDAD"),
    safeNumber(row.PrecioA),
    safeNumber(row.Costo),
    "True",
    row.Gravado ? "" : 5,
    row.Gravado ? "" : 9,
  ]),
  {
    requires: [
      "Moneda de compañía USD o adaptación explícita del mapeo monetario",
      "Resolver impuestos de los tres productos gravados",
      "Revisar precisión de precios y cantidades",
    ],
    note: "No importar con la configuración VEF actual. Los códigos son identificadores internos Solser, no EAN inventados. Peso se conserva en JSON sin asumir su unidad física.",
  },
);
const tiers = ["A", "B", "C"];
for (const tier of tiers) register("pricelist", tier);
csv(
  "05-listas-USD.csv",
  "product.pricelist",
  ["id", "name", "currency_id/.id"],
  tiers.map((tier) => [externalId("pricelist", tier), `Solser ${tier} USD`, 1]),
  { requires: ["USD activado en Odoo"] },
);
csv(
  "06-precios-USD.csv",
  "product.pricelist.item",
  ["id", "pricelist_id/id", "product_id/id", "compute_price", "fixed_price", "min_quantity"],
  masters.productos.flatMap((row) =>
    tiers.map((tier) => [
      register("price", `${tier}:${row.IdProducto}`),
      externalId("pricelist", tier),
      externalId("product", row.IdProducto),
      "fixed",
      safeNumber(row[`Precio${tier}`]),
      0,
    ]),
  ),
);
const linesById = (rows, key) => {
  const result = new Map();
  for (const row of rows) {
    const lines = result.get(row[key]) || [];
    lines.push(row);
    result.set(row[key], lines);
  }
  return result;
};
const saleLines = linesById(documents.slavefact, "IdFactura");
const purchaseLines = linesById(documents.slavecomp, "IdFactura");
const flattenedSales = [];
const canonicalSales = [];
for (const header of activeSales) {
  const id = register("sale", header.IdFactura);
  const lines = saleLines.get(header.IdFactura) || [];
  if (!lines.length) throw new Error("Venta vigente sin líneas");
  const canonical = {
    externalId: id,
    sourceId: header.IdFactura,
    source: "FAC",
    date: header.Fecha,
    client: externalId("client", header.IdCliente),
    salesperson: header.IdVend,
    lines: [],
  };
  lines.forEach((line, index) => {
    const childId = register("sale_line", `${header.IdFactura}:${index + 1}`);
    const parent =
      index === 0
        ? [
            id,
            `SOL-PILOT/FAC/${header.IdFactura}`,
            externalId("client", header.IdCliente),
            `${header.Fecha} 12:00:00`,
            externalId("pricelist", "A"),
            `Solser FAC ${header.IdFactura}`,
            `SOL-PILOT; vendedor=${header.IdVend}; documento original=${header.IdFactura}`,
          ]
        : Array(7).fill("");
    flattenedSales.push([
      ...parent,
      childId,
      externalId("product", line.IdProducto),
      line.Descripcion,
      safeNumber(line.Cantidad),
      safeNumber(line.Precio),
      safeNumber(line.Costo),
      0,
      5,
    ]);
    canonical.lines.push({
      externalId: childId,
      product: externalId("product", line.IdProducto),
      quantity: safeNumber(line.Cantidad),
      price: safeNumber(line.Precio),
      cost: safeNumber(line.Costo),
      taxRate: safeNumber(line.Tasa),
      sourceOrder: line.Orden,
    });
  });
  canonicalSales.push(canonical);
}
csv(
  "07-ventas-cotizaciones-borrador.csv",
  "sale.order",
  [
    "id",
    "name",
    "partner_id/id",
    "date_order",
    "pricelist_id/id",
    "origin",
    "client_order_ref",
    "order_line/id",
    "order_line/product_id/id",
    "order_line/name",
    "order_line/product_uom_qty",
    "order_line/price_unit",
    "order_line/purchase_price",
    "order_line/discount",
    "order_line/tax_ids/.id",
  ],
  flattenedSales,
  {
    documents: activeSales.length,
    state: "draft",
    note: "No confirmar automáticamente: generaría entregas de historia ya cerrada. No equivale a ventas contabilizadas.",
  },
);
const flattenedPurchases = [];
for (const header of activePurchases) {
  const id = register("purchase", header.IdFactura);
  const lines = purchaseLines.get(header.IdFactura) || [];
  if (!lines.length) throw new Error("Compra vigente sin líneas");
  lines.forEach((line, index) => {
    const parent =
      index === 0
        ? [
            id,
            `SOL-PILOT/CPR/${header.IdFactura}`,
            externalId("provider", header.IdProveedor),
            `${header.Fecha} 12:00:00`,
            1,
            `Solser CPR ${header.IdFactura}`,
          ]
        : Array(6).fill("");
    flattenedPurchases.push([
      ...parent,
      register("purchase_line", `${header.IdFactura}:${index + 1}`),
      externalId("product", line.IdProducto),
      line.Descripcion,
      safeNumber(line.Cantidad),
      safeNumber(line.Precio),
      `${header.Fecha} 12:00:00`,
      9,
    ]);
  });
}
csv(
  "08-compras-solicitudes-borrador.csv",
  "purchase.order",
  [
    "id",
    "name",
    "partner_id/id",
    "date_order",
    "currency_id/.id",
    "origin",
    "order_line/id",
    "order_line/product_id/id",
    "order_line/name",
    "order_line/product_qty",
    "order_line/price_unit",
    "order_line/date_planned",
    "order_line/tax_ids/.id",
  ],
  flattenedPurchases,
  {
    documents: activePurchases.length,
    state: "draft",
    note: "Precio según la fórmula del reporte DMMarket. Moneda original BsS y tasa cero impiden afirmar equivalencia fiscal.",
  },
);
const stockDifferences = load("origen-stock-diferencias.json");
csv(
  "09-stock-snapshot-NO-APLICAR.csv",
  "stock.quant",
  ["product_id/id", "inventory_quantity", "inventory_date"],
  masters.productos.map((row) => [
    externalId("product", row.IdProducto),
    safeNumber(row.Existencia),
    summary.period.to,
  ]),
  {
    requires: [
      "Ubicación de inventario confirmada",
      "Resolver negativos y discrepancias",
      "No reproducir salidas/entradas históricas sobre este saldo final",
    ],
    note: "No incluye ubicación ni ejecuta action_apply_inventory. Es un snapshot de referencia, no un ajuste aplicado.",
  },
);
const negativeStock = masters.productos
  .filter((row) => row.Existencia < 0)
  .map((row) => ({ product: row.IdProducto, quantity: row.Existencia }));
const unknownReferences = masters.productos
  .filter((row) => row.Referencia?.trim())
  .map((row) => ({ product: row.IdProducto, reference: row.Referencia }));
const missingWeightUnit = masters.productos.filter((row) => row.Peso !== null && safeNumber(row.Peso) !== 0).length;
const allSaleLines = canonicalSales.flatMap((row) => row.lines);
const totals = {
  documents: canonicalSales.length,
  lines: allSaleLines.length,
  amount: allSaleLines.reduce((total, row) => total + row.price * row.quantity, 0),
  margin: allSaleLines.reduce((total, row) => total + (row.price - row.cost) * row.quantity, 0),
  quantity: allSaleLines.reduce((total, row) => total + row.quantity, 0),
};
const expectedTotals = summary.summaries.masterfact.find((row) => row.Anulada === 0);
for (const [key, target] of [
  ["amount", expectedTotals.amount],
  ["margin", expectedTotals.margin],
  ["quantity", expectedTotals.quantity],
])
  if (Math.abs(totals[key] - target) > 0.000001) throw new Error(`No concilia ${key}`);
const roundedLineAmount = allSaleLines.reduce(
  (total, row) => total + Math.round((row.price * row.quantity + Number.EPSILON) * 100) / 100,
  0,
);
const roundedPriceAmount = allSaleLines.reduce(
  (total, row) => total + (Math.round(row.price * 100) / 100) * row.quantity,
  0,
);
const warningsData = {
  placeholders,
  taxableProducts: taxable.map((row) => row.IdProducto),
  negativeStock,
  stockDifferences,
  referenceNotInterpretedAsBarcode: unknownReferences,
  productsWithUnconfirmedWeightUnit: missingWeightUnit,
  salesWithoutOriginalTime: activeSales.length,
  purchaseCurrencyAmbiguity: activePurchases.length,
  rounding: {
    sourceAmount: totals.amount,
    roundingEachLineToCents: roundedLineAmount,
    roundingEachUnitPriceToCents: roundedPriceAmount,
  },
};
json("advertencias.json", warningsData);
json("ventas-canonicas.json", canonicalSales);
json("reportes-esperados.json", expected);
json("trazabilidad.json", {
  sourceDatabase: summary.database,
  sourcePeriod: summary.period,
  identifiers: [...identifiers],
  originalCounts: summary.counts,
  placeholders,
  originalDocumentsRetained: true,
});
for (const filename of [
  "noe-muestra-historica.json",
  "desempaques-solo-referencia.json",
  "comisiones-solo-referencia.json",
  "cobranza-solo-referencia-no-importar.json",
  "pagos-solo-referencia-no-importar.json",
])
  json(filename, load(filename), { importable: false });
const blockers = [
  "El token MCP actual solo expone consultas. Falta una vía autorizada de escritura/importación.",
  "Compañía Odoo en VEF; archivos monetarios expresados en USD. Prohibido interpretar USD como VEF.",
  "Odoo tiene impuestos 0/8/12/22; origen 0/8/16/31. No existe equivalencia automática de tasas.",
  "Stock tiene 14 negativos y tres diferencias con existencias. No aplicar un ajuste silencioso.",
  "Cotizaciones/RFQ en borrador no reproducen reportes de ventas/compras confirmadas ni contabilidad.",
  "Cobranza contiene estructuras históricas y de desarrollo; no importar saldos sin conciliación.",
  "No hay conexión a lector/impresora físicos. No declarar el hardware validado.",
];
warnings.push(...blockers);
const readme = `# Paquete de preparación Odoo\n\nEstado: PREPARADO, NO IMPORTADO. No es un respaldo completo restaurable de Odoo.\n\nOrigen: ${summary.database}, lectura local; período ${summary.period.from} a ${summary.period.to}.\n\nContiene CSV estándar de importación, JSON canónico, reportes esperados y trazabilidad. Los JSON originales permanecen en el directorio padre. Todos los CSV son borradores de mapeo hasta resolver los bloqueos del manifiesto. Los prefijos solser_pilot permiten reconocer registros propios, no autorizan borrar ni sobrescribir datos existentes.\n\n## Orden previsto\n\n1. Obtener respaldo descargable completo de Odoo y vía de importación autorizada.\n2. Resolver moneda base, tasas/impuestos y precisión. No generar movimientos o cobros reales para probar.\n3. Importar unidades, grupos y contactos; comprobar External IDs.\n4. Importar productos solo después del mapeo monetario y fiscal; revisar códigos internos contra etiquetas reales.\n5. Activar USD e importar listas/precios A/B/C.\n6. Importar cotizaciones y solicitudes de compra en borrador. No modificar el estado directamente ni confirmar historia sin un plan de movimientos.\n7. Tratar stock inicial, historia, desempaques y cobranza como trabajos separados para no duplicar saldos.\n8. Comparar reportes por fecha, producto, grupo, proveedor, cliente, vendedor y ruta con reportes-esperados.json. No confundir el promedio de porcentajes de líneas con margen global.\n\n## Totales de control\n\n${totals.documents} ventas; ${totals.lines} líneas; monto ${totals.amount}; utilidad ${totals.margin}; cantidad ${totals.quantity}.\n\n## Bloqueos\n\n${blockers.map((row) => `- ${row}`).join("\n")}\n\nNo se importan abonos, pagos ni saldos de cobranza. No se crean usuarios de pago para los vendedores. No se inventan equivalencias de desempaque, peso, impuestos ni códigos EAN. No se interpreta una conversión de divisas configurada en Solser como tasa oficial histórica.\n`;
write("LEEME.md", readme);
const manifest = {
  generatedAt: new Date().toISOString(),
  state: "prepared_not_imported",
  writesToOdoo: 0,
  source: { database: summary.database, period: summary.period, counts: summary.counts },
  target: {
    url: "https://dmmarket.odoo.com",
    requiredProductCurrency: "USD",
    observedCompanyCurrency: "VEF",
    observedUsdCurrencyId: 1,
    exemptionSaleTaxId: 5,
    exemptionPurchaseTaxId: 9,
  },
  totals,
  expectedTotals,
  placeholders,
  warnings,
  files,
};
fs.writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(path.join(output, "manifest.json"), 0o600);
console.log(
  JSON.stringify({
    output,
    state: manifest.state,
    sourceCounts: summary.counts,
    csvRows: files
      .filter((file) => file.model)
      .map(({ name, model, rows, documents }) => ({ name, model, rows, documents })),
    totals,
    placeholderCounts: Object.fromEntries(Object.entries(placeholders).map(([key, value]) => [key, value.length])),
    blockerCount: warnings.length,
    files: files.length,
  }),
);
