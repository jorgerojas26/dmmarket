const { test, expect, login } = require("./fixtures.cjs");
const grant = (capability, scope = "global") => ({ capability, scope });

test("solo Despacho muestra únicamente su vista sin precios, totales ni utilidad", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({
    permissions: [grant("sales.dispatch.read"), grant("sales.dispatch.export")],
  });
  await login(page, environment, user);
  await expect(page.getByRole("heading", { name: "Despacho", exact: true })).toBeVisible();
  await expect(page.locator(".clients-sidebar").getByRole("button", { name: "Dashboard", exact: true })).toHaveCount(0);
  await expect(page.locator(".clients-sidebar").getByRole("button", { name: "Desglose", exact: true })).toHaveCount(0);
  await page.goto(`${environment.origin}/ventas?view=despacho&from=2026-01-01&to=2026-01-31`);
  await expect(page.getByRole("cell", { name: "1", exact: true }).first()).toBeVisible();
  for (const name of ["Total", "Precio", "Utilidad", "Monto"])
    await expect(page.getByRole("columnheader", { name, exact: true })).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "1", exact: true }) })
    .first()
    .click();
  for (const name of ["Total", "Precio", "Utilidad", "Monto"])
    await expect(page.getByRole("columnheader", { name, exact: true })).toHaveCount(0);
  const productsTab = page.getByRole("button", { name: "Productos", exact: true });
  if (await productsTab.isVisible()) await productsTab.click();
  for (const name of ["Total", "Precio", "Utilidad", "Monto"])
    await expect(page.getByRole("columnheader", { name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  const printDialog = page.getByRole("dialog");
  for (const name of ["Total", "Precio", "Utilidad", "Monto"])
    await expect(printDialog.getByRole("checkbox", { name, exact: true })).toHaveCount(0);
  await printDialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.goto(`${environment.origin}/ventas?view=dashboard`);
  await expect(page.getByRole("heading", { name: "Acceso restringido", exact: true })).toBeVisible();
  await page.goto(`${environment.origin}/ventas?view=desglose`);
  await expect(page.getByRole("heading", { name: "Acceso restringido", exact: true })).toBeVisible();
});

test("el editor organiza permisos por módulo, submódulo e información/acciones", async ({ page, environment }) => {
  const user = await environment.seedUser({ permissions: [grant("access.roles.read"), grant("access.roles.create")] });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/acceso#roles`);
  await page.getByRole("button", { name: "Crear rol", exact: true }).click();
  const sales = page.getByRole("region", { name: "Permisos de Ventas", exact: true });
  await expect(sales.getByRole("rowheader", { name: "Despacho", exact: true })).toBeVisible();
  await expect(page.getByLabel("Consultar · Ventas / Despacho", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ver importes comerciales · Ventas / Despacho", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Imprimir y exportar · Ventas / Despacho", { exact: true })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Módulos de permisos", exact: true })
    .getByRole("button", { name: "Configuración", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "Permisos de Configuración", exact: true })).toBeVisible();
});

for (const [resource, heading, path] of [
  ["sales.dashboard", "Dashboard de Ventas", "/ventas?view=dashboard&from=2026-01-01&to=2026-01-31"],
  ["sales.breakdown", "Desglose de Ventas", "/ventas?view=desglose&dFrom=2026-01-01&dTo=2026-01-31"],
  ["purchases.dashboard", "Dashboard de Compras", "/compras?view=dashboard&from=2026-08-01&to=2026-08-31"],
  ["purchases.breakdown", "Desglose de Compras", "/compras?view=desglose&dFrom=2026-08-01&dTo=2026-08-31"],
  ["clients.directory", "Desglose de Clientes", "/clientes?view=clients&dFrom=2026-01-01&dTo=2026-01-31"],
  ["clients.dashboard", "Dashboard de Clientes", "/clientes?view=dashboard&from=2026-01-01&to=2026-01-31"],
  ["sellers.directory", "Desglose de Vendedores", "/vendedores?view=sellers&dFrom=2026-01-01&dTo=2026-01-31"],
  ["sellers.dashboard", "Dashboard de Vendedores", "/vendedores?view=dashboard&from=2026-01-01&to=2026-01-31"],
]) {
  test(`${resource} abre su consulta comercial completa sin rentabilidad`, async ({ page, environment }) => {
    await require("../support/sales-fixtures.cjs").seedSales(environment.db);
    await require("../support/party-fixtures.cjs").seedParties(environment.db);
    await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
    await require("../support/inventory-fixtures.cjs").seedInventory(environment.db);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page, environment, await environment.seedUser({ permissions: [grant(`${resource}.read`)] }));
    await page.goto(`${environment.origin}${path}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    for (const label of ["UTILIDAD", "Utilidad", "Margen", "Costo"])
      await expect(page.getByRole("columnheader", { name: label, exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("consultar roles no ofrece acciones de crear o modificar", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser({ permissions: [grant("access.roles.read")] }));
  await page.goto(`${environment.origin}/acceso#roles`);
  await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear rol", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Editar / })).toHaveCount(0);
});

test("documentos del vendedor se abren sin consultar su resumen ni Ventas", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/party-fixtures.cjs").seedParties(environment.db);
  const user = await environment.seedUser({
    permissions: [grant("sellers.directory.read"), grant("sellers.documents.read")],
  });
  const summaries = [];
  page.on("request", (request) => {
    if (/\/api\/sellers\/[^/]+\/summary/.test(request.url())) summaries.push(request.url());
  });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/vendedores?view=sellers&dFrom=2026-01-01&dTo=2026-01-31`);
  await page.getByRole("cell", { name: "Vendedor A", exact: true }).click();
  const modal = page.getByRole("dialog").first();
  await expect(modal.getByRole("button", { name: "Ayuda sobre Historial de Ventas", exact: true })).toBeVisible();
  await expect(modal.getByText("Top Clientes", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ventas", exact: true })).toHaveCount(0);
  expect(summaries).toEqual([]);
});

test("la caché ya no ofrece una pantalla propia dentro de Configuración", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser({ permissions: [grant("settings.cache.read")] }));
  await expect(page.getByRole("link", { name: "Configuración", exact: true })).toHaveCount(0);
  await page.goto(`${environment.origin}/configuracion#cache`);
  await expect(page.getByRole("heading", { name: "Acceso restringido", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Caché de reportes", exact: true })).toHaveCount(0);
});

test("consultar un rol permite inspeccionar sus permisos sin ofrecer guardado", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser({ permissions: [grant("access.roles.read")] }));
  await page.goto(`${environment.origin}/acceso#roles`);
  await page
    .getByRole("button", { name: /^Ver permisos de / })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Permisos del rol", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar rol", exact: true })).toHaveCount(0);
});

test("los filtros compartidos usan el permiso de su propia vista al cambiar de submódulo", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  const user = await environment.seedUser({
    permissions: [grant("sales.dispatch.read"), grant("sales.breakdown.read")],
  });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/ventas?view=desglose`);
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/clients");
  await page.getByRole("button", { name: "+ Filtro", exact: true }).click();
  await page.getByRole("button", { name: "Cliente", exact: true }).click();
  await page.getByRole("combobox").fill("Cliente");
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().headers()["x-access-resource"]).toBe("sales.breakdown");
});

test("el detalle del proveedor abre solo sus pestañas autorizadas sin errores JavaScript", async ({
  page,
  environment,
}) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../support/provider-fixtures.cjs").seedProviders(environment.db);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = await environment.seedUser({
    permissions: [grant("providers.directory.read"), grant("providers.sales.read"), grant("providers.products.read")],
  });
  await login(page, environment, user);
  await page.goto(`${environment.origin}/proveedores?from=2026-11-01&to=2026-11-30`);
  await page.getByRole("cell", { name: "Proveedor compras A", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("button", { name: "Ventas", exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Productos", exact: true })).toBeVisible();
  for (const name of ["Compras", "Vendedores", "Clientes"])
    await expect(modal.getByRole("button", { name, exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("la exportación monetaria de cartera genera el PDF desde el reporte autorizado", async ({ page, environment }) => {
  await require("../support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../support/receivables-fixtures.cjs").seedReceivables(environment.db);
  await login(
    page,
    environment,
    await environment.seedUser({
      permissions: [
        grant("clients.receivables.read"),
        grant("clients.receivables.amounts"),
        grant("clients.receivables.export"),
      ],
    }),
  );
  await page.goto(`${environment.origin}/clientes?view=receivables`);
  await expect(page.getByRole("button", { name: "Cliente sintético", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const opening = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Imprimir", exact: true }).click();
  const popup = await opening;
  await expect.poll(() => popup.url()).toMatch(/^blob:/);
  const magic = await page.evaluate(
    async (url) => new TextDecoder().decode((await (await fetch(url)).arrayBuffer()).slice(0, 4)),
    popup.url(),
  );
  expect(magic).toBe("%PDF");
  await popup.close();
});
