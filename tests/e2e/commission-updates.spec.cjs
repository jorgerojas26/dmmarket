const { test: base, expect, login, openModule } = require("./fixtures.cjs");
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
  await openModule(page, "Comisiones");
  const report = page.getByRole("region", { name: "Consulta autorizada de comisiones", exact: true });
  await report.getByLabel("ID del vendedor para comisiones", { exact: true }).fill("A");
  await report.getByRole("button", { name: "Consultar comisiones", exact: true }).click();
  const editor = report.getByRole("region", { name: "Edición autorizada de comisiones", exact: true });
  await editor.getByLabel("Grupo del porcentaje", { exact: true }).selectOption("G");
  await editor.getByLabel("Nuevo porcentaje de comisión", { exact: true }).fill("15.25");
  await editor.getByLabel("Motivo del cambio de porcentaje", { exact: true }).fill("Cambio de porcentaje E2E aprobado");
  await editor.getByRole("button", { name: "Previsualizar porcentaje", exact: true }).click();
  await expect(editor.getByRole("cell", { name: "10.0000", exact: true })).toBeVisible();
  await expect(editor.getByRole("cell", { name: "15.2500", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Confirmar porcentaje", exact: true }).click();
  await expect(
    report
      .getByRole("table", { name: "Porcentajes autorizados de comisión", exact: true })
      .getByRole("cell", { name: "15.2500", exact: true }),
  ).toBeVisible();
  const record = await environment.db("dmmarket_commission_operations").first();
  expect(record.actor_id).toBe(user.id);
  expect(JSON.parse(record.data).changes[0]).toMatchObject({ before: "10.0000", after: "15.2500" });
  await report.getByLabel("Vista de comisiones", { exact: true }).selectOption("sales");
  await report.getByLabel("Comisiones desde", { exact: true }).fill("2026-12-01");
  await report.getByLabel("Comisiones hasta", { exact: true }).fill("2026-12-31");
  await report.getByRole("button", { name: "Consultar comisiones", exact: true }).click();
  const row = report.getByRole("row").filter({ has: page.getByRole("cell", { name: "COM-A", exact: true }) });
  await expect(row.getByRole("cell", { name: "10", exact: true })).toBeVisible();
});
