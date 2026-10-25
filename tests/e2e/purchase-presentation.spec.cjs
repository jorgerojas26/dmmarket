const { test: base, expect, login, openModule } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedPurchases } = require("../support/purchase-fixtures.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true });
      try {
        await seedSales(environment.db);
        await seedPurchases(environment.db);
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});
const grant = (capability) => ({ capability, scope: "global" });
async function enter(page, environment, capabilities, from = "2026-08-01", to = "2026-08-31") {
  const user = await environment.seedUser({ permissions: capabilities.map(grant) });
  await login(page, environment, user);
  await openModule(page, "Compras");
  await page.goto(`${environment.origin}/compras?view=dashboard&from=${from}&to=${to}`);
  await expect(page.getByRole("heading", { name: "Dashboard de Compras", exact: true })).toBeVisible();
  return page.getByRole("region", { name: "Compras", exact: true });
}
const card = (report, label) => report.locator(".dashboard-kpi-card").filter({ hasText: label });
const pareto = (report) =>
  report.locator(".dashboard-panel").filter({
    has: report.page().locator(".dashboard-inline-title").filter({ hasText: "Análisis Pareto (ABC) de Compras" }),
  });

test("dashboard original básico conserva tarjetas y selector de fechas, sin gráficas monetarias ni consultas prohibidas", async ({
  page,
  environment,
}) => {
  const forbidden = [];
  page.on("request", (request) => {
    if (/\/api\/(sales|dashboard|providers|purchases\/pareto)/.test(request.url())) forbidden.push(request.url());
  });
  const report = await enter(page, environment, ["purchases.read"]);
  await expect(report.locator(".clients-sidebar")).toBeVisible();
  await expect(card(report, "Unidades")).toContainText("6");
  await expect(card(report, "Transacciones")).toContainText("3");
  await expect(report.locator(".dashboard-kpi-card")).toHaveCount(2);
  await expect(report.locator(".dashboard-inline-title").filter({ hasText: /^Top Productos/ })).toHaveCount(0);
  await expect(report.getByText("Categorías", { exact: true })).toHaveCount(0);
  await expect(report.getByText("Mejor Proveedor", { exact: true })).toHaveCount(0);
  expect(await report.innerText()).not.toMatch(/\$/);
  await report.locator(".date-range-trigger").click();
  await expect(report.locator(".date-range-dropdown")).toBeVisible();
  await report.getByRole("button", { name: "Hoy", exact: true }).click();
  await expect(report.locator(".date-range-dropdown")).toBeVisible();
  await report.getByRole("button", { name: "Listo", exact: true }).click();
  await expect(report.locator(".date-range-trigger")).toContainText("2026");
  expect(forbidden).toEqual([]);
});

test("dashboard original financiero conserva categorías, proveedor destacado y comparaciones con montos autorizados", async ({
  page,
  environment,
}) => {
  const report = await enter(page, environment, ["purchases.read", "purchases.costs", "providers.read"]);
  await expect(card(report, "Total Comprado")).toContainText("$130,00");
  await expect(card(report, "Total Comprado")).toContainText("712.5%");
  await expect(report.locator(".purchases-dashboard-best-provider")).toContainText("Proveedor compras A");
  await expect(report.locator(".dashboard-inline-title").filter({ hasText: /^Top Productos/ })).toBeVisible();
  await expect(report.locator(".dashboard-inline-title").filter({ hasText: /^Top Proveedores/ })).toBeVisible();
  await expect(report.locator(".purchases-dashboard-categories svg")).toBeVisible();
  await expect(report.getByText(/PRIVATE/)).toHaveCount(0);
  const panel = pareto(report);
  await expect(panel.getByRole("cell", { name: "61.54%", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Pareto original conserva cuarenta barras más resto, filtros ABC, paginación y PDF original con autorización independiente", async ({
  page,
  environment,
}) => {
  await environment
    .db("mastercomp")
    .insert({ IdFactura: "UI-PARETO", Fecha: "2027-04-01", IdProveedor: "PUR-A", Anulada: false });
  await environment.db("slavecomp").insert(
    Array.from({ length: 45 }, (_, i) => ({
      IdFactura: "UI-PARETO",
      IdProducto: `UI-${i}`,
      Descripcion: `Visual producto ${String(i).padStart(2, "0")}`,
      Precio: 45 - i,
      Cantidad: 1,
    })),
  );
  const report = await enter(
    page,
    environment,
    ["purchases.read", "purchases.costs", "purchases.export"],
    "2027-04-01",
    "2027-04-30",
  );
  const panel = pareto(report);
  const table = panel.getByRole("table");
  await expect(table.getByRole("cell", { name: "Visual producto 00", exact: true })).toBeVisible();
  await expect(
    panel.locator('svg rect[fill="#22c55e"], svg rect[fill="#f59e0b"], svg rect[fill="#ef4444"]'),
  ).toHaveCount(41);
  await panel.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(table.getByRole("cell", { name: "Visual producto 20", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Página siguiente", exact: true }).click();
  const row = table
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Visual producto 44", exact: true }) });
  await expect(row.getByRole("cell", { name: "45", exact: true })).toBeVisible();
  await expect(row.getByRole("cell", { name: "100%", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Clase C", exact: true }).click();
  await expect(table.getByRole("cell", { name: "Visual producto 44", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Visual producto 00", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Imprimir", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const prepared = page.waitForResponse((r) => r.url().includes("/api/exports/purchases?"));
  const opening = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Imprimir", exact: true }).click();
  const response = await prepared;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.total).toBe(45);
  expect(result.data[44]).toMatchObject({ rank: 45, abcClass: "C", cumulativePercent: 100 });
  const popup = await opening;
  await popup.waitForURL(/^blob:/);
  expect(
    await page.evaluate(
      async (url) => new TextDecoder().decode((await (await fetch(url)).arrayBuffer()).slice(0, 4)),
      popup.url(),
    ),
  ).toBe("%PDF");
  await popup.close();
});

test("dashboard original no transforma datos incompletos en cero ni dibuja un Pareto con base inválida", async ({
  page,
  environment,
}) => {
  await environment
    .db("mastercomp")
    .insert({ IdFactura: "UI-UNKNOWN", Fecha: "2028-01-01", IdProveedor: "PUR-A", Anulada: false });
  await environment.db("slavecomp").insert([
    { IdFactura: "UI-UNKNOWN", IdProducto: "UI-NEG", Descripcion: "Compra negativa", Precio: -10, Cantidad: 1 },
    { IdFactura: "UI-UNKNOWN", IdProducto: "UI-NULL", Descripcion: "Compra incompleta", Precio: null, Cantidad: null },
  ]);
  const report = await enter(page, environment, ["purchases.read", "purchases.costs"], "2028-01-01", "2028-01-31");
  await expect(card(report, "Total Comprado")).toContainText("No disponible");
  await expect(card(report, "Unidades")).toContainText("No disponible");
  const panel = pareto(report);
  await expect(panel.getByRole("cell", { name: "Compra incompleta", exact: true })).toBeVisible();
  await expect(
    panel.locator('svg rect[fill="#22c55e"], svg rect[fill="#f59e0b"], svg rect[fill="#ef4444"]'),
  ).toHaveCount(0);
  await expect(panel.getByRole("cell", { name: "No disponible", exact: true })).not.toHaveCount(0);
});
