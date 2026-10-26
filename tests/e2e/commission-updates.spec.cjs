const { test: base, expect, login } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedCommissions, prepareCommissionWrites } = require("../support/commission-fixtures.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true });
      try {
        await seedSales(environment.db);
        await seedCommissions(environment.db);
        await prepareCommissionWrites(environment.db);
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});

test("edición de comisión confirma actor y no recalcula capturas históricas", async ({ page, environment }) => {
  const user = await environment.seedUser({
    enrolled: true,
    permissions: [
      { capability: "commissions.read", scope: "assigned" },
      { capability: "commissions.update", scope: "global" },
      { capability: "sales.read", scope: "global" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await expect(page.getByRole("link", { name: "Ventas", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Comisiones", exact: true })).toHaveCount(0);
  await page.goto(`${environment.origin}/comisiones`);
  await expect(page.getByRole("region", { name: "Página no disponible", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Consulta autorizada de comisiones", exact: true })).toHaveCount(0);
  const applied = await page.evaluate(async () => {
    const payload = { commissionInfo: { G: "15.25" }, reason: "Cambio de porcentaje E2E aprobado" },
      headers = { "content-type": "application/json" };
    const previewResponse = await fetch("/api/employees/commissionInfo/A/preview", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const preview = await previewResponse.json();
    const committed = await fetch("/api/employees/commissionInfo/A", {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...payload, requestId: crypto.randomUUID(), snapshot: preview.snapshot }),
    });
    return {
      previewStatus: previewResponse.status,
      changes: preview.changes,
      status: committed.status,
      rates: await (await fetch("/api/employees/commissionInfo/A")).json(),
    };
  });
  expect(applied.previewStatus).toBe(200);
  expect(applied.changes[0]).toMatchObject({ before: "10.0000", after: "15.2500" });
  expect(applied.status).toBe(200);
  expect(applied.rates.find((row) => row.groupId === "G").commission).toBe("15.2500");
  const record = await environment.db("dmmarket_commission_operations").first();
  expect(record.actor_id).toBe(user.id);
  expect((typeof record.data === "string" ? JSON.parse(record.data) : record.data).changes[0]).toMatchObject({
    before: "10.0000",
    after: "15.2500",
  });
  const history = await page.evaluate(
    async () => await (await fetch("/api/employees/sales/A?from=2026-12-01&to=2026-12-31")).json(),
  );
  expect(history.data.find((row) => row.invoiceId === "COM-A").commissionTotal).toBe(10);
});
