const { randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { startEnvironment, backend, docker } = require("../../../tests/support/auth-environment.cjs");
const { prepareAccessSchema } = backend("./setup-access");
const stateMigration = backend("./migrations/20261029_add_initial_setup_state");
const { verifyPassword } = backend("./auth/passwords");
const { CAPABILITIES } = backend("./auth/capabilities");
let environment;
const payload = () => ({
  username: "first-owner",
  displayName: "Administrador inicial",
  password: randomBytes(24).toString("base64url"),
});
async function initialize(env = environment) {
  await prepareAccessSchema(env.configuration, { firstInstallation: true });
  const client = env.client();
  const session = await client.request("/api/auth/session");
  expect(session.body.stage).toBe("first-user");
  return client;
}
async function create(client, input = payload()) {
  return {
    input,
    response: await client.request("/api/auth/first-user", {
      method: "POST",
      body: { ...input, confirmation: input.password },
    }),
  };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true, service: true });
});
afterAll(async () => {
  await environment?.close();
});
beforeEach(async () => {
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
  await environment.db("dmmarket_auth_control").where("id", 1).update({ first_setup: "new" });
});

test("preparar tablas no habilita alta; únicamente primera instalación local abre el formulario", async () => {
  const client = environment.client();
  expect((await client.request("/api/auth/session")).body.stage).toBe("anonymous");
  expect((await create(client)).response.status).toBe(409);
  await initialize();
  expect((await environment.db("dmmarket_auth_control").first()).first_setup).toBe("pending");
});

test("Caddy reemplaza IP de cliente y no se puede seleccionar origen mediante cabeceras del navegador", async () => {
  await initialize();
  const client = environment.client();
  const status = await client.request("/api/auth/session", {
    headers: { "x-dmmarket-client-ip": "192.0.2.90", "x-forwarded-for": "192.0.2.90" },
  });
  expect(status.body.stage).toBe("first-user");
});

test("proxy TLS que identifica cliente LAN impide alta incluso con cabeceras locales falsificadas", async () => {
  const remote = await startEnvironment({ web: true, proxyClientAddress: "192.0.2.90" });
  try {
    await prepareAccessSchema(remote.configuration, { firstInstallation: true });
    const client = remote.client();
    expect(
      (
        await client.request("/api/auth/session", {
          headers: { "x-dmmarket-client-ip": "127.0.0.1", "x-forwarded-for": "127.0.0.1" },
        })
      ).body.stage,
    ).toBe("setup-required");
    const input = payload();
    expect(
      (
        await client.request("/api/auth/first-user", {
          method: "POST",
          headers: { "x-dmmarket-client-ip": "127.0.0.1", "x-forwarded-for": "127.0.0.1" },
          body: { ...input, confirmation: input.password },
        })
      ).status,
    ).toBe(403);
    expect(Number((await remote.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(0);
  } finally {
    await remote.close();
  }
});

test("primera cuenta es superusuario global con contraseña elegida, SID nuevo y MFA obligatorio", async () => {
  const client = await initialize();
  const cookie = client.jar.cookie;
  const { input, response } = await create(client);
  expect(response.status).toBe(200);
  expect(response.body.stage).toBe("mfa-enrollment");
  expect(client.jar.cookie).not.toBe(cookie);
  const user = await environment.db("dmmarket_auth_users").first();
  expect(user.must_change_password).toBe(0);
  expect(user.temporary_expires_ms).toBeNull();
  expect(await verifyPassword(input.password, user.password_hash)).toBe(true);
  expect(response.text).not.toContain(input.password);
  expect(response.text).not.toContain(user.password_hash);
  expect(response.body.permissions.sort((a, b) => a.capability.localeCompare(b.capability))).toEqual(
    Object.keys(CAPABILITIES)
      .sort((a, b) => a.localeCompare(b))
      .map((capability) => ({ capability, scope: "global" })),
  );
  const role = await environment
    .db("dmmarket_auth_roles as r")
    .join("dmmarket_auth_user_roles as ur", "ur.role_id", "r.id")
    .where("ur.user_id", user.id)
    .first("r.name");
  expect(role.name).toBe("Superusuario inicial");
  expect((await client.request("/api/currency_rates")).status).toBe(403);
  expect((await client.request("/api/auth/users")).status).toBe(403);
  expect((await environment.db("dmmarket_auth_control").first()).first_setup).toBe("closed");
  expect(
    await environment.db("dmmarket_auth_events").where("action", "auth.initial_administrator_created"),
  ).toHaveLength(1);
});

test.each(["short", "mismatch", "invalid-user"])(
  "valida %s sin crear cuenta ni cerrar el primer acceso",
  async (kind) => {
    const client = await initialize(),
      input = payload();
    let confirmation = input.password;
    if (kind === "short") {
      input.password = "short";
      confirmation = "short";
    } else if (kind === "mismatch") confirmation = "does-not-match-password";
    else input.username = "invalid user";
    expect(
      (await client.request("/api/auth/first-user", { method: "POST", body: { ...input, confirmation } })).status,
    ).toBe(400);
    expect(Number((await environment.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(0);
    expect((await environment.db("dmmarket_auth_control").first()).first_setup).toBe("pending");
  },
);

test("CSRF y origen siguen siendo obligatorios antes de crear cualquier cuenta", async () => {
  const client = await initialize(),
    input = payload();
  const body = { ...input, confirmation: input.password };
  expect((await client.request("/api/auth/first-user", { method: "POST", body, csrf: "" })).status).toBe(403);
  expect(
    (
      await client.request("/api/auth/first-user", {
        method: "POST",
        body,
        headers: { origin: "https://not-dmmarket.invalid" },
      })
    ).status,
  ).toBe(403);
  expect(Number((await environment.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(0);
});

test("dos sesiones concurrentes sólo pueden crear un administrador inicial", async () => {
  const first = await initialize(),
    second = environment.client();
  await second.request("/api/auth/session");
  const outcomes = await Promise.all([create(first), create(second, { ...payload(), username: "second-owner" })]);
  expect(outcomes.map((row) => row.response.status).sort()).toEqual([200, 409]);
  expect(Number((await environment.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(1);
  expect(
    await environment.db("dmmarket_auth_events").where("action", "auth.initial_administrator_created"),
  ).toHaveLength(1);
});

test("interrumpir MFA permite volver con la misma contraseña y no abre otra alta", async () => {
  const client = await initialize();
  const { input } = await create(client);
  await client.request("/api/auth/logout", { method: "POST", body: {} });
  expect((await client.request("/api/auth/session")).body.stage).toBe("anonymous");
  expect((await create(client)).response.status).toBe(409);
  expect((await client.login(input)).body.stage).toBe("mfa-enrollment");
  const enrollment = await client.request("/api/auth/mfa/enrollment", {
    method: "POST",
    body: { password: input.password },
  });
  const secret = new URL(enrollment.body.uri).searchParams.get("secret");
  const confirmed = await client.request("/api/auth/mfa/enrollment/confirm", {
    method: "POST",
    body: { token: await environment.token(secret) },
  });
  expect(confirmed.body.stage).toBe("ready");
  expect((await client.request("/api/auth/users")).status).toBe(200);
  expect((await client.request("/api/currency_rates")).status).toBe(200);
  const session = await client.request("/api/auth/session");
  expect(session.body.permissions).toHaveLength(Object.keys(CAPABILITIES).length);
  expect(session.body.permissions.every((grant) => grant.scope === "global")).toBe(true);
});

test("reinicio real conserva cierre y sesión MFA pendiente", async () => {
  const client = await initialize();
  await create(client);
  environment.server.kill("SIGTERM");
  await once(environment.server, "exit");
  await environment.restartServer();
  expect((await client.request("/api/auth/session")).body.stage).toBe("mfa-enrollment");
  const other = environment.client();
  expect((await other.request("/api/auth/session")).body.stage).toBe("anonymous");
});

test("reinstalación, cuenta deshabilitada y pérdida de cuentas no reabren el formulario", async () => {
  const client = await initialize();
  await create(client);
  await environment.db("dmmarket_auth_users").update({ enabled: false });
  await prepareAccessSchema(environment.configuration, { firstInstallation: false });
  const other = environment.client();
  expect((await other.request("/api/auth/session")).body.stage).toBe("anonymous");
  for (const table of [
    "dmmarket_auth_session_state",
    "dmmarket_auth_events",
    "dmmarket_auth_user_roles",
    "dmmarket_auth_user_sellers",
    "dmmarket_auth_users",
  ])
    await environment.db(table).delete();
  await prepareAccessSchema(environment.configuration, { firstInstallation: true });
  expect((await other.request("/api/auth/session")).body.stage).toBe("anonymous");
  expect((await create(other)).response.status).toBe(409);
});

test("instalación anterior vacía queda cerrada por defecto al añadir estado nuevo", async () => {
  await environment.db.schema.alterTable("dmmarket_auth_control", (table) => table.dropColumn("first_setup"));
  await stateMigration.up(environment.db);
  await prepareAccessSchema(environment.configuration, { firstInstallation: true });
  expect((await environment.client().request("/api/auth/session")).body.stage).toBe("anonymous");
});

test("CLI de emergencia cierra igualmente la inicialización web", async () => {
  await initialize();
  const accounts = await backend("./auth/accounts").createAccountService({ db: environment.db });
  await accounts.recoverLocally({
    mode: "bootstrap",
    username: "console-owner",
    displayName: "Responsable local",
    reason: "Verificar bootstrap local compatible",
  });
  expect((await environment.db("dmmarket_auth_control").first()).first_setup).toBe("closed");
  expect((await environment.client().request("/api/auth/session")).body.stage).toBe("anonymous");
});

test("error real SQL revierte la cuenta, rol inicial y cierre del formulario", async () => {
  const client = await initialize();
  docker(
    "exec",
    "--env",
    "MYSQL_PWD=root",
    environment.container,
    "mysql",
    "--user=root",
    environment.configuration.DATABASE_NAME,
    "--execute",
    "CREATE TRIGGER fail_first_user_audit BEFORE INSERT ON dmmarket_auth_events FOR EACH ROW INSERT INTO missing_first_user_audit(id) VALUES(NEW.id)",
  );
  try {
    expect((await create(client)).response.status).toBe(503);
    expect(Number((await environment.db("dmmarket_auth_users").count("* as n").first()).n)).toBe(0);
    expect((await environment.db("dmmarket_auth_control").first()).first_setup).toBe("pending");
  } finally {
    docker(
      "exec",
      "--env",
      "MYSQL_PWD=root",
      environment.container,
      "mysql",
      "--user=root",
      environment.configuration.DATABASE_NAME,
      "--execute",
      "DROP TRIGGER fail_first_user_audit",
    );
  }
});

test("indisponibilidad MySQL no se convierte en una instalación nueva", async () => {
  const client = await initialize();
  await create(client);
  docker("pause", environment.container);
  try {
    let response;
    try {
      response = await environment.client().request("/api/auth/session");
    } catch (error) {
      expect(error.message).toMatch(/Timeout|socket|ECONNRESET/);
    }
    if (response) expect(response.status).toBe(503);
  } finally {
    docker("unpause", environment.container);
  }
  expect((await environment.client().request("/api/auth/session")).body.stage).toBe("anonymous");
});

test("proxy anterior sin contrato de IP confiable no habilita el primer acceso", async () => {
  await initialize();
  const credential = require("node:crypto")
    .createHmac("sha256", Buffer.from(environment.configuration.AUTH_SESSION_SECRET, "base64"))
    .update("dmmarket:proxy:v1")
    .digest("base64url");
  const status = await new Promise((resolve, reject) => {
    require("node:http")
      .get(
        {
          hostname: "127.0.0.1",
          port: environment.internalPort,
          path: "/api/auth/session",
          headers: {
            host: new URL(environment.origin).host,
            "x-forwarded-proto": "https",
            "x-dmmarket-proxy": credential,
            "x-dmmarket-client-ip": "127.0.0.1",
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      )
      .on("error", reject);
  });
  expect(status).toBe(403);
});
