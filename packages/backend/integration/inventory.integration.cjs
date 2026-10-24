const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedInventory } = require("../../../tests/support/inventory-fixtures.cjs");
let environment;
const grant = (capability) => ({ capability, scope: "global" });
const search = "search=Inventario%20sint%C3%A9tico";
async function reader(permissions) {
  const user = await environment.seedUser({ permissions });
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedInventory(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("lectura de inventario no se infiere de costos, ventas o administración", async () => {
  for (const permission of [
    "inventory.costs",
    "inventory.export",
    "sales.read",
    "purchases.read",
    "providers.read",
    "providers.personal",
    "access.users",
  ]) {
    const client = await reader([grant(permission)]);
    expect((await client.request("/api/products")).status).toBe(403);
  }
});

test("inventario básico omite importes, proveedores y derivados incluso con permisos financieros ajenos", async () => {
  const client = await reader([grant("inventory.read"), grant("sales.costs"), grant("purchases.costs")]);
  const result = await client.request(`/api/products?${search}&limit=1&sortBy=IdProducto&sortDir=asc`);
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ total: 4, page: 1, limit: 1, totals: { existencia: null } });
  expect(result.body.data[0]).toMatchObject({ IdProducto: "I-A", Existencia: "2.000000", Grupo: "Grupo sintético" });
  expect(JSON.stringify(result.body)).not.toMatch(/PrecioA|inventoryValue|Proveedor|proveedorId|PRIVATE|123\.45/);
  for (const suffix of ["sortBy=PrecioA", "sortBy=inventoryValue", "sortBy=Proveedor", "proveedorId=I-PROV-A"])
    expect((await client.request(`/api/products?${search}&${suffix}`)).status).toBe(403);
});

test("valores autorizados y totales se calculan sobre todo el filtro, no la página", async () => {
  const client = await reader([grant("inventory.read"), grant("inventory.costs")]);
  const result = await client.request(`/api/products?${search}&categoryId=G&limit=1&sortBy=PrecioA`);
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(2);
  expect(result.body.data[0]).toMatchObject({ IdProducto: "I-A", PrecioA: "123.450000", inventoryValue: "246.90" });
  expect(result.body.totals).toEqual({ existencia: "2.000", inventoryValue: "246.90" });
  const second = await client.request(`/api/products?${search}&categoryId=G&limit=1&sortBy=PrecioA&page=2`);
  expect(second.body.data[0].IdProducto).toBe("I-B");
  expect(second.body.totals).toEqual(result.body.totals);
  expect(second.body.data[0].inventoryValue).toBe("0.00");
});

test("stock desconocido no se convierte en cero y negativos se conservan", async () => {
  const client = await reader([grant("inventory.read"), grant("inventory.costs")]);
  const result = await client.request(`/api/products?${search}&sortBy=IdProducto&sortDir=asc`);
  expect(result.body.totals).toEqual({ existencia: null, inventoryValue: null });
  expect(result.body.data.find((row) => row.IdProducto === "I-C")).toMatchObject({
    Existencia: null,
    PrecioA: null,
    inventoryValue: null,
    Grupo: "Grupo no registrado (MISSING)",
  });
  expect(result.body.data.find((row) => row.IdProducto === "I-D")).toMatchObject({
    Existencia: "-1.000000",
    inventoryValue: "-10.00",
  });
  const stocked = await client.request(`/api/products?${search}&stockOnly=true`);
  expect(stocked.body.total).toBe(1);
  expect(stocked.body.data[0].IdProducto).toBe("I-A");
  expect(stocked.body.totals).toEqual({ existencia: "2.000", inventoryValue: "246.90" });
  const empty = await client.request(`/api/products?${search}&categoryId=NOPE`);
  expect(empty.body.totals).toEqual({ existencia: "0.000", inventoryValue: "0.00" });
});

test("proveedores requieren lectura separada y nunca incorporan identificación ni contactos", async () => {
  const client = await reader([grant("inventory.read"), grant("providers.read")]);
  const result = await client.request(`/api/products?${search}&proveedorId=I-PROV-A&sortBy=Proveedor`);
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(2);
  expect(result.body.data.every((row) => row.Proveedor === "Proveedor inventario A")).toBe(true);
  expect(result.body.data[0]).not.toHaveProperty("PrecioA");
  expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|Rif|Telfs|Email/);
  const orphan = await client.request(`/api/products?${search}&proveedorId=MISSING`);
  expect(orphan.body.data[0].Proveedor).toBe("Proveedor no registrado (MISSING)");
});

test("búsquedas sólo usan datos públicos y parámetros no permiten exportaciones ni escrituras", async () => {
  const client = await reader([grant("inventory.read")]);
  for (const term of ["123.45", "PRIVATE-PROVIDER", "' OR 1=1 --"])
    expect((await client.request(`/api/products?search=${encodeURIComponent(term)}`)).body.total).toBe(0);
  for (const suffix of [
    "limit=101",
    "page=0",
    "limit=all",
    "stockOnly=1",
    "sortBy=Rif",
    "sortDir=invalid",
    "export=true",
    "showNoe=true",
    "Costo=1",
  ])
    expect((await client.request(`/api/products?${suffix}`)).status).toBe(400);
  const defaultPage = await client.request("/api/products");
  expect(defaultPage.body.limit).toBe(20);
  expect(
    (await client.request("/api/products", { method: "POST", body: { IdProducto: "I-A", Existencia: 999 } })).status,
  ).toBe(403);
  expect(Number((await environment.db("productos").where("IdProducto", "I-A").first()).Existencia)).toBe(2);
});

test("identificadores binarios no mezclan grupos o proveedores con mayúsculas diferentes", async () => {
  await environment.db.raw(
    "ALTER TABLE productos MODIFY Proveedor VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment
    .db("proveedores")
    .insert({ IdProveedor: "i-prov-a", Empresa: "Otro proveedor minúscula", Rif: "PRIVATE-LOWER" });
  const client = await reader([grant("inventory.read"), grant("providers.read")]);
  expect((await client.request(`/api/products?${search}&proveedorId=i-prov-a`)).body.total).toBe(0);
  const result = await client.request(`/api/products?${search}&proveedorId=I-PROV-A`);
  expect(result.body.total).toBe(2);
  expect(result.body.data.every((row) => row.Proveedor === "Proveedor inventario A")).toBe(true);
});

test("omitir limit nunca devuelve todo el inventario y las páginas conservan totales globales", async () => {
  await environment.db("productos").insert(
    Array.from({ length: 25 }, (_, i) => ({
      IdProducto: `I-PAGE-${i}`,
      Descripcion: `Página de inventario ${i}`,
      Grupo: "G",
      Proveedor: "I-PROV-A",
      PrecioA: 42,
      Existencia: 1,
    })),
  );
  const client = await reader([grant("inventory.read")]);
  const first = await client.request("/api/products?sortBy=IdProducto&sortDir=asc");
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ total: 30, page: 1, limit: 20 });
  expect(first.body.data).toHaveLength(20);
  const second = await client.request("/api/products?sortBy=IdProducto&sortDir=asc&page=2");
  expect(second.body.data).toHaveLength(10);
  expect(second.body.total).toBe(first.body.total);
  expect(second.body.totals).toEqual(first.body.totals);
  expect(new Set([...first.body.data, ...second.body.data].map((row) => row.IdProducto)).size).toBe(30);
  expect(second.body.totals).not.toHaveProperty("inventoryValue");
});
