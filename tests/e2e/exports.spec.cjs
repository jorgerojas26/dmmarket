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

test("cambiar de consulta no conserva columnas financieras propias mientras la consulta global está bloqueada", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({
    permissions: [
      grant("sales.read"),
      grant("sales.export"),
      grant("sales.costs", "assigned"),
      grant("sales.profit", "assigned"),
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const sales = page.getByRole("region", { name: "Consulta de ventas", exact: true });
  await sales.getByLabel("Ventas desde", { exact: true }).fill("2026-01-01");
  await sales.getByLabel("Ventas hasta", { exact: true }).fill("2026-01-31");
  await sales.getByLabel("Filtrar vendedor", { exact: true }).fill("A");
  await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
  await expect(
    sales
      .getByRole("table", { name: "Desglose autorizado de ventas", exact: true })
      .getByRole("columnheader", { name: "Utilidad", exact: true }),
  ).toBeVisible();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES masterfact WRITE").connection(connection);
    locked = true;
    await sales.getByLabel("Filtrar vendedor", { exact: true }).fill("");
    await sales.getByRole("button", { name: "Consultar ventas", exact: true }).click();
    await expect(sales.getByText("Consultando ventas…", { exact: true })).toBeVisible();
    await expect(sales.getByRole("columnheader", { name: "Utilidad", exact: true })).toHaveCount(0);
    await expect(sales.getByRole("button", { name: "Exportar PDF autorizado", exact: true })).toHaveCount(0);
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(sales.getByRole("cell", { name: "Vendedor B", exact: true }).first()).toBeVisible();
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
