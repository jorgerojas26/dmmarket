const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
const { startSetupSandbox } = require("../../../tests/support/setup-sandbox.cjs");
const { readConfiguration } = backend("./setup-config");
const { proxyReady } = backend("./setup-network");
let environment;
let sandbox;
beforeAll(async () => {
  environment = await startEnvironment({ web: true, service: true });
  await seedSales(environment.db);
  await seedPurchases(environment.db);
});
afterAll(async () => {
  await environment?.close();
});
afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
});

test("asistente sólo entrega campos públicos y no acepta instalación sin conexión verificada", async () => {
  sandbox = await startSetupSandbox(environment);
  expect((await sandbox.request("config", undefined, false)).status).toBe(401);
  const configuration = await sandbox.request("config");
  expect(configuration.body.fields).toMatchObject({ HOST: "127.0.0.1", WEB_MODE: "caddy" });
  expect(JSON.stringify(configuration.body)).not.toContain(environment.configuration.AUTH_SESSION_SECRET);
  expect(JSON.stringify(configuration.body)).not.toContain(environment.configuration.AUTH_MFA_KEY);
  expect(JSON.stringify(configuration.body)).not.toContain(environment.configuration.DATABASE_PASSWORD);
  expect((await sandbox.request("install", { ...sandbox.payload, confirm: true, backupConfirmed: true })).status).toBe(
    409,
  );
});

test("HTTPS real usa CA válida y no requiere permiso de lectura de actualización para readiness", async () => {
  expect(await proxyReady(environment.configuration, environment.ca)).toBe(true);
  const wrong = await startEnvironment({ web: true, service: true });
  try {
    expect(await proxyReady(environment.configuration, wrong.ca)).toBe(false);
  } finally {
    await wrong.close();
  }
});

test("reinstalación sandbox conserva claves y genera configuración privada sin ejecutar comandos del SO", async () => {
  const user = await environment.seedUser({
    enrolled: true,
    permissions: ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
      capability,
      scope: "global",
    })),
  });
  expect(user.id).toBeTruthy();
  sandbox = await startSetupSandbox(environment);
  expect((await sandbox.request("test", sandbox.payload)).status).toBe(200);
  expect((await sandbox.request("install", { ...sandbox.payload, confirm: true, backupConfirmed: true })).status).toBe(
    200,
  );
  const saved = readConfiguration(sandbox.directory);
  expect(saved.AUTH_SESSION_SECRET).toBe(environment.configuration.AUTH_SESSION_SECRET);
  expect(saved.AUTH_MFA_KEY).toBe(environment.configuration.AUTH_MFA_KEY);
  expect(saved).not.toHaveProperty("AUTH_RECEIVABLES_WRITES_ENABLED");
  expect(saved).not.toHaveProperty("AUTH_COMMISSION_WRITES_ENABLED");
  expect(fs.statSync(path.join(sandbox.directory, ".env")).mode & 0o777).toBe(0o600);
  const status = await sandbox.request("status");
  expect(status.body).toMatchObject({
    ready: true,
    serviceReady: true,
    administratorReady: true,
    certificateAvailable: true,
  });
  expect(status.body.urls).toEqual([environment.origin]);
  expect((await sandbox.request("certificate")).body).toContain("BEGIN CERTIFICATE");
  expect((await sandbox.request("trust", { confirmed: false })).status).toBe(400);
});

test("base con cuentas no permite regenerar claves ausentes ni reemplazar una clave MFA distinta", async () => {
  await environment.seedUser({ enrolled: true });
  const missing = { ...environment.configuration };
  delete missing.AUTH_MFA_KEY;
  sandbox = await startSetupSandbox(environment, missing);
  expect((await sandbox.request("test", sandbox.payload)).status).toBe(200);
  const failed = await sandbox.request("install", { ...sandbox.payload, confirm: true, backupConfirmed: true });
  expect(failed.status).toBe(400);
  expect(failed.body.error).toContain("claves originales");
  expect(fs.existsSync(path.join(sandbox.directory, ".env"))).toBe(false);
  await sandbox.close();
  sandbox = await startSetupSandbox(environment, {
    ...environment.configuration,
    AUTH_MFA_KEY: randomBytes(32).toString("base64"),
  });
  expect((await sandbox.request("test", sandbox.payload)).status).toBe(200);
  expect((await sandbox.request("install", { ...sandbox.payload, confirm: true, backupConfirmed: true })).status).toBe(
    400,
  );
});

test("HTTP directo y backend expuesto se rechazan, sin alterar el esquema compartido", async () => {
  sandbox = await startSetupSandbox(environment);
  expect((await sandbox.request("test", sandbox.payload)).status).toBe(200);
  for (const change of [{ WEB_MODE: "direct" }, { HOST: "0.0.0.0" }, { WEB_HTTPS_PORT: sandbox.payload.PORT }])
    expect(
      (await sandbox.request("install", { ...sandbox.payload, ...change, confirm: true, backupConfirmed: true }))
        .status,
    ).toBe(400);
  expect((await environment.db("masterfact").count("* as total").first()).total).toBe(5);
});

test("primera preparación genera claves privadas sin crear administrador por HTTP ni tocar ventas", async () => {
  const fresh = await startEnvironment({ web: true, service: true });
  let setup;
  try {
    await seedSales(fresh.db);
    await seedPurchases(fresh.db);
    const existing = { ...fresh.configuration };
    delete existing.AUTH_SESSION_SECRET;
    delete existing.AUTH_MFA_KEY;
    setup = await startSetupSandbox(fresh, existing);
    expect((await setup.request("test", setup.payload)).status).toBe(200);
    const installed = await setup.request("install", { ...setup.payload, confirm: true, backupConfirmed: true });
    expect(installed.status).toBe(200);
    const saved = readConfiguration(setup.directory);
    expect(Buffer.from(saved.AUTH_SESSION_SECRET, "base64")).toHaveLength(32);
    expect(Buffer.from(saved.AUTH_MFA_KEY, "base64")).toHaveLength(32);
    expect(JSON.stringify(installed.body)).not.toContain(saved.AUTH_MFA_KEY);
    const status = await setup.request("status");
    expect(status.body).toMatchObject({
      ready: false,
      serviceReady: true,
      firstAdministratorRequired: true,
      administratorReady: false,
    });
    expect(status.body.bootstrapInstructions).toContain("--bootstrap-access");
    expect((await setup.request("bootstrap", { username: "forged" })).status).toBe(404);
    expect(Number((await fresh.db("dmmarket_auth_users").count("* as total").first()).total)).toBe(0);
    expect(Number((await fresh.db("masterfact").count("* as total").first()).total)).toBe(5);
  } finally {
    await setup?.close();
    await fresh.close();
  }
});

test("Caddy HTTPS conserva su autoridad al reiniciar con almacenamiento explícito privado", async () => {
  const net = require("node:net");
  const { X509Certificate } = require("node:crypto");
  const { startCaddySandbox } = require("../../../tests/support/caddy-sandbox.cjs");
  const { rootCertificateFile } = backend("./web-service");
  const port = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const value = probe.address().port;
      probe.close(() => resolve(value));
    });
  });
  const directory = path.join(environment.directory, "persisted-https");
  const configuration = {
    ...environment.configuration,
    AUTH_PUBLIC_ORIGIN: `https://${environment.configuration.WEB_HOSTNAME}:${port}`,
  };
  let caddy = await startCaddySandbox(configuration, directory);
  try {
    const fingerprint = new X509Certificate(caddy.ca).fingerprint256;
    expect(fs.statSync(path.join(directory, "Caddyfile")).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(rootCertificateFile(directory).replace("root.crt", "root.key"))).toBe(true);
    await caddy.close();
    caddy = await startCaddySandbox(configuration, directory);
    expect(new X509Certificate(caddy.ca).fingerprint256).toBe(fingerprint);
  } finally {
    await caddy.close();
  }
});
