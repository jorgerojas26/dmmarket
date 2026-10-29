const { execFileSync } = require("node:child_process");
const { test, expect, login, openModule } = require("./fixtures.cjs");
const grants = (...capabilities) => capabilities.map((capability) => ({ capability, scope: "global" }));

test("Preferencias conserva tipo de documento y moneda con los permisos de esta rama", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({ permissions: grants("preferences.read", "preferences.update") });
  await login(page, environment, user);
  await expect(page.getByRole("heading", { name: "Preferencias del sistema", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Facturas", exact: true })).toBeVisible();
  await page.getByText("Bolívares", { exact: true }).click();
  await page.getByRole("button", { name: "Guardar moneda", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moneda guardada" })).toBeVisible();
  expect((await environment.db("dmmarket_settings").where("name", "reportCurrency").first()).value).toBe("Bs");
  await page.getByText("Notas de entrega", { exact: true }).click();
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferencias guardadas" })).toBeVisible();
  expect((await environment.db("dmmarket_preferences").where("id", 1).first()).document_type).toBe("delivery-notes");
});

test("inventario en Bs imprime USD por conversión explícita con dos decimales y sin modificar importes", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
  await environment.db("dmmarket_settings").where("name", "reportCurrency").update({ value: "Bs" });
  const user = await environment.seedUser({
    permissions: grants("inventory.read", "inventory.costs", "inventory.export", "rates.read"),
  });
  await login(page, environment, user);
  const inventory = page.getByRole("region", { name: "Inventario", exact: true });
  await inventory.getByRole("searchbox", { name: "Buscar producto...", exact: true }).fill("Inventario sintético A");
  await expect(inventory.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await expect(inventory).toContainText("Bs 123,45");
  await inventory.getByRole("button", { name: "Imprimir", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Bs", exact: true })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "$ USD", exact: true })).toBeEnabled();
  await dialog.locator('label[for="print-currency-usd"]').click();
  const opening = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Imprimir", exact: true }).click();
  const popup = await opening;
  await popup.waitForURL(/^blob:/);
  const bytes = await page.evaluate(
    async (url) => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
    popup.url(),
  );
  const text = execFileSync("pdftotext", ["-", "-"], { input: Buffer.from(bytes), encoding: "utf8" });
  expect(text).toContain("USD");
  expect(text).toMatch(/2[.,]93/);
  expect(text).not.toMatch(/2[.,]930/);
  expect(Number((await environment.db("productos").where("IdProducto", "I-A").first()).PrecioA)).toBe(123.45);
  await popup.close();
});

test("moneda no se solicita antes del login y su error no bloquea Configuración", async ({ page, environment }) => {
  const requests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/settings") requests.push(request.url());
  });
  await page.goto(environment.origin);
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.route("**/api/settings", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "No disponible." } } }),
  );
  const user = await environment.seedUser({ permissions: grants("inventory.read", "preferences.read") });
  await login(page, environment, user);
  await expect(page.getByRole("heading", { name: "Moneda no disponible", exact: true })).toBeVisible();
  await openModule(page, "Configuración");
  await expect(page.getByRole("heading", { name: "Preferencias del sistema", exact: true })).toBeVisible();
});
