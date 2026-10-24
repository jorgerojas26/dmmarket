const { randomBytes } = require("node:crypto");
const { test, expect, login } = require("./fixtures.cjs");
const { docker } = require("../support/auth-environment.cjs");
const ownerPermissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));

async function changePassword(page, current, password) {
  await page.getByRole("textbox", { name: "Contraseña actual", exact: true }).fill(current);
  await page.getByRole("textbox", { name: "Contraseña nueva", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirmar contraseña nueva", exact: true }).fill(password);
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
}

test("login incorrecto/correcto, permisos, cookies y cambio propio sin MFA", async ({ page, context, environment }) => {
  const user = await environment.seedUser();
  await login(page, environment, { ...user, password: "incorrect" });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/api/auth/users")).status)).toBe(403);
  const cookie = (await context.cookies()).find((value) => value.name === "__Host-dmmarket.sid");
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("dmmarket.sid");
  await page.getByRole("button", { name: "Cambiar mi contraseña", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Código MFA para cambiar contraseña" })).toHaveCount(0);
  const password = randomBytes(24).toString("base64url");
  await changePassword(page, user.password, password);
  await expect(page.getByRole("heading", { name: "Cambiar mi contraseña", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await login(page, environment, { ...user, password });
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
});

test("alta, recuperación y bloqueo de usuario desde administrador con MFA real", async ({
  page,
  browser,
  environment,
}) => {
  const owner = await environment.seedUser({ permissions: ownerPermissions, temporary: true });
  await login(page, environment, owner);
  await expect(page.getByRole("heading", { name: "Cambiar contraseña temporal" })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/currency_rates")).status)).toBe(403);
  const password = randomBytes(24).toString("base64url");
  await changePassword(page, owner.password, password);
  await page.getByRole("textbox", { name: "Contraseña para configurar MFA" }).fill(password);
  await page.getByRole("button", { name: "Generar configuración MFA" }).click();
  const uri = await page.getByRole("textbox", { name: "Configuración manual MFA" }).inputValue();
  await expect(page.getByRole("img", { name: "Código QR de configuración MFA" })).toBeVisible();
  await page.getByRole("textbox", { name: "Código de confirmación MFA" }).fill("invalid");
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Código de confirmación MFA" })
    .fill(await environment.token(new URL(uri).searchParams.get("secret")));
  await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
  const username = `created-${randomBytes(4).toString("hex")}`;
  await page.getByRole("textbox", { name: "Usuario nuevo" }).fill(username);
  await page.getByRole("textbox", { name: "Nombre visible" }).fill("Usuario sintético E2E");
  await page.getByRole("textbox", { name: "Motivo del alta" }).fill("Alta de integración real");
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const credential = page.getByRole("textbox", { name: "Contraseña temporal emitida" });
  await expect(credential).toBeVisible();
  const temporaryPassword = await credential.inputValue();
  await page.getByRole("button", { name: "Cerrar credencial temporal" }).click();
  const context = await browser.newContext();
  try {
    const reader = await context.newPage();
    await login(reader, environment, { username, password: temporaryPassword });
    await expect(reader.getByRole("heading", { name: "Cambiar contraseña temporal" })).toBeVisible();
    await changePassword(reader, temporaryPassword, randomBytes(24).toString("base64url"));
    await expect(reader.getByRole("status", { name: "Usuario conectado" })).toHaveText(username);
    await page.getByRole("button", { name: `Recuperar ${username}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Motivo de la operación" }).fill("Recuperación real de prueba");
    await page.getByRole("button", { name: "Confirmar operación", exact: true }).click();
    await expect(credential).toBeVisible();
    const replacement = await credential.inputValue();
    expect(replacement).not.toBe(temporaryPassword);
    await reader.reload();
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await login(reader, environment, { username, password: temporaryPassword });
    await expect(reader.getByRole("alert")).toBeVisible();
    await login(reader, environment, { username, password: replacement });
    await expect(reader.getByRole("heading", { name: "Cambiar contraseña temporal" })).toBeVisible();
    await changePassword(reader, replacement, randomBytes(24).toString("base64url"));
    await expect(reader.getByRole("status", { name: "Usuario conectado" })).toHaveText(username);
    await page.getByRole("button", { name: `Cambiar estado de ${username}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Motivo de la operación" }).fill("Bloqueo real de prueba");
    await page.getByRole("button", { name: "Confirmar operación", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ has: page.getByRole("cell", { name: username, exact: true }) }),
    ).toContainText("Bloqueado");
    expect(await reader.evaluate(async () => (await fetch("/api/currency_rates")).status)).toBe(401);
    await expect(reader.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("logout y expiración eliminan datos en dos pestañas y al volver atrás", async ({ page, context, environment }) => {
  const user = await environment.seedUser();
  await login(page, environment, user);
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  const second = await context.newPage();
  await second.goto(environment.origin);
  await expect(second.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await second.goto(`${environment.origin}/history-check`);
  await second.goBack();
  await expect(second.getByRole("table")).toHaveCount(0);
  await login(page, environment, user);
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .whereNull("revoked_ms")
    .update({ activity_ms: Date.now() - 1800001 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(second.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("cambiar cuenta no reutiliza caché SWR mientras SQL está bloqueado", async ({ page, environment }) => {
  const first = await environment.seedUser();
  const second = await environment.seedUser();
  await login(page, environment, first);
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES divisas WRITE").connection(connection);
    locked = true;
    await environment.db.raw("UPDATE divisas SET Cambio = ?", ["84.25"]).connection(connection);
    await login(page, environment, second);
    await expect(page.getByText("Cargando tasas…", { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "42.125000" })).toHaveCount(0);
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(page.getByRole("cell", { name: "84.250000" })).toBeVisible();
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
    await environment.db("divisas").update({ Cambio: "42.125" });
  }
});

test("MySQL realmente suspendido oculta datos sin fallback anónimo y recupera", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser());
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
  docker("pause", environment.container);
  try {
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "No se puede validar la sesión" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toHaveCount(0);
  } finally {
    docker("unpause", environment.container);
  }
  await page.getByRole("button", { name: "Reintentar validación" }).click();
  await expect(page.getByRole("cell", { name: "42.125000" })).toBeVisible();
});

test("login móvil no desborda el viewport", async ({ page, environment }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(environment.origin);
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("MFA de login y reautenticación se verifican antes de administrar", async ({ page, environment }) => {
  const user = await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  await login(page, environment, user);
  await expect(page.getByRole("heading", { name: "Verificar segundo factor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toHaveCount(0);
  const token = await environment.token(user.secret);
  await page.getByRole("textbox", { name: "Código MFA", exact: true }).fill(token);
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
  await page.getByRole("textbox", { name: "Contraseña de reautenticación" }).fill(user.password);
  await page.getByRole("textbox", { name: "Código MFA de reautenticación" }).fill(token);
  await page.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  let fresh;
  await expect
    .poll(
      async () => {
        fresh = await environment.token(user.secret);
        return fresh !== token;
      },
      { timeout: 35000 },
    )
    .toBe(true);
  await page.getByRole("textbox", { name: "Contraseña de reautenticación" }).fill(user.password);
  await page.getByRole("textbox", { name: "Código MFA de reautenticación" }).fill(fresh);
  await page.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(page.getByText("Identidad confirmada.", { exact: true })).toBeVisible();
});
