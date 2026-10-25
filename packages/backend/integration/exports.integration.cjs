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
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  expect((await client.request(`/api/exports/sales?${salesRange}`)).status).toBe(403);
  expect((await client.request(`/api/exports/sales?${salesRange}&employeeId=B`)).status).toBe(403);
  const result = await client.request(`/api/exports/sales?${salesRange}&employeeId=A`);
  expect(result.status).toBe(200);
  expect(Number(result.body.data[0].utilidad)).toBe(39);
  expect(result.body.total).toBe(1);
});

test("exportar global no amplía privilegios financieros propios", async () => {
  const { client } = await reader([
    grant("sales.read"),
    grant("sales.export"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
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
  const { client } = await reader([grant("providers.read"), grant("providers.export"), grant("providers.personal")]);
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
