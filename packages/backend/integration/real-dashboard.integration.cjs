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
