const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedInventory } = require("../../../tests/support/inventory-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
let environment;
const salesRange = "from=2026-01-01&to=2026-01-31";
const buyRange = "from=2026-08-01&to=2026-08-31";
const grant = (capability, scope = "global") => ({ capability, scope });
async function reader(permissions) {
  const user = await environment.seedUser({ permissions });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const client = environment.client();
  await client.login(user);
  return { client, user };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedInventory(environment.db);
  await seedPurchases(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("lectura no concede exportación y exportación no concede lectura", async () => {
  for (const [resource, capability, range] of [
    ["sales", "sales", salesRange],
    ["purchases", "purchases", buyRange],
    ["inventory", "inventory", "search=Inventario"],
    ["providers", "providers", "search=Proveedor"],
    ["clients", "clients", salesRange],
    ["sellers", "sellers", salesRange],
    ["receivables", "receivables", "search=sintético"],
  ]) {
    for (const permission of ["read", "export"]) {
      const { client } = await reader([grant(`${capability}.${permission}`)]);
      expect((await client.request(`/api/exports/${resource}?${range}`)).status).toBe(403);
    }
  }
});

test.each(["false", "true"])(
  "ventas propias se filtran antes de exportar y omiten costos o identificación showNoe=%s",
  async (showNoe) => {
    const { client, user } = await reader([grant("sales.read", "assigned"), grant("sales.export", "assigned")]);
    const result = await client.request(`/api/exports/sales?${salesRange}&showNoe=${showNoe}`);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ filename: "dmmarket-sales.pdf", total: 1 });
    expect(result.body.data[0].vendedor).toBe("Vendedor A");
    expect(Number(result.body.data[0].monto)).toBe(showNoe === "true" ? 200 : 100);
    expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|utilidad|netProfit|rif/);
    expect(
      await environment
        .db("dmmarket_auth_events")
        .where({ actor_id: user.id, action: "reports.export_prepared" })
        .first(),
    ).toBeTruthy();
  },
);

test("lectura global y exportación propia requieren acotar explícitamente el conjunto", async () => {
  const { client } = await reader([
    grant("sales.read"),
    grant("sales.export", "assigned"),
    grant("sales.financial", "assigned"),
  ]);
  expect((await client.request(`/api/exports/sales?${salesRange}`)).status).toBe(403);
  expect((await client.request(`/api/exports/sales?${salesRange}&employeeId=B`)).status).toBe(403);
  const result = await client.request(`/api/exports/sales?${salesRange}&employeeId=A`);
  expect(result.status).toBe(200);
  expect(Number(result.body.data[0].utilidad)).toBe(39);
  expect(result.body.total).toBe(1);
});

test("exportar global no amplía privilegios financieros propios", async () => {
  const { client } = await reader([grant("sales.read"), grant("sales.export"), grant("sales.financial", "assigned")]);
  const result = await client.request(`/api/exports/sales?${salesRange}`);
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(2);
  expect(result.body.columns.some((column) => ["utilidad", "promedio"].includes(column.key))).toBe(false);
  expect((await client.request(`/api/exports/sales?${salesRange}&sortBy=utilidad`)).status).toBe(403);
});

test("compras e inventario conservan omisión monetaria y permisos separados de proveedores", async () => {
  const { client } = await reader([
    grant("purchases.read"),
    grant("purchases.export"),
    grant("inventory.read"),
    grant("inventory.export"),
  ]);
  const purchases = await client.request(`/api/exports/purchases?${buyRange}&kind=products`);
  expect(purchases.status).toBe(200);
  expect(purchases.body.total).toBe(2);
  expect(JSON.stringify(purchases.body)).not.toMatch(/monto|avgUnitCost|PRIVATE/);
  const inventory = await client.request("/api/exports/inventory?search=Inventario");
  expect(inventory.status).toBe(200);
  expect(inventory.body.total).toBe(4);
  expect(JSON.stringify(inventory.body)).not.toMatch(/PrecioA|inventoryValue|Proveedor|PRIVATE/);
});

test("directorio de proveedores exporta sólo nombre e ID sin transacciones ni contactos", async () => {
  const { client } = await reader([grant("providers.read"), grant("providers.export")]);
  const result = await client.request("/api/exports/providers?search=compras");
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(2);
  expect(result.body.columns.map((column) => column.key)).toEqual(["IdProveedor", "Empresa"]);
  expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|Rif|Telfs|Email|Monto/);
});

test("producto sin ID no se pierde del conteo ni de la exportación", async () => {
  await environment
    .db("masterfact")
    .insert({ IdFactura: "export-null", IdCliente: "C", IdVend: "A", Fecha: "2026-03-01", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "export-null", IdProducto: null, Precio: 5, Costo: 1, Cantidad: 1 });
  const { client } = await reader([grant("sales.read", "assigned"), grant("sales.export", "assigned")]);
  const result = await client.request("/api/exports/sales?from=2026-03-01&to=2026-03-31&kind=products");
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(1);
  expect(result.body.data).toHaveLength(1);
  expect((await client.request("/api/sales/productos?from=2026-03-01&to=2026-03-31")).body.pagination.total).toBe(1);
});

test("parámetros y exceso de registros se rechazan sin exportación parcial", async () => {
  const { client } = await reader([
    grant("sales.read"),
    grant("sales.export"),
    grant("inventory.read"),
    grant("inventory.export"),
  ]);
  for (const suffix of ["limit=1", "page=2", "kind=private", "export=true", "format=csv"])
    expect((await client.request(`/api/exports/sales?${salesRange}&${suffix}`)).status).toBe(400);
  await environment.db("productos").insert(
    Array.from({ length: 5000 }, (_, i) => ({
      IdProducto: `EXPORT-${i}`,
      Descripcion: `Exportación sintética ${i}`,
      Grupo: "G",
      PrecioA: 1,
      Existencia: 1,
    })),
  );
  expect((await client.request("/api/exports/inventory")).status).toBe(413);
});

test("Pareto de compras conserva clasificación canónica y exige lectura, costos y exportación independientes", async () => {
  for (const missing of ["purchases.read", "purchases.costs", "purchases.export"]) {
    const { client } = await reader(
      ["purchases.read", "purchases.costs", "purchases.export"]
        .filter((capability) => capability !== missing)
        .map((capability) => grant(capability)),
    );
    expect((await client.request(`/api/exports/purchases?${buyRange}&kind=pareto`)).status).toBe(403);
  }
  const { client } = await reader(
    ["purchases.read", "purchases.costs", "purchases.export"].map((capability) => grant(capability)),
  );
  const result = await client.request(`/api/exports/purchases?${buyRange}&kind=pareto`);
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(2);
  expect(result.body.data.map((row) => row.cumulativePercent)).toEqual([61.54, 100]);
  expect(result.body.data.map((row) => row.abcClass)).toEqual(["A", "C"]);
  expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|Proveedor|avgUnitCost/);
});

test("documento exportado exige alcance del vendedor exacto y no conserva utilidad de un alcance mayor", async () => {
  const { client } = await reader([
    grant("sales.read"),
    grant("sales.export", "assigned"),
    grant("sales.financial", "assigned"),
  ]);
  const permitted = await client.request("/api/exports/sales/1?showNoe=false");
  expect(permitted.status).toBe(200);
  expect(permitted.body.utilidad).toBe(39);
  expect((await client.request("/api/exports/sales/2?showNoe=false")).status).toBe(403);
  const basic = await reader([grant("sales.read"), grant("sales.export")]);
  const omitted = await basic.client.request("/api/exports/sales/1?showNoe=false");
  expect(omitted.status).toBe(200);
  expect(omitted.body).not.toHaveProperty("utilidad");
  expect(omitted.body.productos[0]).not.toHaveProperty("costo");
});

test("despacho exporta selección completa autorizada sin reconstruir costos ni mezclar vendedores", async () => {
  const basic = await reader([grant("sales.read"), grant("sales.export")]);
  expect(
    (
      await basic.client.request("/api/exports/sales/dispatch", {
        method: "POST",
        csrf: "",
        body: { invoiceIds: ["1"], showNoe: false },
      })
    ).status,
  ).toBe(403);
  const result = await basic.client.request("/api/exports/sales/dispatch", {
    method: "POST",
    body: { invoiceIds: ["1", "2"], showNoe: false },
  });
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(300);
  expect(result.body.products).toHaveLength(1);
  expect(result.body.products[0].quantity).toBe(2);
  expect(result.body.products[0].total).toBe(300);
  expect(result.body.products[0]).not.toHaveProperty("utilidad");
  expect(result.body.products[0]).not.toHaveProperty("cost");
  const own = await reader([
    grant("sales.read"),
    grant("sales.export", "assigned"),
    grant("sales.financial", "assigned"),
  ]);
  expect(
    (
      await own.client.request("/api/exports/sales/dispatch", {
        method: "POST",
        body: { invoiceIds: ["1", "2"], showNoe: false },
      })
    ).status,
  ).toBe(403);
  const permitted = await own.client.request("/api/exports/sales/dispatch", {
    method: "POST",
    body: { invoiceIds: ["1"], showNoe: false },
  });
  expect(permitted.status).toBe(200);
  expect(permitted.body.products[0].utilidad).toBe(39);
  expect(
    (
      await own.client.request("/api/exports/sales/dispatch", {
        method: "POST",
        body: { invoiceIds: ["missing"], showNoe: false },
      })
    ).status,
  ).toBe(404);
  const readOnly = await reader([grant("sales.read")]);
  expect(
    (
      await readOnly.client.request("/api/exports/sales/dispatch", {
        method: "POST",
        body: { invoiceIds: ["1"], showNoe: false },
      })
    ).status,
  ).toBe(403);
});

test("clientes originales exportan catálogo sin otorgar ventas y respetan el alcance de sus analíticas", async () => {
  await require("../../../tests/support/party-fixtures.cjs").seedParties(environment.db);
  const catalog = await reader([grant("clients.read"), grant("clients.export")]);
  const result = await catalog.client.request(`/api/exports/clients?${salesRange}`);
  expect(result.status).toBe(200);
  expect(result.body.data[0]).toHaveProperty("Empresa");
  expect(JSON.stringify(result.body)).not.toMatch(/total_ventas|num_ventas|utilidad|PRIVATE/);
  const own = await reader([grant("clients.read"), grant("clients.export"), grant("sales.read", "assigned")]);
  const rows = await own.client.request(`/api/exports/clients?${salesRange}`);
  expect(rows.status).toBe(200);
  expect(Number(rows.body.data.find((row) => row.IdCliente === "C").total_ventas)).toBe(100);
  expect(JSON.stringify(rows.body)).not.toMatch(/utilidad|PRIVATE/);
  const inactive = await own.client.request("/api/exports/clients?kind=inactive&from=2026-02-01&to=2026-02-28");
  expect(inactive.status).toBe(200);
  expect(inactive.body.columns.map((column) => column.key)).toEqual(
    expect.arrayContaining(["last_factura", "dias_inactivo", "revenue_historico", "ruta"]),
  );
});

test("PDF original de cartera requiere exportación propia y no concede lectura de facturas", async () => {
  await require("../../../tests/support/receivables-fixtures.cjs").seedReceivables(environment.db);
  const read = await reader([grant("receivables.read")]);
  expect((await read.client.request("/api/exports/receivables/C")).status).toBe(403);
  const full = await reader([grant("receivables.read"), grant("receivables.export")]);
  const result = await full.client.request("/api/exports/receivables/C?documents=all");
  expect(result.status).toBe(200);
  expect(result.body.summary.balance).toBe("300.0000");
  expect(result.body.documents.total).toBe(3);
  expect(result.body.documents.data.every((row) => row.canReadSale === false)).toBe(true);
  expect(JSON.stringify(result.body)).not.toContain("PRIVATE");
  expect((await full.client.request("/api/sales/1")).status).toBe(403);
});

test("exportación de vendedores cubre el catálogo completo, no sólo sus ventas propias", async () => {
  const partial = await reader([
    grant("sellers.read"),
    grant("sellers.export", "assigned"),
    grant("sales.read", "assigned"),
  ]);
  expect((await partial.client.request(`/api/exports/sellers?${salesRange}`)).status).toBe(403);
  const scoped = await partial.client.request(`/api/exports/sellers?${salesRange}&employeeId=A`);
  expect(scoped.status).toBe(200);
  expect(scoped.body.data.map((row) => row.sellerId)).toEqual(["A"]);
  const own = await reader([
    grant("sellers.read", "assigned"),
    grant("sellers.export", "assigned"),
    grant("sales.read"),
  ]);
  const result = await own.client.request(`/api/exports/sellers?${salesRange}`);
  expect(result.status).toBe(200);
  expect(result.body.data.map((row) => row.sellerId)).toEqual(["A"]);
  expect(Number(result.body.data[0].sales)).toBe(100);
  expect(JSON.stringify(result.body)).not.toMatch(/profit|marginPercent|PRIVATE/);
  const catalog = await reader([grant("sellers.read"), grant("sellers.export")]);
  const rows = await catalog.client.request(`/api/exports/sellers?${salesRange}`);
  expect(rows.status).toBe(200);
  expect(rows.body.data.every((row) => Object.keys(row).sort().join(",") === "name,sellerId")).toBe(true);
});
