const { test, expect, login, openModule } = require("./fixtures.cjs");
const grant = (capability, scope = "global") => ({ capability, scope });

async function fixture(environment) {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
}

test("impresión original genera PDF real con filtro de stock y sin campos monetarios no autorizados", async ({
  page,
  environment,
}) => {
  await fixture(environment);
  const user = await environment.seedUser({ permissions: [grant("inventory.read"), grant("inventory.export")] });
  await login(page, environment, user);
  await openModule(page, "Inventario");
  const inventory = page.getByRole("region", { name: "Inventario", exact: true });
  await inventory.getByRole("searchbox", { name: "Buscar producto...", exact: true }).fill("Inventario sintético");
  await expect(inventory.getByRole("cell", { name: "I-C", exact: true })).toBeVisible();
  await inventory.getByRole("button", { name: "Imprimir", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Configuración de impresión", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Precio", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Proveedor", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "Bs", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Solo productos con stock > 0", exact: true }).check();
  const prepared = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/exports/inventory");
  const opening = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Imprimir", exact: true }).click();
  const response = await prepared;
  expect(response.status()).toBe(200);
  const report = await response.json();
  expect(report.total).toBe(1);
  expect(JSON.stringify(report)).not.toMatch(/PrecioA|inventoryValue|Proveedor|PRIVATE/);
  const popup = await opening;
  await popup.waitForURL(/^blob:/);
  const magic = await page.evaluate(async (url) => {
    const data = await (await fetch(url)).arrayBuffer();
    return new TextDecoder().decode(data.slice(0, 4));
  }, popup.url());
  expect(magic).toBe("%PDF");
  await popup.close();
});

test("sólo lectura no muestra impresión original ni permite preparar exportación por URL", async ({
  page,
  environment,
}) => {
  await fixture(environment);
  const user = await environment.seedUser({ permissions: [grant("inventory.read")] });
  await login(page, environment, user);
  const inventory = page.getByRole("region", { name: "Inventario", exact: true });
  await inventory.getByRole("searchbox", { name: "Buscar producto...", exact: true }).fill("Inventario sintético");
  await expect(inventory.getByRole("cell", { name: "I-C", exact: true })).toBeVisible();
  await expect(inventory.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/api/exports/inventory")).status)).toBe(403);
});

test("cambiar filtros originales no conserva columnas financieras propias mientras la consulta global está bloqueada", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({
    permissions: [
      grant("sales.read"),
      grant("sellers.read"),
      grant("sales.export"),
      grant("sales.financial", "assigned"),
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(
    `${environment.origin}/ventas?view=desglose&dFrom=2026-01-01&dTo=2026-01-31&employeeId=A&employeeName=Vendedor+A`,
  );
  const sales = page.getByRole("region", { name: "Ventas", exact: true });
  await expect(sales.getByRole("columnheader", { name: "Utilidad", exact: true })).toBeVisible();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES masterfact WRITE").connection(connection);
    locked = true;
    await sales.getByRole("button", { name: "Quitar filtro Vendedor", exact: true }).click();
    await expect(sales.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
    await expect(sales.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(sales.getByRole("cell", { name: "Producto sintético", exact: true })).toBeVisible();
    await expect(sales.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
    const response = await page.evaluate(
      async () => await (await fetch("/api/exports/sales?from=2026-01-01&to=2026-01-31")).json(),
    );
    expect(response.columns.some((column) => column.key === "utilidad")).toBe(false);
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
  }
});

test("despacho original conserva selección al imprimir y sólo exporta documentos permitidos", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({ permissions: [grant("sales.read"), grant("sales.export", "assigned")] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=despacho&from=2026-01-01&to=2026-01-31`);
  const report = page.getByRole("region", { name: "Ventas", exact: true });
  await expect(report.getByRole("columnheader", { name: "RIF", exact: true })).toHaveCount(0);
  await expect(report.getByRole("columnheader", { name: "UTILIDAD", exact: true })).toHaveCount(0);
  await report
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "1", exact: true }) })
    .click();
  await report.getByRole("button", { name: "Productos", exact: true }).click();
  await expect(report.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
  await report.getByRole("button", { name: "Imprimir", exact: true }).click();
  const prepared = page.waitForResponse((r) => r.url().includes("/api/exports/sales/dispatch"));
  const opening = page.waitForEvent("popup");
  await page.getByRole("dialog").getByRole("button", { name: "Imprimir", exact: true }).click();
  const response = await prepared;
  expect(response.status()).toBe(200);
  expect((await response.json()).products[0]).not.toHaveProperty("utilidad");
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
  await expect(report.getByRole("cell", { name: "Línea sintética", exact: true })).toBeVisible();
  await report.getByRole("button", { name: "Facturas", exact: true }).click();
  await report
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "2", exact: true }) })
    .click();
  await report.getByRole("button", { name: "Productos", exact: true }).click();
  await expect(report.getByRole("cell", { name: "300", exact: true })).toBeVisible();
  await expect(report.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
});
