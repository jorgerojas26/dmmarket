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

test("proveedores y ventas no conceden directorio de clientes o vendedores", async () => {
  const client = await reader([grant("providers.read"), grant("sales.read")]);
  for (const subresource of ["clients", "sellers"])
    expect((await client.request(`/api/providers/PUR-A/${subresource}?${range}`)).status).toBe(403);
});

test.each(["false", "true"])("clientes y comparativos usan sólo ventas propias showNoe=%s", async (showNoe) => {
  const client = await reader([grant("providers.read"), grant("clients.read"), grant("sales.read", "assigned")]);
  const result = await client.request(`/api/providers/PUR-A/clients?${range}&showNoe=${showNoe}`);
  expect(result.status).toBe(200);
  expect(result.body.pagination.total).toBe(1);
  expect(result.body.data[0]).toMatchObject({
    clientId: "C",
    name: "Cliente sintético",
    amount: "100.00",
    invoiceCount: 1,
  });
  expect(result.body.data[0]).not.toHaveProperty("profit");
  const ranked = await client.request(`/api/providers/best?${range}&showNoe=${showNoe}`);
  expect(ranked.status).toBe(200);
  expect(ranked.body.map((row) => [row.providerId, row.monto])).toEqual([
    ["PUR-A", "100.00"],
    ["PUR-B", "90.00"],
  ]);
});

test("vendedores propios intersectan ventas globales antes de agregar utilidad", async () => {
  const client = await reader([
    grant("providers.read"),
    grant("sellers.read", "assigned"),
    grant("sales.read"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  const result = await client.request(`/api/providers/PUR-A/sellers?${range}`);
  expect(result.status).toBe(200);
  expect(result.body.data).toEqual([
    {
      sellerId: "A",
      name: "Vendedor A",
      amount: "100.00",
      invoiceCount: 1,
      profit: "40.00",
      quantity: "1.000",
      clientCount: 1,
    },
  ]);
  const global = await reader([
    grant("providers.read"),
    grant("sellers.read"),
    grant("sales.read"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  const rows = await global.request(`/api/providers/PUR-A/sellers?${range}`);
  expect(rows.body.pagination.total).toBe(2);
  expect(rows.body.data.every((row) => !Object.hasOwn(row, "profit"))).toBe(true);
  expect((await global.request(`/api/providers/PUR-A/sellers?${range}&sortBy=profit`)).status).toBe(403);
});

test("clasificar por compras exige sus importes y no mezcla sistemas o filtros de vendedor", async () => {
  const basic = await reader([grant("providers.read"), grant("purchases.read")]);
  expect((await basic.request(`/api/providers/best?${range}&mode=compras`)).status).toBe(403);
  const allowed = await reader([grant("providers.read"), grant("purchases.read"), grant("purchases.costs")]);
  const result = await allowed.request(`/api/providers/best?${range}&mode=compras`);
  expect(result.status).toBe(200);
  expect(result.body.map((row) => row.monto)).toEqual(["99.00", "33.00", "14.00"]);
  expect((await allowed.request(`/api/providers/best?${range}&mode=compras&employeeId=A`)).status).toBe(400);
  expect((await allowed.request(`/api/providers/best?${range}&mode=compras&showNoe=false`)).status).toBe(400);
});

test("búsqueda y filtros preceden conteo, no se admiten ordenaciones de campos privados", async () => {
  const client = await reader([grant("providers.read"), grant("clients.read"), grant("sales.read")]);
  const result = await client.request(`/api/providers/PUR-A/clients?${range}&search=NO-MATCH&limit=1`);
  expect(result.body.pagination.total).toBe(0);
  expect(result.body.data).toEqual([]);
  expect((await client.request(`/api/providers/PUR-A/clients?${range}&sortBy=rif`)).status).toBe(400);
});

test.each(["false", "true"])(
  "detalle original de producto distingue clientes por vendedor y mantiene filtros antes de paginar showNoe=%s",
  async (showNoe) => {
    const client = await reader([grant("providers.read"), grant("clients.read"), grant("sales.read")]);
    const result = await client.request(`/api/providers/PUR-A/clients?${range}&showNoe=${showNoe}&productId=PROV-P`);
    expect(result.status).toBe(200);
    expect(result.body.pagination.total).toBe(2);
    expect(result.body.data.map((row) => [row.clientId, row.sellerId, Number(row.amount)]).sort()).toEqual([
      ["C", "A", 100],
      ["C", "B", 200],
    ]);
    expect(result.body.data.every((row) => !Object.hasOwn(row, "profit"))).toBe(true);
    const own = await client.request(
      `/api/providers/PUR-A/clients?${range}&showNoe=${showNoe}&productId=PROV-P&employeeId=A`,
    );
    expect(own.status).toBe(200);
    expect(own.body.pagination.total).toBe(1);
    expect(Number(own.body.data[0].amount)).toBe(100);
    const rows = await client.request(
      `/api/providers/PUR-A/sales?${range}&showNoe=${showNoe}&productId=PROV-P&employeeId=A&clientId=C`,
    );
    expect(rows.status).toBe(200);
    expect(rows.body.data.map((row) => row.invoiceId)).toEqual(["provider-sale-A"]);
    expect(Number(rows.body.data[0].quantity)).toBe(1);
  },
);
