const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const { startEnvironment, until } = require("../../../tests/support/auth-environment.cjs");
const { seedRates } = require("../../../tests/support/rate-fixtures.cjs");
let environment;
const grant = (capability) => ({ capability, scope: "global" });
async function actor(permissions, env = environment) {
  const user = await env.seedUser({ permissions, enrolled: true });
  const client = env.client();
  await client.login(user);
  const token = await env.token(user.secret);
  expect((await client.request("/api/auth/mfa", { method: "POST", body: { token } })).status).toBe(200);
  return { user, client, token };
}
async function copy(who) {
  await environment.db.raw("ALTER TABLE bcv_tasas ENGINE=InnoDB");
  const result = await who.client.request("/api/backups", { method: "POST", body: { confirmed: true } });
  expect(result.status).toBe(202);
  const status = await until(async () => {
    const value = (await who.client.request("/api/backups")).body;
    return !value.running &&
      value.lastRequest?.operationId === result.body.operationId &&
      value.lastRequest?.outcome !== "running"
      ? value
      : false;
  }, 60000);
  expect(status.lastRequest.outcome).toBe("success");
  const backup = status.backups.find((row) => row.name.includes(result.body.operationId));
  expect(backup).toBeTruthy();
  const file = path.join(environment.configuration.BACKUP_DIRECTORY, backup.name);
  return { file, operationId: result.body.operationId, dump: zlib.gunzipSync(fs.readFileSync(file)) };
}

function importArchive(env, dump) {
  execFileSync(
    "docker",
    ["exec", "-i", "-e", "MYSQL_PWD", env.container, "mysql", "--user=root", "--host=127.0.0.1", "dmmarket_auth_test"],
    {
      input: dump,
      env: { ...process.env, MYSQL_PWD: env.configuration.DATABASE_PASSWORD },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

beforeAll(async () => {
  environment = await startEnvironment({ web: true, rateSource: true });
  await seedRates(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("sin permiso específico no se inicia descarga BCV ni respaldo", async () => {
  const who = await actor([grant("rates.read"), grant("backups.read")]);
  const before = environment.rateSource.requests();
  expect(
    (await who.client.request("/api/currency_rates/bcv/sync", { method: "POST", body: { confirmed: true } })).status,
  ).toBe(403);
  expect((await who.client.request("/api/backups", { method: "POST", body: { confirmed: true } })).status).toBe(403);
  expect(environment.rateSource.requests()).toBe(before);
});

test("sincronización autorizada usa HTTP y XLS reales, audita actor y no cambia REF", async () => {
  const who = await actor([grant("rates.read"), grant("rates.sync")]);
  const result = await who.client.request("/api/currency_rates/bcv/sync", {
    method: "POST",
    body: { confirmed: true },
  });
  expect(result.status).toBe(202);
  await until(
    async () => (await who.client.request("/api/currency_rates/bcv/status")).body.lastRequest?.outcome === "success",
  );
  expect((await who.client.request("/api/currency_rates/bcv/latest")).body.tasa).toBe(400);
  expect(Number((await environment.db("divisas").where("Simbolo", "BsS").first()).Cambio)).toBe(42.125);
  expect(environment.rateSource.requests()).toBeGreaterThan(0);
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ actor_id: who.user.id, action: "rates.sync_completed", reason: result.body.operationId })
      .first(),
  ).toBeTruthy();
});

test("creación exige confirmación y reautenticación reciente antes del proceso externo", async () => {
  const who = await actor([grant("backups.read"), grant("backups.create")]);
  expect((await who.client.request("/api/backups", { method: "POST", body: { confirmed: false } })).status).toBe(400);
  expect(
    (await who.client.request("/api/backups", { method: "POST", body: { confirmed: true }, csrf: "bad" })).status,
  ).toBe(403);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", who.user.id)
    .update({ password_ms: Date.now() - 300001 });
  expect((await who.client.request("/api/backups", { method: "POST", body: { confirmed: true } })).status).toBe(403);
});

test("respaldo transaccional rechaza tablas no transaccionales sin activar bloqueo global", async () => {
  const who = await actor([grant("backups.read"), grant("backups.create")]);
  const result = await who.client.request("/api/backups", { method: "POST", body: { confirmed: true } });
  expect(result.status).toBe(202);
  const status = await until(async () => {
    const value = (await who.client.request("/api/backups")).body;
    return !value.running && value.lastRequest?.outcome === "failure" ? value : false;
  });
  expect(status.backups).toEqual([]);
  await environment.db.raw("ALTER TABLE bcv_tasas ENGINE=InnoDB");
});

test("respaldo real con cliente MySQL5.0.24 genera archivo privado y registra quién lo solicitó", async () => {
  const who = await actor([grant("backups.read"), grant("backups.create")]);
  const { dump, file, operationId } = await copy(who);
  const sql = dump.toString("utf8");
  expect(sql).toContain("CREATE TABLE `dmmarket_auth_users`");
  expect(sql).not.toContain(environment.configuration.AUTH_MFA_KEY);
  expect(sql).not.toContain(who.user.secret);
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ actor_id: who.user.id, action: "backups.create_completed", reason: operationId })
      .first(),
  ).toBeTruthy();
});

test("restauración aislada conserva cuentas y MFA sólo con las claves externas recuperadas", async () => {
  const who = await actor([grant("backups.read"), grant("backups.create")]);
  const { dump } = await copy(who);
  let token;
  await until(async () => {
    token = await environment.token(who.user.secret);
    return token !== who.token;
  }, 35000);
  const wrong = await startEnvironment({ web: true });
  try {
    importArchive(wrong, dump);
    const client = wrong.client();
    expect((await client.login(who.user)).body.stage).toBe("mfa");
    expect((await client.request("/api/auth/mfa", { method: "POST", body: { token } })).status).toBe(503);
  } finally {
    await wrong.close();
  }
  const restored = await startEnvironment({
    web: true,
    authKeys: {
      sessionSecret: environment.configuration.AUTH_SESSION_SECRET,
      mfaKey: environment.configuration.AUTH_MFA_KEY,
    },
  });
  try {
    importArchive(restored, dump);
    expect(Number((await restored.db("divisas").where("Simbolo", "BsS").first()).Cambio)).toBe(42.125);
    const client = restored.client();
    expect((await client.login(who.user)).body.stage).toBe("mfa");
    const fresh = await restored.token(who.user.secret);
    expect((await client.request("/api/auth/mfa", { method: "POST", body: { token: fresh } })).status).toBe(200);
  } finally {
    await restored.close();
  }
}, 120000);
