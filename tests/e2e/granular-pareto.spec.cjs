const { test: base, expect, login } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const grant = (capability) => ({ capability, scope: "global" });
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite verifica Chrome real.");
      const environment = await startEnvironment({ web: true });
      try {
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});

test("consulta del Dashboard incluye Pareto comercial sin rentabilidad", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/pareto-fixtures.cjs").seedPareto(environment.db);
  const user = await environment.seedUser({
    permissions: [
      grant("sales.dashboard.read"),
      grant("sales.pareto.read"),
      grant("sales.pareto.amounts"),
      grant("sales.pareto.export"),
    ],
  });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-06-01&to=2026-07-01`);
  await expect(page.getByRole("cell", { name: "Producto maduro", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Ganancia", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Imprimir", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Compras", exact: true })).toHaveCount(0);
  await expect(page.getByText("Venta Bruta", { exact: true })).toBeVisible();
});
