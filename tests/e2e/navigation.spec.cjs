const { test, expect, login, openModule } = require("./fixtures.cjs");

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
  await expect(page).toHaveURL(`${environment.origin}/ventas`);
  for (const name of ["Ventas", "Compras", "Clientes", "Vendedores", "Inventario", "Tasas", "Mi cuenta"])
    await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["Acceso", "Proveedores", "Configuración", "Cartera", "Comisiones"])
    await expect(navigation.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Consulta de ventas", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Inventario autorizado", exact: true })).toHaveCount(0);
  await openModule(page, "Compras");
  await expect(page.getByRole("region", { name: "Consulta autorizada de compras", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Consulta de ventas", exact: true })).toHaveCount(0);
  await openModule(page, "Clientes");
  await expect(page.getByLabel("Directorio", { exact: true })).toHaveValue("clients");
  await expect(
    page.getByLabel("Directorio", { exact: true }).getByRole("option", { name: "Vendedores", exact: true }),
  ).toHaveCount(0);
  await openModule(page, "Vendedores", "Resumen");
  await expect(page).toHaveURL(`${environment.origin}/vendedores/panel`);
  await expect(page.getByRole("region", { name: "Panel de vendedores", exact: true })).toBeVisible();
  await openModule(page, "Ventas", "Pareto");
  await expect(page).toHaveURL(`${environment.origin}/ventas/pareto`);
  await expect(page.getByRole("region", { name: "Pareto autorizado", exact: true })).toBeVisible();
});

test("URL directa y rutas pendientes no montan formularios ni consultas protegidas", async ({ page, environment }) => {
  const user = await inventoryUser(environment, [grant("inventory.read")]);
  await login(page, environment, user);
  await expect(page.getByRole("region", { name: "Inventario autorizado", exact: true })).toBeVisible();
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
  expect(requested.filter((path) => !path.startsWith("/api/auth/session"))).toEqual([]);
});

test("volver atrás revalida en MySQL antes de mostrar el módulo y no recupera resultados privados", async ({
  page,
  environment,
}) => {
  const user = await inventoryUser(environment, [grant("inventory.read"), grant("rates.read")]);
  await login(page, environment, user);
  const inventory = page.getByRole("region", { name: "Inventario autorizado", exact: true });
  await inventory.getByLabel("Buscar en inventario", { exact: true }).fill("Inventario sintético");
  await inventory.getByRole("button", { name: "Consultar inventario", exact: true }).click();
  await expect(inventory.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await openModule(page, "Tasas");
  await expect(page.getByRole("cell", { name: "42.125000", exact: true })).toBeVisible();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES dmmarket_auth_users WRITE").connection(connection);
    locked = true;
    await page.goBack();
    await expect(page.getByText("Comprobando sesión…", { exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "I-A", exact: true })).toHaveCount(0);
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(inventory.getByRole("button", { name: "Consultar inventario", exact: true })).toBeVisible();
    await expect(inventory.getByRole("table")).toHaveCount(0);
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
  }
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
  await expect(page.getByRole("region", { name: "Inventario autorizado", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await login(page, environment, second);
  await expect(page).toHaveURL(`${environment.origin}/tasas`);
  await expect(page.getByRole("cell", { name: "42.125000", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Módulos disponibles", exact: true });
  await expect(navigation.getByRole("link", { name: "Inventario", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Inventario autorizado", exact: true })).toHaveCount(0);
});
