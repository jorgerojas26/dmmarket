const { randomBytes } = require("node:crypto");
const { test: base, expect } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { startCompiledSetupSandbox } = require("../support/setup-sandbox.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedPurchases } = require("../support/purchase-fixtures.cjs");
const { buildNativeServer } = require("../support/native-server.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw Error("Se requiere Chrome real");
      const binary = buildNativeServer();
      let environment;
      try {
        environment = await startEnvironment({ web: true, service: true, executablePath: binary.executablePath });
        await seedSales(environment.db);
        await seedPurchases(environment.db);
        await use(environment);
      } finally {
        await environment?.close();
        binary.close();
      }
    },
    { scope: "worker" },
  ],
});

test("primera apertura tras instalador compilado crea administrador y completa MFA sin terminal ni código de activación", async ({
  page,
  environment,
}) => {
  const setup = await startCompiledSetupSandbox(environment, { installed: false });
  const user = { username: "initial-web-owner", password: randomBytes(24).toString("base64url") };
  try {
    await setup.request("test", setup.payload);
    expect((await setup.request("install", { ...setup.payload, confirm: true, backupConfirmed: true })).status).toBe(
      200,
    );
    const status = await setup.request("status");
    expect(status.body.bootstrapInstructions).toContain("desde el propio servidor");
    await page.goto(environment.origin);
    await expect(page.getByRole("heading", { name: "Crear primer administrador", exact: true })).toBeVisible();
    await page.getByLabel("Nombre", { exact: true }).fill("Responsable inicial");
    await page.getByLabel("Usuario", { exact: true }).fill(user.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(user.password);
    await page.getByLabel("Confirmar contraseña", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Crear administrador", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Configurar segundo factor", exact: true })).toBeVisible();
    const pendingMfa = await setup.request("status");
    expect(pendingMfa.body.bootstrapInstructions).toContain("completar MFA");
    expect(pendingMfa.body.bootstrapInstructions).not.toContain("--bootstrap-access");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Configurar segundo factor", exact: true })).toBeVisible();
    await page.getByLabel("Contraseña para configurar MFA", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Generar configuración MFA", exact: true }).click();
    const uri = await page.getByLabel("Configuración manual MFA", { exact: true }).inputValue();
    await page
      .getByLabel("Código de confirmación MFA", { exact: true })
      .fill(await environment.token(new URL(uri).searchParams.get("secret")));
    await page.getByRole("button", { name: "Confirmar MFA", exact: true }).click();
    await expect(page.getByRole("link", { name: "Acceso", exact: true })).toBeVisible();
    const ready = await setup.request("status");
    expect(ready.body.administratorReady).toBe(true);
    expect(ready.body.bootstrapInstructions).not.toContain("--bootstrap-access");
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    expect(Number((await environment.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(1);
    expect((await environment.db("dmmarket_auth_control").first()).first_setup).toBe("closed");
  } finally {
    await setup.close();
  }
});

test("móvil muestra login y no alta inicial después de configurar", async ({ page, environment }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(environment.origin);
  await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crear primer administrador", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
