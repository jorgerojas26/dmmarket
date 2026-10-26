const { test, expect, login, openModule, setCalendarMonth } = require("./fixtures.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedPurchases } = require("../support/purchase-fixtures.cjs");
const { seedProviders } = require("../support/provider-fixtures.cjs");
const grant = (capability, scope = "global") => ({ capability, scope });
test.beforeEach(async ({ environment }) => {
  await seedSales(environment.db);
  await seedPurchases(environment.db);
  await seedProviders(environment.db);
});
async function enter(page, environment, permissions) {
  const user = await environment.seedUser({ permissions });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await openModule(page, "Proveedores");
  await page.getByRole("cell", { name: "Proveedor compras A", exact: true }).click();
  const modal = page.getByRole("dialog");
  await setCalendarMonth(page, modal, 2026, 11);
  return modal;
}
async function pdf(page, scope, url) {
  await scope.getByRole("button", { name: "Imprimir", exact: true }).click();
  const prepared = page.waitForResponse((response) => response.url().includes(url));
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
  return report;
}

test("PDF original de ventas del proveedor prepara documentos completos acotados y conserva ficha y período", async ({
  page,
  environment,
}) => {
  const profile = await enter(page, environment, [
    grant("providers.read"),
    grant("sales.read", "assigned"),
    grant("sales.export", "assigned"),
  ]);
  await profile.getByRole("cell", { name: "Cliente sintético", exact: true }).waitFor();
  const report = await pdf(page, profile, "/exports/providers/PUR-A/sales-documents?");
  expect(report.total).toBe(1);
  expect(report.data[0].detail.total).toBe(100);
  expect(report.data[0].detail.productos).toHaveLength(1);
  expect(report.data[0].detail).not.toHaveProperty("utilidad");
  await expect(page.getByRole("dialog").getByText("01 nov 2026 - 30 nov 2026", { exact: true })).toBeVisible();
});

test("PDF original de compras conserva detalle, oculta precios sin costos y usa exportación independiente", async ({
  page,
  environment,
}) => {
  const profile = await enter(page, environment, [
    grant("providers.read"),
    grant("purchases.read"),
    grant("purchases.export"),
  ]);
  await profile.getByRole("cell", { name: "provider-purchase-A", exact: true }).waitFor();
  await expect(profile.getByRole("columnheader", { name: "Total", exact: true })).toHaveCount(0);
  const report = await pdf(page, profile, "/exports/providers/PUR-A/purchase-documents?");
  expect(report.total).toBe(1);
  expect(report.data[0].detail).not.toHaveProperty("total");
  expect(report.data[0].detail.productos[0]).not.toHaveProperty("precio");
});

test("desglose original de producto conserva vendedor, cliente y documentos al imprimir sin ampliar población", async ({
  page,
  environment,
}) => {
  const profile = await enter(page, environment, [
    grant("providers.read"),
    grant("sales.read", "assigned"),
    grant("sales.export", "assigned"),
    grant("sales.financial", "assigned"),
    grant("sellers.read", "assigned"),
    grant("sellers.export", "assigned"),
    grant("clients.read"),
    grant("clients.export"),
  ]);
  await profile.getByRole("button", { name: "Productos", exact: true }).click();
  await profile.getByRole("cell", { name: "Producto del proveedor A", exact: true }).click();
  const product = page
    .getByRole("dialog")
    .filter({ has: page.locator(".modal-title").filter({ hasText: /^Producto del proveedor A$/ }) });
  await product.getByRole("cell", { name: "Vendedor A", exact: true }).click();
  await product.getByRole("cell", { name: "Cliente sintético", exact: true }).click();
  await product.getByRole("cell", { name: "provider-sale-A", exact: true }).waitFor();
  await expect(product.getByRole("cell", { name: "provider-sale-B", exact: true })).toHaveCount(0);
  const report = await pdf(
    page,
    product
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Documentos de Cliente sintético", exact: true }) }),
    "/exports/providers/PUR-A/sales?",
  );
  expect(report.total).toBe(1);
  expect(report.data[0].invoiceId).toBe("provider-sale-A");
  expect(Number(report.data[0].monto)).toBe(100);
  await expect(product.getByRole("cell", { name: "provider-sale-A", exact: true })).toBeVisible();
});
