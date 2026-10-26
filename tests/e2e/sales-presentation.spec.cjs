const { test: base, expect, login } = require("./fixtures.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true });
      try {
        await seedSales(environment.db);
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});
async function enter(page, environment, permissions, view = "dashboard") {
  const user = await environment.seedUser({ permissions });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(
    `${environment.origin}/ventas?view=${view}&from=2026-01-01&to=2026-01-31&dFrom=2026-01-01&dTo=2026-01-31`,
  );
  return page.getByRole("region", { name: "Ventas", exact: true });
}
const grant = (capability, scope = "global") => ({ capability, scope });
const card = (report, label) => report.locator(".dashboard-kpi-card").filter({ hasText: label });

test("dashboard original conserva tarjetas y categorías propias, ocultando rankings de utilidad y consultas no autorizadas", async ({
  page,
  environment,
}) => {
  const forbidden = [];
  page.on("request", (r) => {
    if (/\/api\/(purchases|dashboard\/pareto|providers|exports)/.test(r.url())) forbidden.push(r.url());
  });
  const report = await enter(page, environment, [grant("sales.read", "assigned")]);
  await expect(card(report, "Venta Bruta")).toContainText("$100,00");
  await expect(card(report, "Ganancia Neta")).toHaveCount(0);
  await expect(card(report, "Margen Prom.")).toHaveCount(0);
  await expect(report.locator(".dashboard-inline-title").filter({ hasText: /^Top Productos/ })).toHaveCount(0);
  await expect(report.locator(".dashboard-best-employee-name")).toHaveText("Vendedor A");
  await expect(report.getByText("Vendedor B", { exact: true })).toHaveCount(0);
  const arc = report.locator(".donut-overview-chart svg path").first();
  const box = await arc.boundingBox();
  await arc.hover({ position: { x: 8, y: box.height / 2 }, timeout: 5000 });
  await expect(page.getByText("Bruto", { exact: true })).toBeVisible();
  await expect(page.getByText("Utilidad", { exact: true })).toHaveCount(0);
  expect(forbidden).toEqual([]);
});

test("columnas financieras originales sólo aparecen para el conjunto cubierto y no se reutilizan en el dashboard global", async ({
  page,
  environment,
}) => {
  const report = await enter(
    page,
    environment,
    [grant("sales.read"), grant("sellers.read"), grant("sales.financial", "assigned")],
    "desglose",
  );
  await page.goto(
    `${environment.origin}/ventas?view=desglose&dFrom=2026-01-01&dTo=2026-01-31&employeeId=A&employeeName=Vendedor+A`,
  );
  await expect(report.getByRole("columnheader", { name: "Utilidad", exact: true })).toBeVisible();
  await expect(report.getByRole("cell", { name: "$39,00", exact: true }).first()).toBeVisible();
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
  await expect(card(report, "Venta Bruta")).toContainText("$300,00");
  await expect(card(report, "Ganancia Neta")).toHaveCount(0);
  await expect(report.locator(".dashboard-inline-title").filter({ hasText: /^Top Productos/ })).toHaveCount(0);
  await expect(report.locator(".dashboard-best-employee-name")).toHaveText("Vendedor B");
  await expect(report.getByText("$39,00", { exact: true })).toHaveCount(0);
});

test("ventas negativas y períodos vacíos conservan el dashboard original sin inventar participaciones", async ({
  page,
  environment,
}) => {
  const report = await enter(page, environment, [grant("sales.read", "assigned")]);
  await environment
    .db("masterfact")
    .insert({ IdFactura: "NEG-UI", IdVend: "A", IdCliente: "C", Fecha: "2027-01-01", Anulada: false });
  await environment.db("slavefact").insert({
    IdFactura: "NEG-UI",
    IdProducto: "P",
    Descripcion: "Línea negativa de prueba",
    Precio: -10,
    Costo: 1,
    Cantidad: 1,
  });
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2027-01-01&to=2027-01-31`);
  await expect(card(report, "Venta Bruta")).toContainText("$-10,00");
  await expect(report.locator(".donut-overview-chart svg")).toHaveCount(0);
  await page.goto(`${environment.origin}/ventas?view=dashboard&from=2000-01-01&to=2000-01-02`);
  await expect(card(report, "Venta Bruta")).toContainText("$0,00");
  await expect(report.locator(".donut-overview-chart svg")).toHaveCount(0);
});
