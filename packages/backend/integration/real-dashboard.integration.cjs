const { backend } = require("../../../tests/support/auth-environment.cjs");
const { startRealReportsEnvironment } = require("../../../tests/support/real-reports-environment.cjs");
const { CAPABILITIES } = backend("./auth/capabilities");
let environment;
let client;
const range = "from=2026-01-01&to=2026-10-26&showNoe=false";

beforeAll(async () => {
  environment = await startRealReportsEnvironment();
  const user = await environment.seedUser({
    permissions: Object.keys(CAPABILITIES).map((capability) => ({ capability, scope: "global" })),
    enrolled: true,
  });
  client = environment.client();
  expect((await client.login(user)).body.stage).toBe("mfa");
  expect(
    (await client.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(user.secret) } }))
      .body.stage,
  ).toBe("ready");
});
afterAll(async () => {
  await environment?.close();
});

test.each(["ventas", "compras-sin-vender"])(
  "dashboard, Pareto %s, tasa y estado responden juntos con datos reales",
  async (mode) => {
    const paths = [
      `/api/dashboard/pareto?${range}&modo=${mode}&sortBy=${mode === "ventas" ? "netProfit" : "totalPurchased"}&sortDir=desc&newSortBy=firstPurchaseDate&newSortDir=desc&newPage=1&newLimit=10`,
      `/api/dashboard/sales?${range}&compareFrom=2025-03-08&compareTo=2025-12-31`,
      "/api/currency_rates",
      "/api/update/status",
    ];
    const responses = await Promise.all(
      paths.map(async (path) => {
        const start = Date.now();
        const response = await client.request(path);
        return {
          path: new URL(path, environment.origin).pathname,
          status: response.status,
          elapsed: Date.now() - start,
          body: response.body,
        };
      }),
    );
    for (const response of responses) {
      expect({ path: response.path, status: response.status }).toEqual({ path: response.path, status: 200 });
      expect(response.elapsed).toBeLessThan(8000);
    }
    expect(Array.isArray(responses[0].body.products)).toBe(true);
    if (mode === "ventas")
      expect(responses[0].body.products.length + responses[0].body.newProducts.length).toBeGreaterThan(0);
    expect(responses[2].elapsed).toBeLessThan(1000);
    expect(responses[3].elapsed).toBeLessThan(1000);
    expect(responses[1].body.kpis.totalInvoices).toBeGreaterThan(0);
    expect(responses[2].body.length).toBeGreaterThan(0);
  },
);

test.each([
  ["/dashboard/sales", 2500],
  ["/sellers/dashboard", 1800],
])("%s responde en frío sin esconder la regresión con caché", async (path, budget) => {
  expect((await client.request("/api/cache/clear", { method: "POST", body: { confirmed: true } })).status).toBe(200);
  const comparison = path === "/dashboard/sales" ? "&compareFrom=2025-03-08&compareTo=2025-12-31" : "";
  const start = Date.now();
  const response = await client.request(`/api${path}?${range}${comparison}`);
  const elapsed = Date.now() - start;
  expect(response.status).toBe(200);
  expect(response.headers["x-report-cache"]).toBe("MISS");
  expect(elapsed).toBeLessThan(budget);
});

test.each(["/clients/list", "/sellers/list"])("%s pagina sin repetir agregados ni usar caché", async (path) => {
  const start = Date.now();
  const response = await client.request(`/api${path}?${range}`);
  const elapsed = Date.now() - start;
  expect(response.status).toBe(200);
  expect(response.headers["x-report-cache"]).toBeUndefined();
  expect(elapsed).toBeLessThan(1800);
});

test("cartera y detalle usan los índices existentes sin depender de caché", async () => {
  const start = Date.now();
  const response = await client.request("/api/receivables?state=debt&due=all&page=1&sortBy=overdue&sortDir=desc");
  expect(response.status).toBe(200);
  expect(Date.now() - start).toBeLessThan(1500);
  expect(response.headers["x-report-cache"]).toBeUndefined();
  expect(response.body.total).toBeGreaterThan(0);
  const account = response.body.data[0];
  const detailStart = Date.now();
  const detail = await client.request(`/api/receivables/${encodeURIComponent(account.id)}`);
  expect(detail.status).toBe(200);
  expect(Date.now() - detailStart).toBeLessThan(1500);
  expect(detail.body.summary.balance).toBe(account.balance);
  expect(detail.body).toHaveProperty("rate");
  const columns = await environment
    .db("information_schema.COLUMNS")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .where({ TABLE_NAME: "divisas" })
    .pluck("COLUMN_NAME");
  expect(columns).toContain("IdDivisa");
});
