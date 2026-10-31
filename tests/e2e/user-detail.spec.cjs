const { test, expect, login } = require("./fixtures.cjs");
const { backend } = require("../support/auth-environment.cjs");
const { randomUUID } = require("node:crypto");

async function administrator(page, environment) {
  const owner = await environment.seedUser({
    permissions: Object.keys(backend("./auth/capabilities").CAPABILITIES).map((capability) => ({ capability })),
    enrolled: true,
  });
  await login(page, environment, owner);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(owner.secret));
  const verified = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/mfa") && response.status() === 200,
  );
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await verified;
  await expect(page.getByRole("button", { name: "Menú de cuenta", exact: true, includeHidden: true })).toBeAttached();
}

for (const width of [390, 1440, 1920])
  test(`administrar usuario es una página navegable y responsive a ${width}px`, async ({ page, environment }) => {
    await page.setViewportSize({ width, height: 1000 });
    const target = await environment.seedUser({ permissions: [{ capability: "inventory.stock.read" }] });
    await environment.db("dmmarket_auth_users").where("id", target.id).update({ display_name: "Ana Pérez" });
    await administrator(page, environment);
    await page.goto(`${environment.origin}/acceso#usuarios`);
    await page.getByRole("searchbox", { name: "Buscar usuarios", exact: true }).fill(target.username);
    const link = page.getByRole("link", { name: `Administrar ${target.username}`, exact: true });
    await expect(link).toHaveAttribute("href", `/acceso/usuarios/${target.id}`);
    await link.click();
    const screen = page.getByRole("region", { name: `Administrar ${target.username}`, exact: true });
    await expect(screen).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(screen.getByRole("heading", { name: "Ana Pérez", exact: true })).toBeFocused();
    await expect(screen.getByRole("region", { name: "Roles del usuario", exact: true })).toBeVisible();
    await expect(screen.getByRole("region", { name: "Identidad comercial de la cuenta", exact: true })).toBeVisible();
    await expect(screen.getByRole("region", { name: "Permisos adicionales", exact: true })).toBeVisible();
    const frame = await screen.boundingBox();
    const workspace = await page.locator(".access-workspace").boundingBox();
    expect(Math.abs(frame.width - workspace.width)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("user-detail.png") });
    await screen
      .getByRole("region", { name: "Permisos adicionales", exact: true })
      .screenshot({ path: test.info().outputPath("user-permissions.png") });
    await page.goBack();
    await expect(page.getByRole("searchbox", { name: "Buscar usuarios", exact: true })).toHaveValue(target.username);
    await expect(page.getByRole("link", { name: `Administrar ${target.username}`, exact: true })).toBeFocused();
    await page.goForward();
    await expect(screen).toBeVisible();
    await page.reload();
    await expect(screen).toBeVisible();
    await screen.getByRole("button", { name: "Volver a usuarios", exact: true }).click();
    await expect(page).toHaveURL(/\/acceso#usuarios$/);
  });

test("la navegación protege cambios sin guardar y conserva el borrador al cancelar", async ({ page, environment }) => {
  const target = await environment.seedUser({ permissions: [] });
  await administrator(page, environment);
  await page.goto(`${environment.origin}/acceso/usuarios/${target.id}`);
  const screen = page.getByRole("region", { name: `Administrar ${target.username}`, exact: true });
  const roles = screen.getByRole("region", { name: "Roles del usuario", exact: true });
  const checkbox = roles.getByRole("checkbox").first();
  const checked = await checkbox.isChecked();
  await checkbox.setChecked(!checked);
  await screen.getByRole("button", { name: "Volver a usuarios", exact: true }).click();
  const discard = page.getByRole("dialog", { name: "¿Descartar los cambios?", exact: true });
  await discard.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(checkbox).toBeChecked({ checked: !checked });
  await screen.getByRole("button", { name: "Volver a usuarios", exact: true }).click();
  await discard.getByRole("button", { name: "Descartar cambios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
});

test("el detalle muestra errores recuperables y una cuenta inexistente sin un drawer vacío", async ({
  page,
  environment,
}) => {
  const target = await environment.seedUser({ permissions: [] });
  await administrator(page, environment);
  await page.route(`**/api/auth/users/${target.id}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Temporal" } }),
    }),
  );
  await page.goto(`${environment.origin}/acceso/usuarios/${target.id}`);
  await expect(page.getByRole("alert")).toContainText("No se pudo cargar");
  await page.unroute(`**/api/auth/users/${target.id}`);
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("region", { name: `Administrar ${target.username}`, exact: true })).toBeVisible();
  await page.goto(`${environment.origin}/acceso/usuarios/${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "Usuario no disponible", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Volver a usuarios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
});

test("recuperar acceso conserva la pantalla y los filtros del directorio al volver", async ({ page, environment }) => {
  const target = await environment.seedUser({ permissions: [] });
  await administrator(page, environment);
  await page.goto(`${environment.origin}/acceso#usuarios`);
  const search = target.username.slice(0, 8);
  await page.getByRole("searchbox", { name: "Buscar usuarios", exact: true }).fill(search);
  await page.getByRole("link", { name: `Administrar ${target.username}`, exact: true }).click();
  await page.getByRole("button", { name: "Recuperar acceso", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Recuperar acceso", exact: true });
  await dialog.getByLabel("Motivo de la operación", { exact: true }).fill("Recuperación conservando el contexto");
  await dialog.getByRole("button", { name: "Confirmar operación", exact: true }).click();
  const credential = page.getByRole("dialog", { name: "Credencial temporal", exact: true });
  await credential.getByRole("button", { name: "Cerrar credencial temporal", exact: true }).click();
  await expect(page).toHaveURL(`${environment.origin}/acceso/usuarios/${target.id}`);
  await page.getByRole("button", { name: "Volver a usuarios", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Buscar usuarios", exact: true })).toHaveValue(search);
});
