const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
const { seedProviders } = require("../../../tests/support/provider-fixtures.cjs");
let environment;
const range = "from=2026-11-01&to=2026-11-30";
const grant = (capability, scope = "global") => ({ capability, scope });
async function reader(permissions) {
  const user = await environment.seedUser({ permissions });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedPurchases(environment.db);
  await seedProviders(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("PDF de proveedor no infiere exportaciones de transacciones desde lectura ni desde exportación de directorio", async () => {
  for (const permissions of [
    [grant("providers.read"), grant("sales.read")],
    [grant("providers.read"), grant("sales.read"), grant("providers.export")],
    [grant("providers.read"), grant("sales.export")],
  ]) {
    const client = await reader(permissions);
    expect((await client.request(`/api/exports/providers/PUR-A/sales-documents?${range}`)).status).toBe(403);
  }
  const only = await reader([grant("providers.read"), grant("purchases.export")]);
  expect((await only.request("/api/exports/providers/PUR-A/purchases/provider-purchase-A")).status).toBe(403);
});

test("PDF original conserva porciones del proveedor y autorización individual sin abrir otra cuenta", async () => {
  const client = await reader([grant("providers.read"), grant("sales.read"), grant("sales.export", "assigned")]);
  const own = await client.request("/api/exports/sales/provider-sale-A?proveedorId=PUR-A&showNoe=false");
  expect(own.status).toBe(200);
  expect(own.body.total).toBe(100);
  expect(own.body.productos).toHaveLength(1);
  expect(own.body).not.toHaveProperty("utilidad");
  expect((await client.request("/api/exports/sales/provider-sale-B?proveedorId=PUR-A&showNoe=false")).status).toBe(403);
  expect((await client.request(`/api/exports/providers/PUR-A/sales-documents?${range}`)).status).toBe(403);
  const bundle = await client.request(`/api/exports/providers/PUR-A/sales-documents?${range}&employeeId=A`);
  expect(bundle.status).toBe(200);
  expect(bundle.body.total).toBe(1);
  expect(bundle.body.data[0].detail.total).toBe(100);
});

test("PDF original de compras oculta importes sin costos y valida proveedor antes de exportar", async () => {
  const client = await reader([grant("providers.read"), grant("purchases.read"), grant("purchases.export")]);
  const result = await client.request("/api/exports/providers/PUR-A/purchases/provider-purchase-A");
  expect(result.status).toBe(200);
  expect(result.body.unidades).toBe("2.000");
  expect(result.body).not.toHaveProperty("total");
  expect(result.body.productos[0]).not.toHaveProperty("precio");
  expect((await client.request("/api/exports/providers/PUR-A/purchases/provider-purchase-B")).status).toBe(404);
  const full = await reader([
    grant("providers.read"),
    grant("purchases.read"),
    grant("purchases.costs"),
    grant("purchases.export"),
  ]);
  const bundle = await full.request(`/api/exports/providers/PUR-A/purchase-documents?${range}`);
  expect(bundle.status).toBe(200);
  expect(bundle.body.data[0].detail.total).toBe("14.00");
});

test("exportar clientes y vendedores del producto mantiene sus capacidades y alcances separados", async () => {
  const client = await reader([
    grant("providers.read"),
    grant("clients.read"),
    grant("clients.export"),
    grant("sales.read"),
  ]);
  const rows = await client.request(`/api/exports/providers/PUR-A/clients?${range}&productId=PROV-P`);
  expect(rows.status).toBe(200);
  expect(rows.body.total).toBe(2);
  expect((await client.request(`/api/exports/providers/PUR-A/sellers?${range}&productId=PROV-P`)).status).toBe(403);
  const own = await reader([
    grant("providers.read"),
    grant("sellers.read", "assigned"),
    grant("sellers.export", "assigned"),
    grant("sales.read"),
  ]);
  const sellers = await own.request(`/api/exports/providers/PUR-A/sellers?${range}&productId=PROV-P`);
  expect(sellers.status).toBe(200);
  expect(sellers.body.data.map((row) => row.sellerId)).toEqual(["A"]);
});
