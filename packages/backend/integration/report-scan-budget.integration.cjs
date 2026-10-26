const { backend } = require("../../../tests/support/auth-environment.cjs");
const { realDatabase } = require("../../../tests/support/test-database.cjs");
const { CAPABILITIES, createAccess } = backend("./auth/capabilities");
const { createSalesReports } = backend("./auth/sales-reports");
const { createPartyReports } = backend("./auth/party-reports");
const access = createAccess(
  Object.keys(CAPABILITIES).map((capability) => ({ capability, scope: "global" })),
  [],
);
let db;
beforeAll(() => {
  db = realDatabase();
});
afterAll(async () => {
  await db?.destroy();
});

for (const showNoe of ["false", "true"]) {
  test.each([
    ["/dashboard/sales", createSalesReports, 3],
    ["/sellers/dashboard", createPartyReports, 2],
    ["/clients/list", createPartyReports, 1],
    ["/sellers/list", createPartyReports, 1],
  ])(`%s mantiene el presupuesto de escaneos sin caché con NOE=${showNoe}`, async (path, createRouter, budget) => {
    let scans = 0;
    const table = showNoe === "true" ? "slavenoe" : "slavefact";
    const collect = (query) => {
      scans += (query.sql.match(new RegExp(`\\bfrom\\s+\`?${table}\\b`, "gi")) || []).length;
    };
    const sessions = {
      withSession: (_sid, _options, work) => db.transaction((transaction) => work({ transaction, access })),
    };
    const router = createRouter({ sessions });
    const handle = router.stack.find((layer) => layer.route?.path === path).route.stack[0].handle;
    const query = { from: "2026-01-01", to: "2026-10-26", showNoe };
    if (path === "/dashboard/sales") Object.assign(query, { compareFrom: "2025-03-08", compareTo: "2025-12-31" });
    let body;
    let failure;
    db.on("query", collect);
    try {
      await handle(
        { method: "GET", path: "/uncached-computation", query, params: {}, sessionID: "computation" },
        {
          json(value) {
            body = value;
          },
        },
        (error) => {
          failure = error;
        },
      );
    } finally {
      db.removeListener("query", collect);
    }
    if (failure) throw failure;
    if (path.endsWith("/list")) expect(Array.isArray(body.data)).toBe(true);
    else expect(body.kpis).toBeDefined();
    expect(scans).toBeGreaterThan(0);
    expect(scans).toBeLessThanOrEqual(budget);
  });
}
