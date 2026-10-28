const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
let environment;

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("la aplicación monta una única entrada API sin routers públicos de negocio", async () => {
  const app = backend("./index");
  try {
    const publicRoutes = app._router.stack.filter((layer) => layer.route?.path.startsWith("/api/"));
    expect(publicRoutes.map((layer) => layer.route.path)).toEqual(["/api/health"]);
    const mounts = app._router.stack.filter((layer) => !layer.route && layer.regexp.source.startsWith("^\\/api"));
    expect(mounts).toHaveLength(1);
  } finally {
    await backend("./database").destroy();
  }
});

test("los recursos y métodos retirados siguen denegados sin ejecutar handlers antiguos", async () => {
  const client = environment.client();
  for (const path of ["/api/sales", "/api/providers", "/api/employees", "/api/backups/drive/status"])
    expect((await client.request(path)).status).toBe(401);
  await client.login(await environment.seedUser());
  expect((await client.request("/api/sales/facturas?from=2026-01-01&to=2026-01-31")).status).toBe(403);
  expect((await client.request("/api/cache/clear", { method: "POST", body: { confirmed: true } })).status).toBe(403);
  expect((await client.request("/api/groups/unmapped")).status).toBe(403);
  expect((await client.request("/api/backups/drive/disconnect", { method: "POST", body: {} })).status).toBe(403);
  expect((await client.request("/api/currency_rates")).status).toBe(200);
});

test("el único router de ventas aplica el alcance tanto a lista como a detalle", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const client = environment.client();
  await client.login(user);
  const response = await client.request("/api/sales/facturas?from=2026-01-01&to=2026-01-31");
  expect(response.status).toBe(200);
  expect(response.body.data.map((row) => row.invoiceId)).toEqual(["1"]);
  expect(response.body.totals).not.toHaveProperty("utilidad");
  expect((await client.request("/api/invoices/1/detail")).status).toBe(200);
  expect((await client.request("/api/invoices/2/detail")).status).toBe(404);
});
