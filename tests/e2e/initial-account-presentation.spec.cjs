const { test, expect } = require("./fixtures.cjs");

test.beforeEach(async ({ environment }) => {
  for (const table of [
    "dmmarket_auth_session_state",
    "dmmarket_auth_events",
    "dmmarket_auth_user_roles",
    "dmmarket_auth_user_sellers",
    "dmmarket_auth_role_permissions",
    "dmmarket_auth_users",
    "dmmarket_auth_roles",
    "dmmarket_auth_sessions",
    "dmmarket_auth_attempts",
  ])
    await environment.db(table).delete();
  await environment.db("dmmarket_auth_control").where("id", 1).update({ first_setup: "pending" });
});

for (const width of [390, 1440]) {
  test(`primer acceso sin card, compacto y con campos oscuros a ${width}px`, async ({ page, environment }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(environment.origin);
    await expect(page.getByRole("heading", { name: "Crear administrador", exact: true })).toBeVisible();
    await expect(page.locator(".card, .auth-entry-card")).toHaveCount(0);
    await expect(page.getByText(/Bienvenido a DMMarket|No se crean usuarios|Podrás activar MFA/)).toHaveCount(0);
    const form = page.locator("form");
    const bounds = await form.boundingBox();
    expect(bounds.width).toBeLessThanOrEqual(480);
    expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThan(2);
    for (const label of ["Nombre", "Username", "Contraseña", "Confirmar contraseña"]) {
      const input = page.getByLabel(label, { exact: true });
      await expect(input).toBeVisible();
      expect(await input.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
        "rgb(255, 255, 255)",
      );
      expect((await input.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAccessibleDescription(/15/);
    const submit = page.getByRole("button", { name: "Crear administrador", exact: true });
    await expect(submit).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("primer acceso muestra contraseñas y conserva identidad al corregir una confirmación", async ({
  page,
  environment,
}) => {
  await page.goto(environment.origin);
  await page.getByLabel("Nombre", { exact: true }).fill("Ana Pérez");
  await page.getByLabel("Username", { exact: true }).fill("ana.perez");
  const password = page.getByLabel("Contraseña", { exact: true });
  const confirmation = page.getByLabel("Confirmar contraseña", { exact: true });
  await password.fill("una-contraseña-larga-y-segura");
  await confirmation.fill("otra-contraseña-larga-y-segura");
  await page.getByRole("button", { name: "Mostrar contraseña", exact: true }).click();
  await page.getByRole("button", { name: "Mostrar confirmación", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirmation).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Crear administrador", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Las contraseñas no coinciden");
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Ana Pérez");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("ana.perez");
  await expect(password).toHaveValue("");
  await expect(confirmation).toHaveValue("");
  await expect(password).toHaveAttribute("type", "password");
  await expect(confirmation).toHaveAttribute("type", "password");
  expect(await environment.db("dmmarket_auth_users")).toHaveLength(0);
});

test("primer acceso respeta teclado, autocompletado y formato de username", async ({ page, environment }) => {
  await page.goto(environment.origin);
  const name = page.getByLabel("Nombre", { exact: true });
  const username = page.getByLabel("Username", { exact: true });
  const password = page.getByLabel("Contraseña", { exact: true });
  await expect(name).toHaveAttribute("autocomplete", "name");
  await expect(username).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  await name.focus();
  await page.keyboard.press("Tab");
  await expect(username).toBeFocused();
  await username.fill("ana perez");
  expect(await username.evaluate((element) => element.validity.patternMismatch)).toBe(true);
  await username.fill("ana.perez");
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Mostrar contraseña", exact: true })).toBeFocused();
});

test("primer acceso muestra progreso y evita envíos duplicados", async ({ page, environment }) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let submissions = 0;
  await page.route("**/api/auth/first-user", async (route) => {
    submissions += 1;
    await gate;
    await route.continue();
  });
  try {
    await page.goto(environment.origin);
    await page.getByLabel("Nombre", { exact: true }).fill("Ana Pérez");
    await page.getByLabel("Username", { exact: true }).fill("ana.perez");
    await page.getByLabel("Contraseña", { exact: true }).fill("una-contraseña-larga-y-segura");
    await page.getByLabel("Confirmar contraseña", { exact: true }).fill("una-contraseña-larga-y-segura");
    await page.getByRole("button", { name: "Crear administrador", exact: true }).click();
    await expect(page.getByRole("button", { name: "Creando cuenta…", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Username", { exact: true })).toBeDisabled();
    expect(submissions).toBe(1);
    release();
    await expect(page.getByRole("heading", { name: "Crear administrador", exact: true })).toHaveCount(0);
    expect(await page.evaluate(async () => (await (await fetch("/api/auth/session")).json()).stage)).toBe("ready");
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
