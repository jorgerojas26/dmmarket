const { test, expect, login } = require("./fixtures.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedParties } = require("../support/party-fixtures.cjs");
const grant = (capability, scope = "global") => ({ capability, scope });

test.beforeEach(async ({ environment }) => {
  await seedSales(environment.db);
  await seedParties(environment.db);
});

test("catálogo original sin ventas conserva perfil autorizado sin consultar analíticas prohibidas", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({
    permissions: [grant("sellers.read", "assigned"), grant("sellers.personal", "assigned")],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const analytics = [];
  page.on("request", (request) => {
    if (/\/api\/sellers\/(dashboard|[^/]+\/(summary|sales))/.test(request.url())) analytics.push(request.url());
  });
  await login(page, environment, user);
  await expect(page.getByRole("heading", { name: "Desglose de Vendedores", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Ventas", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Vendedor B", exact: true })).toHaveCount(0);
  await page.getByRole("cell", { name: "Vendedor A", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText(/PRIVATE-PHONE-A/)).toBeVisible();
  await expect(modal.getByText("Historial de Ventas", { exact: true })).toHaveCount(0);
  expect(analytics).toEqual([]);
});

test("PDF original del directorio requiere exportación de vendedores, no concede PDF de facturas", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({
    permissions: [grant("sellers.read", "assigned"), grant("sellers.export", "assigned"), grant("sales.read")],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/vendedores?view=sellers&dFrom=2026-01-01&dTo=2026-01-31`);
  await page.getByRole("cell", { name: "Vendedor A", exact: true }).waitFor();
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  const prepared = page.waitForResponse((response) => response.url().includes("/api/exports/sellers"));
  const opening = page.waitForEvent("popup");
  await page.getByRole("dialog").getByRole("button", { name: "Imprimir", exact: true }).click();
  const response = await prepared;
  expect(response.status()).toBe(200);
  const report = await response.json();
  expect(report.data.map((row) => row.sellerId)).toEqual(["A"]);
  expect(Number(report.data[0].sales)).toBe(100);
  const popup = await opening;
  await popup.waitForURL(/^blob:/);
  expect(
    await page.evaluate(
      async (url) => new TextDecoder().decode((await (await fetch(url)).arrayBuffer()).slice(0, 4)),
      popup.url(),
    ),
  ).toBe("%PDF");
  await popup.close();
  await page.bringToFront();
  await page.getByRole("cell", { name: "Vendedor A", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
});

test("PDF original del perfil conserva vendedor y filtros tras revalidar la sesión al volver", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({
    permissions: [
      grant("sellers.read", "assigned"),
      grant("sales.read", "assigned"),
      grant("sales.export", "assigned"),
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/vendedores?view=sellers&dFrom=2026-01-01&dTo=2026-01-31`);
  await page.getByRole("cell", { name: "Vendedor A", exact: true }).click();
  const profile = page.getByRole("dialog");
  await profile.getByPlaceholder("Buscar por documento o cliente...").fill("sintético");
  await profile.getByRole("button", { name: "Imprimir", exact: true }).click();
  const prepared = page.waitForResponse((response) => response.url().includes("/api/exports/sales?"));
  const opening = page.waitForEvent("popup");
  await page
    .getByRole("dialog")
    .filter({ has: page.getByRole("button", { name: "Imprimir", exact: true }) })
    .last()
    .getByRole("button", { name: "Imprimir", exact: true })
    .click();
  const response = await prepared;
  expect(response.status()).toBe(200);
  const report = await response.json();
  expect(report.data.map((row) => row.invoiceId)).toEqual(["1"]);
  const popup = await opening;
  await popup.waitForURL(/^blob:/);
  expect(
    await page.evaluate(
      async (url) => new TextDecoder().decode((await (await fetch(url)).arrayBuffer()).slice(0, 4)),
      popup.url(),
    ),
  ).toBe("%PDF");
  await popup.close();
  await page.bringToFront();
  await expect(page.getByRole("dialog").getByText("Vendedor A", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByPlaceholder("Buscar por documento o cliente...")).toHaveValue("sintético");
  await expect(page.getByRole("dialog").getByText("01 ene 2026 - 31 ene 2026", { exact: true })).toBeVisible();
});
