const { randomBytes } = require("node:crypto");
const { test, expect, login } = require("./fixtures.cjs");

async function autofill(locator, value) {
  await locator.evaluate((input, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, text);
  }, value);
  expect((await locator.inputValue()) === value).toBe(true);
}

async function submit(page, path, button, expected) {
  const control = page.getByRole("button", { name: button, exact: true });
  expect(await control.evaluate((element) => element.form.method)).toBe("post");
  const reply = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/auth/${path}`);
  await control.click();
  const response = await reply;
  const sent = response.request().postDataJSON();
  const result = await response.json();
  expect({
    status: response.status(),
    error: result.error?.message,
    sentVisibleValues: Object.entries(expected).every(([key, value]) => sent[key] === value),
  }).toEqual({ status: 200, error: undefined, sentVisibleValues: true });
  return result;
}

for (const stale of [false, true]) {
  test(`login autocompletado envía los valores visibles con estado ${stale ? "anterior" : "vacío"}`, async ({
    page,
    environment,
  }) => {
    const user = await environment.seedUser();
    await page.goto(environment.origin);
    const username = page.getByRole("textbox", { name: "Usuario", exact: true });
    const password = page.getByRole("textbox", { name: "Contraseña", exact: true });
    if (stale) {
      await username.fill("stale-user");
      await password.fill("stale-password");
    }
    await autofill(username, user.username);
    await autofill(password, user.password);
    await submit(page, "login", "Entrar", { username: user.username, password: user.password });
    await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
  });

  test(`MFA autocompletado envía el código visible con estado ${stale ? "anterior" : "vacío"}`, async ({
    page,
    environment,
  }) => {
    const user = await environment.seedUser({
      enrolled: true,
      permissions: [{ capability: "access.users", scope: "global" }],
    });
    await login(page, environment, user);
    const code = page.getByLabel("Código MFA", { exact: true });
    if (stale) await code.fill("000000");
    const token = await environment.token(user.secret);
    await autofill(code, token);
    await submit(page, "mfa", "Verificar código", { token });
    await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
  });
}

test("el cambio de contraseña usa los valores autocompletados visibles", async ({ page, environment }) => {
  const user = await environment.seedUser({ temporary: true });
  await login(page, environment, user);
  const password = randomBytes(24).toString("base64url");
  await autofill(page.getByLabel("Contraseña actual", { exact: true }), user.password);
  await autofill(page.getByLabel("Contraseña nueva", { exact: true }), password);
  await autofill(page.getByLabel("Confirmar contraseña nueva", { exact: true }), password);
  await submit(page, "password", "Guardar contraseña", {
    currentPassword: user.password,
    newPassword: password,
    token: "",
  });
  await expect(page.locator(".app-navbar-ref").getByText("42.125000", { exact: true })).toBeVisible();
});

test("el enrolamiento MFA usa la contraseña y el código autocompletados", async ({ page, environment }) => {
  const user = await environment.seedUser({
    permissions: [{ capability: "access.users", scope: "global" }],
    mfaRequired: true,
  });
  await login(page, environment, user);
  await autofill(page.getByLabel("Contraseña para configurar MFA", { exact: true }), user.password);
  const enrollment = await submit(page, "mfa/enrollment", "Generar configuración MFA", { password: user.password });
  const token = await environment.token(new URL(enrollment.uri).searchParams.get("secret"));
  await autofill(page.getByLabel("Código de confirmación MFA", { exact: true }), token);
  await submit(page, "mfa/enrollment/confirm", "Confirmar MFA", { token });
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
});

test("un error de confirmación borra también las contraseñas autocompletadas sin eventos", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({ temporary: true });
  await login(page, environment, user);
  const current = page.getByLabel("Contraseña actual", { exact: true });
  const password = page.getByLabel("Contraseña nueva", { exact: true });
  const confirmation = page.getByLabel("Confirmar contraseña nueva", { exact: true });
  await autofill(current, user.password);
  await autofill(password, randomBytes(24).toString("base64url"));
  await autofill(confirmation, randomBytes(24).toString("base64url"));
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Las contraseñas nuevas no coinciden.");
  expect((await current.inputValue()) === "").toBe(true);
  expect((await password.inputValue()) === "").toBe(true);
  expect((await confirmation.inputValue()) === "").toBe(true);
});

test("una comprobación de sesión en segundo plano no borra el autocompletado visible", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser();
  await page.bringToFront();
  await page.goto(environment.origin);
  const username = page.getByRole("textbox", { name: "Usuario", exact: true });
  const password = page.getByRole("textbox", { name: "Contraseña", exact: true });
  await autofill(username, user.username);
  await autofill(password, user.password);
  await page.waitForTimeout(1100);
  const checked = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/session");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await (await checked).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await username.inputValue()) === user.username).toBe(true);
  expect((await password.inputValue()) === user.password).toBe(true);
  await submit(page, "login", "Entrar", { username: user.username, password: user.password });
});

test("la reautenticación usa contraseña y MFA autocompletados sin reutilizar el código de login", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({
    enrolled: true,
    permissions: ["access.users", "access.roles"].map((capability) => ({ capability, scope: "global" })),
  });
  await login(page, environment, user);
  const used = await environment.token(user.secret);
  await page.getByLabel("Código MFA", { exact: true }).fill(used);
  await submit(page, "mfa", "Verificar código", { token: used });
  await expect(page.getByRole("heading", { name: "Administración de usuarios", exact: true })).toBeVisible();
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .whereNull("revoked_ms")
    .update({ password_ms: Date.now() - 300001 });
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  const panel = page.getByRole("region", { name: "Crear usuario", exact: true });
  await panel.getByLabel("Username", { exact: true }).fill("autofill-verified");
  await panel.getByLabel("Nombre", { exact: true }).fill("Persona autofill");
  await panel.getByLabel("Rol", { exact: true }).selectOption({ index: 1 });
  await panel.getByRole("button", { name: "Crear usuario", exact: true }).click();
  let token;
  await expect
    .poll(
      async () => {
        token = await environment.token(user.secret);
        return token !== used;
      },
      { timeout: 35000 },
    )
    .toBe(true);
  await autofill(page.getByLabel("Contraseña de reautenticación", { exact: true }), user.password);
  await autofill(page.getByLabel("Código MFA de reautenticación", { exact: true }), token);
  await submit(page, "reauthenticate", "Confirmar identidad", { password: user.password, token });
  await expect(page.getByRole("dialog", { name: "Credencial temporal", exact: true })).toBeVisible();
});
