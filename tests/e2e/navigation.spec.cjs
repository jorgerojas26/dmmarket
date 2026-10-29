const { test, expect, login, openModule, logout } = require("./fixtures.cjs");

async function inventoryUser(environment, permissions) {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
  return environment.seedUser({ permissions });
}
const grant = (capability, scope = "global") => ({ capability, scope });

test("navegación muestra sólo módulos autorizados y separa sus formularios", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await inventoryUser(environment, [
    grant("sales.read", "assigned"),
    grant("purchases.read"),
    grant("clients.read"),
    grant("sellers.read", "assigned"),
    grant("inventory.read"),
    grant("rates.read"),
  ]);
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  await login(page, environment, user);
  const navigation = page.getByRole("navigation", { name: "Módulos disponibles", exact: true });
  await expect(page).toHaveURL(/\/ventas\?/);
  for (const name of ["Ventas", "Compras", "Clientes", "Vendedores", "Inventario"])
    await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Acceso", "Proveedores", "Cartera", "Comisiones"])
    await expect(navigation.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dashboard de Ventas", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Inventario", exact: true })).toHaveCount(0);
  await openModule(page, "Compras");
  await expect(page.getByRole("heading", { name: "Dashboard de Compras", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ventas", exact: true })).toHaveCount(0);
  await openModule(page, "Clientes");
  await expect(page.getByRole("heading", { name: "Dashboard de Clientes", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard de Vendedores", exact: true })).toHaveCount(0);
  await openModule(page, "Vendedores", "Dashboard");
  await expect(page).toHaveURL(/\/vendedores\?view=dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard de Vendedores", exact: true })).toBeVisible();
  await openModule(page, "Ventas", "Desglose");
  await expect(page).toHaveURL(/view=desglose/);
  await expect(page.getByRole("heading", { name: "Desglose de Ventas", exact: true })).toBeVisible();
});

test("URL directa y rutas pendientes no montan formularios ni consultas protegidas", async ({ page, environment }) => {
  const user = await inventoryUser(environment, [grant("inventory.read")]);
  await login(page, environment, user);
  await expect(page.getByRole("region", { name: "Inventario", exact: true })).toBeVisible();
  await expect(page.locator(".app-navbar-brand")).toHaveText("SISTEMA DE REPORTES");
  await expect(page.getByRole("heading", { name: "DMMarket", exact: true })).toHaveCount(0);
  const frame = await page.locator("#main").boundingBox();
  expect(frame.width).toBe(1280);
  expect(frame.height).toBe(900);
  await expect(page.locator(".App > #main > .container-fluid > .clientes-layout")).toBeVisible();
  const requested = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requested.push(path);
  });
  for (const path of [
    "/acceso",
    "/clientes",
    "/ventas/pareto",
    "/proveedores",
    "/operacion",
    "/cartera",
    "/auditoria",
    "/comisiones",
    "/configuracion",
  ]) {
    await page.goto(`${environment.origin}${path}`);
    await expect(page.getByRole("heading", { name: "Página no disponible", exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toHaveCount(0);
  }
  expect(
    requested.filter(
      (path) => !["/api/auth/session", "/api/auth/profile", "/api/preferences/effective"].includes(path),
    ),
  ).toEqual([]);
});

test("volver atrás reutiliza los datos de la misma sesión sin bloquear por otra validación", async ({
  page,
  environment,
}) => {
  const user = await inventoryUser(environment, [grant("inventory.read"), grant("rates.read")]);
  await login(page, environment, user);
  const inventory = page.getByRole("region", { name: "Inventario", exact: true });
  await expect(inventory.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await expect(page.locator(".user-menu-role")).not.toHaveText("Cargando rol…");
  await openModule(page, "Configuración", "Tasas BCV");
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.previousAccountMenu = document.querySelector(".user-menu-trigger");
  });
  let validations = 0;
  await page.route("**/api/auth/session", (route) => {
    validations++;
    return route.continue();
  });
  await page.goBack();
  await expect(inventory.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await expect(page.getByRole("main", { name: "Validando acceso", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.contains(window.previousAccountMenu))).toBe(true);
  expect(validations).toBe(0);
});

test("móvil abre y cierra navegación y cambiar de cuenta no conserva el módulo anterior", async ({
  page,
  environment,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const first = await inventoryUser(environment, [grant("inventory.read")]);
  const second = await environment.seedUser();
  await login(page, environment, first);
  await openModule(page, "Inventario");
  await expect(page.getByRole("region", { name: "Inventario", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
  await logout(page);
  await login(page, environment, second);
  await expect(page).toHaveURL(`${environment.origin}/configuracion#tasas`);
  await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Módulos disponibles", exact: true });
  await expect(navigation.getByRole("link", { name: "Inventario", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Inventario", exact: true })).toHaveCount(0);
});

test("superusuario conserva barra original en una fila y administración en menú de cuenta", async ({
  page,
  environment,
}) => {
  const { backend } = require("../support/auth-environment.cjs");
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({
    permissions: Object.keys(backend("./auth/capabilities").CAPABILITIES).map((capability) => ({
      capability,
      scope: "global",
    })),
    enrolled: true,
  });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  const navbar = page.getByRole("navigation", { name: "Módulos disponibles", exact: true });
  for (const width of [1512, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(navbar.getByRole("button", { name: "Menú de cuenta", exact: true })).toBeVisible();
    await expect(page.locator(".app-navbar-links .nav-link")).toHaveText([
      "ventas",
      "compras",
      "clientes",
      "proveedores",
      "vendedores",
      "inventario",
    ]);
    const frame = await navbar.boundingBox();
    expect(frame.height).toBeLessThanOrEqual(72);
    const boxes = await Promise.all(
      [".app-navbar-brand", ".app-navbar-links", ".app-navbar-actions"].map((selector) =>
        page.locator(selector).boundingBox(),
      ),
    );
    const centers = boxes.map((box) => box.y + box.height / 2);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(6);
    const sizing = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      navbar: document.querySelector(".app-navbar").getBoundingClientRect().width,
      actionsRight: document.querySelector(".app-navbar-actions").getBoundingClientRect().right,
    }));
    expect(sizing.actionsRight).toBeLessThanOrEqual(width);
    expect(sizing.document).toBeLessThanOrEqual(width);
  }
  await navbar.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
  for (const name of ["Configuración", "Mi cuenta", "Acceso", "Auditoría"])
    await expect(navbar.getByRole("link", { name, exact: true })).toBeVisible();
  await navbar.getByRole("link", { name: "Mi cuenta", exact: true }).click();
  await expect(page).toHaveURL(`${environment.origin}/cuenta`);
  await expect(navbar.getByRole("link", { name: "Acceso", exact: true })).not.toBeVisible();
});

test("navbar conserva los módulos y mueve Configuración al primer lugar del menú de usuario", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await login(
    page,
    environment,
    await environment.seedUser({
      permissions: [
        "sales.read",
        "purchases.read",
        "clients.read",
        "providers.read",
        "sellers.read",
        "inventory.read",
        "rates.read",
        "commissions.read",
      ].map((capability) => ({ capability, scope: "global" })),
    }),
  );
  await expect(page.getByRole("link", { name: "Ventas", exact: true })).toBeVisible();
  const links = page.locator(".app-navbar-links");
  await expect(links.locator(".nav-link")).toHaveText([
    "ventas",
    "compras",
    "clientes",
    "proveedores",
    "vendedores",
    "inventario",
  ]);
  await expect(links.getByRole("link", { name: "Configuración", exact: true })).toHaveCount(0);
  await expect(page.locator('.app-navbar-actions > a[href="/configuracion"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
  const menu = page.locator(".user-menu-dropdown");
  await expect(menu.getByRole("link").first()).toHaveText("Configuración");
  await expect(menu.getByRole("link", { name: "Configuración", exact: true }).locator("svg")).toBeVisible();
  await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
  await expect(page.getByRole("link", { name: "Comisiones", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Notas de entrega", exact: true })).toHaveCount(0);
  await expect(page.locator(".app-navbar-ref")).toContainText("42.125000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
  await expect(page.getByRole("link", { name: "Inventario", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [390, 1280]) {
  test(`Configuración es el primer item del usermenu y cierra la navegación a ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, environment, await environment.seedUser());
    await expect(page.getByRole("heading", { name: "Tasas BCV", exact: true })).toBeVisible();
    if (width < 1200) await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
    await expect(page.locator('.app-navbar-actions > a[href="/configuracion"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
    const menu = page.locator(".user-menu-dropdown");
    await expect(menu.getByRole("link")).toHaveText(["Configuración", "Mi cuenta"]);
    await menu.getByRole("link", { name: "Mi cuenta", exact: true }).click();
    await expect(page).toHaveURL(`${environment.origin}/cuenta`);
    if (width < 1200) await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
    await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
    await menu.getByRole("link", { name: "Configuración", exact: true }).click();
    await expect(page).toHaveURL(`${environment.origin}/configuracion#tasas`);
    await expect(page.locator(".user-menu-trigger")).toHaveAttribute("aria-expanded", "false");
    if (width < 1200)
      await expect(page.getByRole("button", { name: "Abrir navegación", exact: true })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("el usermenu no ofrece Configuración a una cuenta sin permisos", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser({ permissions: [] }));
  await expect(page.getByRole("button", { name: "Cambiar mi contraseña", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
  const menu = page.locator(".user-menu-dropdown");
  await expect(menu.getByRole("link").first()).toHaveText("Mi cuenta");
  await expect(page.getByRole("link", { name: "Configuración", exact: true })).toHaveCount(0);
});
