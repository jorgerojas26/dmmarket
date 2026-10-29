const { randomBytes } = require("node:crypto");
const { test: base, expect, logout } = require("./fixtures.cjs");
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

test("primera apertura tras instalador compilado crea administrador sin obligar MFA ni usar terminal o código de activación", async ({
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
    await expect(page.getByRole("heading", { name: "Crear administrador", exact: true })).toBeVisible();
    await page.getByLabel("Nombre", { exact: true }).fill("Responsable inicial");
    await page.getByLabel("Username", { exact: true }).fill(user.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(user.password);
    await page.getByLabel("Confirmar contraseña", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Crear administrador", exact: true }).click();
    await expect(page).toHaveURL((url) => url.origin === environment.origin && url.pathname === "/ventas");
    for (const name of ["Ventas", "Compras", "Clientes", "Proveedores", "Vendedores", "Inventario"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Confirmar identidad para administrar acceso", exact: true }),
    ).toHaveCount(0);
    const permissions = await page.evaluate(async () => (await (await fetch("/api/auth/session")).json()).permissions);
    const { CAPABILITIES } = require("../support/auth-environment.cjs").backend("./auth/capabilities");
    expect(permissions.map((grant) => grant.capability).sort()).toEqual(Object.keys(CAPABILITIES).sort());
    expect(permissions.every((grant) => grant.scope === "global")).toBe(true);
    await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
    for (const name of ["Configuración", "Auditoría", "Acceso", "Mi cuenta"])
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Menú de cuenta", exact: true }).click();
    const ready = await setup.request("status");
    expect(ready.body.administratorReady).toBe(true);
    expect(ready.body.bootstrapInstructions).not.toContain("--bootstrap-access");
    await logout(page);
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
  await expect(page.getByRole("heading", { name: "Crear administrador", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
