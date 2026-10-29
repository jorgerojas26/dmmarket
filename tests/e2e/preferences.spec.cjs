const { test, expect, login } = require("./fixtures.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const grants = (...names) => names.map((capability) => ({ capability, scope: "global" }));

async function loginEditor(page, environment) {
  const user = await environment.seedUser({
    permissions: grants("preferences.read", "preferences.update"),
    enrolled: true,
  });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await page.goto(`${environment.origin}/configuracion#preferencias`);
  await expect(page.getByRole("heading", { name: "Preferencias del sistema" })).toBeVisible();
  return user;
}

test("preferencias autoriza lectura y edición sin mostrar el switch del navbar", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser({ permissions: grants("preferences.read") }));
  await page.goto(`${environment.origin}/configuracion#preferencias`);
  await expect(page.getByRole("heading", { name: "Preferencias del sistema" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Facturas", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Notas de entrega", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toHaveCount(0);
  await expect(page.getByText("Solo lectura", { exact: true })).toBeVisible();
  await expect(page.locator(".app-navbar-switch")).toHaveCount(0);
  await expect(page.locator(".clients-sidebar").getByRole("button", { name: /Respaldos|Tasas BCV/ })).toHaveCount(0);
});

test("guardar actualiza todas las sesiones y persiste al recargar sin mezclar reportes", async ({
  page,
  browser,
  environment,
}) => {
  await seedSales(environment.db);
  const context = await browser.newContext();
  const viewer = await context.newPage();
  try {
    const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
    await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
    await login(viewer, environment, user);
    await viewer.goto(`${environment.origin}/ventas?view=dashboard&from=2026-01-01&to=2026-01-31`);
    const total = viewer.locator(".dashboard-kpi-card").filter({ hasText: "Venta Bruta" });
    await expect(total).toContainText("$100,00");
    await expect(viewer.getByRole("link", { name: "Configuración", exact: true })).toHaveCount(0);
    await loginEditor(page, environment);
    await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
    await page.getByRole("radio", { name: "Notas de entrega", exact: true }).check();
    expect((await environment.db("dmmarket_preferences").where("id", 1).first()).document_type).toBe("invoices");
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Notas de entrega", exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: "Guardar cambios", exact: true })).toBeDisabled();
    await viewer.bringToFront();
    await viewer.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(total).toContainText("$200,00", { timeout: 20000 });
    await viewer.reload();
    await expect(total).toContainText("$200,00");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Notas de entrega", exact: true })).toBeChecked();
    const denied = await viewer.evaluate(async () => (await fetch("/api/preferences")).status);
    expect(denied).toBe(403);
  } finally {
    await context.close();
  }
});

for (const width of [390, 1280]) {
  test(`preferencias tiene presentación adaptable a ${width}px`, async ({ page, environment }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginEditor(page, environment);
    await expect(page.getByRole("radio", { name: "Facturas", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Notas de entrega", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const width of [390, 1440]) {
  test(`el error de preferencias es accesible y recuperable a ${width}px`, async ({ page, environment }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedSales(environment.db);
    const user = await environment.seedUser({ permissions: [{ capability: "sales.read", scope: "assigned" }] });
    await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
    let recovering = false;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/api/preferences/effective", async (route) => {
      if (!recovering) {
        await route.fulfill({ status: 503, json: { error: { message: "No disponible." } } });
        return;
      }
      await gate;
      await route.continue().catch(() => {});
    });
    try {
      await login(page, environment, user);
      const heading = page.getByRole("heading", { name: "Configuración no disponible", exact: true });
      await expect(heading).toBeVisible();
      await expect(heading).toBeFocused();
      await expect(page.getByText("Reportes en pausa", { exact: true })).toBeVisible();
      await expect(page.locator(".dashboard-kpi-card")).toHaveCount(0);
      const card = await page.locator(".preferences-recovery-card").boundingBox();
      expect(card.width).toBeLessThanOrEqual(480);
      expect(Math.abs(card.x + card.width / 2 - width / 2)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      recovering = true;
      await page.getByRole("button", { name: "Reintentar", exact: true }).click();
      await expect(page.getByRole("button", { name: "Reintentando…", exact: true })).toBeDisabled();
      await expect(page.getByRole("region", { name: "Configuración no disponible", exact: true })).toHaveAttribute(
        "aria-busy",
        "true",
      );
      release();
      await expect(heading).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Dashboard de Ventas", exact: true })).toBeVisible();
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("el error permite reintentar sin éxito y cerrar la sesión", async ({ page, environment }) => {
  await page.route("**/api/preferences/effective", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "No disponible." } } }),
  );
  await login(page, environment, await environment.seedUser({ permissions: grants("sales.read") }));
  await expect(page.getByRole("heading", { name: "Configuración no disponible", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
});

test("el fallo de preferencias no bloquea configuración, cuenta, inventario ni cobranza", async ({
  page,
  environment,
}) => {
  await seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
  await require("../support/receivables-fixtures.cjs").seedReceivables(environment.db);
  const user = await environment.seedUser({
    permissions: [
      ...grants("preferences.read", "rates.read", "backups.read", "inventory.read", "receivables.read", "clients.read"),
      { capability: "sales.read", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const reports = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api\/(sales\/|dashboard\/sales|clients\/dashboard)/.test(pathname)) reports.push(pathname);
  });
  await page.route("**/api/preferences/effective", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "No disponible." } } }),
  );
  await login(page, environment, user);
  await expect(page.getByRole("heading", { name: "Configuración no disponible", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inventario", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preferencias del sistema", exact: true })).toBeVisible();
  await page
    .locator(".clients-sidebar")
    .getByRole("button", { name: /Tasas BCV/ })
    .click();
  await expect(page.getByRole("heading", { name: "Tasas BCV", exact: true })).toBeVisible();
  await page
    .locator(".clients-sidebar")
    .getByRole("button", { name: /Respaldos/ })
    .click();
  await expect(page.getByRole("heading", { name: "Respaldos", exact: true })).toBeVisible();
  await page.goto(`${environment.origin}/cuenta`);
  await expect(page.getByRole("button", { name: "Cambiar mi contraseña", exact: true })).toBeVisible();
  await page.goto(`${environment.origin}/inventario`);
  await expect(page.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await page.goto(`${environment.origin}/clientes?view=dashboard`);
  await expect(page.getByRole("heading", { name: "Configuración no disponible", exact: true })).toBeVisible();
  await page
    .locator(".clients-sidebar")
    .getByRole("button", { name: /Cuentas por cobrar/ })
    .click();
  await expect(page.getByRole("heading", { name: "Cuentas por cobrar", exact: true })).toBeVisible();
  await expect(page.locator(".preferences-recovery-card")).toHaveCount(0);
  expect(reports).toEqual([]);
});

test("la carga de preferencias tampoco bloquea los módulos independientes", async ({ page, environment }) => {
  await seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/preferences/effective", async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { error: { message: "No disponible." } } }).catch(() => {});
  });
  try {
    await login(page, environment, await environment.seedUser({ permissions: grants("inventory.read") }));
    await expect(page.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Configuración no disponible", exact: true })).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
