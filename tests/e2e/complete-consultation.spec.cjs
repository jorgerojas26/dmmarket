const { test: base, expect, login } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite verifica consultas completas en Chrome.");
      const environment = await startEnvironment({ web: true });
      try {
        await require("../support/sales-fixtures.cjs").seedSales(environment.db);
        await require("../support/party-fixtures.cjs").seedParties(environment.db);
        await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
        await require("../support/receivables-fixtures.cjs").seedReceivables(environment.db);
        await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});
const grant = (capability) => ({ capability, scope: "global" });

test("consultar ventas ofrece indicadores monetarios y análisis completos sin utilidad", async ({
  page,
  environment,
}) => {
  await login(page, environment, await environment.seedUser({ permissions: [grant("sales.dashboard.read")] }));
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$");
  await expect(page.getByRole("button", { name: "Ayuda sobre Modos del Pareto", exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Utilidad" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("cartera de consulta conserva el modal completo de deuda y no ofrece abonos", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser({ permissions: [grant("clients.receivables.read")] }));
  await page.goto(`${environment.origin}/clientes?view=receivables`);
  await expect(page.getByText("Saldo pendiente", { exact: true })).toBeVisible();
  await expect(page.locator(".cxc-client-link").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Abonar a / })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Acciones", exact: true })).toHaveCount(0);
  await page.locator(".cxc-client-link").first().click();
  const modal = page.getByRole("dialog").first();
  await expect(modal.getByText("Saldo pendiente", { exact: true })).toBeVisible();
  await expect(modal.locator(".cxc-documents-card")).toBeVisible();
  await expect(modal.locator(".cxc-account-overview")).toBeVisible();
  await expect(modal.getByRole("button", { name: /^Registrar abono$/ })).toHaveCount(0);
  await expect(modal).toContainText("$");
});

test("rentabilidad vinculada con consulta global conserva análisis comercial sin pedir utilidad ajena", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({
    permissions: [grant("sales.dashboard.read"), { capability: "sales.dashboard.financial", scope: "assigned" }],
  });
  await environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: user.id, seller_id: "A" });
  const rejected = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/dashboard/") && response.status() === 403) rejected.push(response.url());
  });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$");
  await expect
    .poll(async () => page.locator(".dashboard-panel").filter({ hasText: "Análisis Pareto" }).count())
    .toBeGreaterThan(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(rejected).toEqual([]);
});

test("un fallo del Pareto muestra un error recuperable sin vaciar los indicadores de ventas", async ({
  page,
  environment,
}) => {
  let unavailable = true;
  await page.route("**/api/dashboard/pareto?**", async (route) => {
    if (unavailable)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Análisis temporalmente no disponible" } }),
      });
    else await route.continue();
  });
  await login(page, environment, await environment.seedUser({ permissions: [grant("sales.dashboard.read")] }));
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
  await expect(page.getByRole("alert")).toContainText("No se pudo cargar el análisis Pareto");
  await expect(page.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" })).toContainText("$");
  unavailable = false;
  await page.getByRole("button", { name: "Reintentar análisis", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
