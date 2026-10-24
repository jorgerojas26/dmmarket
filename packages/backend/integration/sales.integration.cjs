const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
let environment;
const query = "from=2026-01-01&to=2026-01-31";
async function reader(permissions, sellers = []) {
  const user = await environment.seedUser({ permissions });
  if (sellers.length)
    await environment
      .db("dmmarket_auth_user_sellers")
      .insert(sellers.map((seller_id) => ({ user_id: user.id, seller_id })));
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test.each(["false", "true"])("vendedor A solo ve su SQL antes de contar/sumar/paginar showNoe=%s", async (showNoe) => {
  const client = await reader([{ capability: "sales.read", scope: "assigned" }], ["A"]);
  const response = await client.request(`/api/sales/facturas?${query}&showNoe=${showNoe}&limit=1`);
  expect(response.status).toBe(200);
  expect(response.body.pagination.total).toBe(1);
  expect(response.body.data[0].invoiceId).toBe(showNoe === "true" ? "2" : "1");
  expect(Number(response.body.totals.monto)).toBe(showNoe === "true" ? 200 : 100);
  expect(JSON.stringify(response.body)).not.toMatch(/utilidad|promedio|Costo|Rif|PRIVATE-IDENTIFICATION/);
  const forbidden = await client.request(`/api/sales/productos?${query}&showNoe=${showNoe}&employeeId=B`);
  expect(forbidden.body.pagination.total).toBe(0);
  expect(forbidden.body.data).toEqual([]);
});

test("alcance vacío deniega y filtros no amplían a otro vendedor", async () => {
  const client = await reader([{ capability: "sales.read", scope: "assigned" }]);
  expect((await client.request(`/api/sales/facturas?${query}`)).status).toBe(403);
});

test("lectura global más utilidad/costos propios no expone márgenes globales ni ordenación", async () => {
  const client = await reader(
    [
      { capability: "sales.read", scope: "global" },
      { capability: "sales.costs", scope: "assigned" },
      { capability: "sales.profit", scope: "assigned" },
    ],
    ["A"],
  );
  const all = await client.request(`/api/sales/facturas?${query}`);
  expect(all.body.pagination.total).toBe(2);
  expect(Number(all.body.totals.monto)).toBe(300);
  expect(all.body.totals).not.toHaveProperty("utilidad");
  expect(all.body.data.every((row) => !Object.hasOwn(row, "utilidad"))).toBe(true);
  expect((await client.request(`/api/sales/facturas?${query}&sortBy=utilidad`)).status).toBe(403);
  expect((await client.request(`/api/sales/productos?${query}&sortBy=averageProfitPercent`)).status).toBe(403);
  const own = await client.request(`/api/sales/productos?${query}&employeeId=A&sortBy=netProfit`);
  expect(own.status).toBe(200);
  expect(Number(own.body.totals.netProfit)).toBe(39);
  const other = await client.request(`/api/sales/productos?${query}&employeeId=B`);
  expect(other.body.totals).not.toHaveProperty("netProfit");
});

test("métricas de utilidad no permiten deducir costo sin ambas capacidades", async () => {
  const client = await reader([
    { capability: "sales.read", scope: "global" },
    { capability: "sales.profit", scope: "global" },
  ]);
  const response = await client.request(`/api/sales/productos?${query}`);
  expect(response.status).toBe(200);
  expect(response.body.totals).not.toHaveProperty("netProfit");
  expect((await client.request(`/api/sales/productos?${query}&sortBy=netProfit`)).status).toBe(403);
});

test("analista autorizado recibe métricas completas y límites validados", async () => {
  const client = await reader(
    ["sales.read", "sales.costs", "sales.profit"].map((capability) => ({ capability, scope: "global" })),
  );
  const response = await client.request(`/api/sales/productos?${query}&limit=1`);
  expect(response.status).toBe(200);
  expect(response.body.pagination.total).toBe(1);
  expect(Number(response.body.totals.rawProfit)).toBe(300);
  expect(Number(response.body.totals.netProfit)).toBe(146);
  for (const suffix of ["&limit=1000", "&sortBy=Costo", "&privateField=Rif", "&showNoe=unknown", "&page=0"])
    expect((await client.request(`/api/sales/productos?${query}${suffix}`)).status).toBe(400);
});
