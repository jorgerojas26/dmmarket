const { randomUUID } = require("node:crypto");
const { test, expect, login, openModule } = require("./fixtures.cjs");
const ownerPermissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));

test("el alta permite decidir si exige MFA, desmarcado por defecto", async ({ page, environment }) => {
  const owner = await environment.seedUser({ permissions: ownerPermissions });
  const roleId = (await environment.db("dmmarket_auth_user_roles").where("user_id", owner.id).first()).role_id;
  await login(page, environment, owner);
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
  for (const required of [false, true]) {
    await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
    const screen = page.getByRole("region", { name: "Crear usuario", exact: true });
    const checkbox = screen.getByRole("checkbox", { name: "Exigir MFA", exact: true });
    await expect(checkbox).not.toBeChecked();
    const username = `mfa-${randomUUID().slice(0, 8)}`;
    await screen.getByLabel("Nombre", { exact: true }).fill("Ana Pérez");
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Rol", { exact: true }).selectOption(roleId);
    if (required) await checkbox.check();
    await screen.getByRole("button", { name: "Crear usuario", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Credencial temporal", exact: true })).toBeVisible();
    const user = await environment.db("dmmarket_auth_users").where({ username }).first();
    expect(Boolean(user.mfa_required)).toBe(required);
    await page.getByRole("button", { name: "Cerrar credencial temporal", exact: true }).click();
  }
});

test("operaciones sensibles de cuentas sin MFA confirman solo la contraseña", async ({ page, environment }) => {
  const owner = await environment.seedUser({ permissions: ownerPermissions });
  await login(page, environment, owner);
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", owner.id)
    .whereNull("revoked_ms")
    .update({ password_ms: Date.now() - 300001 });
  await page.locator(".clients-sidebar").getByRole("button", { name: "Roles", exact: true }).click();
  await page.getByRole("button", { name: "Crear rol", exact: true }).click();
  await page.getByLabel("Nombre del rol", { exact: true }).fill(`Rol-${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmar identidad", exact: true });
  await expect(confirmation.getByLabel("Código MFA de reautenticación", { exact: true })).toHaveCount(0);
  await confirmation.getByLabel("Contraseña de reautenticación", { exact: true }).fill(owner.password);
  await confirmation.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rol guardado" })).toBeVisible();
});

test("Mi cuenta permite activar MFA voluntario sin imponerlo por rol", async ({ page, environment }) => {
  const user = await environment.seedUser();
  await login(page, environment, user);
  await openModule(page, "Mi cuenta");
  await page.getByRole("button", { name: "Activar MFA", exact: true }).click();
  await page.getByLabel("Contraseña para configurar MFA", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Generar configuración MFA", exact: true }).click();
  const secret = await page.getByLabel("Configuración manual MFA", { exact: true }).inputValue();
  await page.getByLabel("Código de confirmación MFA", { exact: true }).fill(await environment.token(secret));
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("button", { name: "Desactivar MFA", exact: true })).toBeVisible();
});

test("el detalle de usuario permite exigir MFA y restablecer el autenticador", async ({ page, environment }) => {
  const owner = await environment.seedUser({ permissions: ownerPermissions });
  const target = await environment.seedUser({ permissions: [], enrolled: true });
  await login(page, environment, owner);
  await page.goto(`${environment.origin}/acceso/usuarios/${target.id}`);
  const screen = page.getByRole("region", { name: `Administrar ${target.username}`, exact: true });
  const mfa = screen.getByRole("region", { name: "Segundo factor (MFA)", exact: true });
  await expect(mfa.getByText("Protegido", { exact: true })).toBeVisible();
  const checkbox = mfa.getByRole("checkbox", { name: "Exigir MFA a esta cuenta", exact: true });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await mfa.getByRole("button", { name: "Guardar MFA", exact: true }).click();
  await expect(mfa.getByRole("status")).toContainText("exigirá MFA");
  expect(Boolean((await environment.db("dmmarket_auth_users").where("id", target.id).first()).mfa_required)).toBe(true);
  await expect(checkbox).toBeChecked();
  await mfa.getByRole("button", { name: "Restablecer autenticador", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Restablecer autenticador MFA", exact: true });
  await dialog.getByRole("button", { name: "Restablecer autenticador", exact: true }).click();
  await expect(mfa.getByRole("status")).toContainText("Autenticador restablecido");
  await expect(mfa.getByText("Pendiente de configurar", { exact: true })).toBeVisible();
  const stored = await environment.db("dmmarket_auth_users").where("id", target.id).first();
  expect(stored.mfa_secret).toBeNull();
  expect(Boolean(stored.mfa_required)).toBe(true);
});

test("consultar usuarios sin modificarlos muestra el estado MFA sin controles", async ({ page, environment }) => {
  const reader = await environment.seedUser({ permissions: [{ capability: "access.users.read" }] });
  const target = await environment.seedUser({ permissions: [], enrolled: true, mfaRequired: true });
  await login(page, environment, reader);
  await page.goto(`${environment.origin}/acceso/usuarios/${target.id}`);
  const mfa = page.getByRole("region", { name: "Segundo factor (MFA)", exact: true });
  await expect(mfa.getByText("Protegido", { exact: true })).toBeVisible();
  await expect(mfa.getByRole("checkbox", { name: "Exigir MFA a esta cuenta", exact: true })).toBeDisabled();
  await expect(mfa.getByRole("button")).toHaveCount(0);
  await expect(
    mfa.getByText("No tienes permiso para modificar la configuración MFA de esta cuenta.", { exact: true }),
  ).toBeVisible();
});

test("quien solo recupera cuentas restablece el autenticador sin cambiar la exigencia", async ({
  page,
  environment,
}) => {
  const recovery = await environment.seedUser({
    permissions: [{ capability: "access.recovery.read" }, { capability: "access.recovery.execute" }],
  });
  const target = await environment.seedUser({ permissions: [], enrolled: true, mfaRequired: true });
  await login(page, environment, recovery);
  await page.goto(`${environment.origin}/acceso/usuarios/${target.id}`);
  const mfa = page.getByRole("region", { name: "Segundo factor (MFA)", exact: true });
  await expect(mfa.getByRole("checkbox", { name: "Exigir MFA a esta cuenta", exact: true })).toBeDisabled();
  await expect(mfa.getByRole("button", { name: "Guardar MFA", exact: true })).toHaveCount(0);
  const reset = mfa.getByRole("button", { name: "Restablecer autenticador", exact: true });
  await expect(reset).toBeVisible();
  await reset.click();
  const dialog = page.getByRole("dialog", { name: "Restablecer autenticador MFA", exact: true });
  await dialog.getByRole("button", { name: "Restablecer autenticador", exact: true }).click();
  await expect(mfa.getByRole("status")).toContainText("Autenticador restablecido");
  expect((await environment.db("dmmarket_auth_users").where("id", target.id).first()).mfa_secret).toBeNull();
});
