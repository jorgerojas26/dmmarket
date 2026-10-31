const { randomUUID, randomBytes } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { startEnvironment, backend, docker } = require("../../../tests/support/auth-environment.cjs");
const { seed } = backend("./seeds/001_default_roles");
const { CAPABILITIES, createAccess } = backend("./auth/capabilities");
const { createSessionService } = backend("./auth/sessions");
const { createAttemptLimiter } = backend("./auth/attempts");
let environment;
const expected = Object.fromEntries(backend("./auth/default-roles").roles.map((role) => [role.name, role.permissions]));

async function roles() {
  return environment.db("dmmarket_auth_roles").orderBy("id");
}
async function grants(id) {
  return environment
    .db("dmmarket_auth_role_capabilities")
    .where("role_id", id)
    .select("capability")
    .orderBy("capability");
}
async function matrix() {
  const rows = await roles();
  expect(rows).toHaveLength(5);
  expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(expected).sort());
  for (const row of rows)
    expect(await grants(row.id)).toEqual(
      expected[row.name].map((capability) => ({ capability })).sort((a, b) => a.capability.localeCompare(b.capability)),
    );
  return rows;
}
beforeAll(async () => {
  environment = await startEnvironment();
});
afterAll(async () => {
  await environment?.close();
});
beforeEach(async () => {
  for (const table of [
    "dmmarket_auth_session_state",
    "dmmarket_auth_events",
    "dmmarket_auth_user_roles",
    "dmmarket_auth_commercial_profiles",
    "dmmarket_auth_role_capabilities",
    "dmmarket_auth_users",
    "dmmarket_auth_roles",
  ])
    await environment.db(table).delete();
});

test("seed crea exactamente los cinco roles acordados sin cuentas, credenciales ni asignaciones", async () => {
  await seed(environment.db);
  const created = await matrix();
  for (const table of [
    "dmmarket_auth_users",
    "dmmarket_auth_user_roles",
    "dmmarket_auth_session_state",
    "dmmarket_auth_sessions",
  ])
    expect(Number((await environment.db(table).count("* as n").first()).n)).toBe(0);
  const events = await environment.db("dmmarket_auth_events").where("action", "auth.default_role_created");
  expect(events).toHaveLength(5);
  expect(events.every((row) => row.actor_id === null && created.some((role) => role.id === row.target_role_id))).toBe(
    true,
  );
});

test("Administrador no recibe técnicos, Consultor no recibe finanzas y Superusuario tiene todo", async () => {
  await seed(environment.db);
  const rows = await roles();
  const access = async (name) => createAccess(await grants(rows.find((row) => row.name === name).id), null);
  const direction = await access("Administrador");
  for (const cap of [
    "access.users.update",
    "access.roles.update",
    "access.profile.update",
    "clients.receivables.void",
    "clients.receivables.close",
    "sales.dashboard.financial",
  ])
    expect(direction.hasGlobal(cap)).toBe(true);
  for (const cap of [
    "access.recovery.execute",
    "settings.backups.read",
    "settings.backups.create",
    "settings.updates.read",
    "settings.updates.execute",
    "settings.rates.sync",
    "settings.cache.clear",
    "audit.events.read",
    "sellers.commissions.update",
  ])
    expect(direction.hasGlobal(cap)).toBe(false);
  const superuser = await access("Superusuario");
  for (const capability of Object.keys(CAPABILITIES)) expect(superuser.hasGlobal(capability)).toBe(true);
  const operational = await access("Consultor");
  expect(operational.canRecord("sales.dashboard.read", "B")).toBe(true);
  expect(operational.hasGlobal("sales.dashboard.financial")).toBe(false);
  expect(operational.hasGlobal("sales.breakdown.export")).toBe(false);
  expect(operational.privileged).toBe(false);
  const collection = await access("Cobranza");
  expect(collection.hasGlobal("clients.receivables.payment")).toBe(true);
  expect(collection.hasGlobal("clients.receivables.void")).toBe(false);
  expect(collection.privileged).toBe(true);
});

test("repetir seed preserva IDs, nombres personalizados y permisos vaciados o modificados", async () => {
  await seed(environment.db);
  const rows = await roles(),
    id = rows.find((row) => row.name === "Administrador").id,
    empty = rows.find((row) => row.name === "Cobranza").id;
  await environment.db("dmmarket_auth_roles").where("id", id).update({ name: "Administrador personalizada" });
  await environment.db("dmmarket_auth_role_capabilities").whereIn("role_id", [id, empty]).delete();
  await environment.db("dmmarket_auth_role_capabilities").insert({ role_id: id, capability: "settings.rates.read" });
  const before = await roles(),
    permissions = await environment.db("dmmarket_auth_role_capabilities").orderBy("role_id").orderBy("capability");
  await seed(environment.db);
  await seed(environment.db);
  expect(await roles()).toEqual(before);
  expect(await environment.db("dmmarket_auth_role_capabilities").orderBy("role_id").orderBy("capability")).toEqual(
    permissions,
  );
  expect(await environment.db("dmmarket_auth_events").where("action", "auth.default_role_created")).toHaveLength(5);
});

test("usuarios, sesiones y asignaciones existentes no se modifican al instalar ni repetir", async () => {
  const user = await environment.seedUser({ permissions: [] });
  const sessions = await createSessionService({
    db: environment.db,
    mfa: environment.mfa,
    attempts: createAttemptLimiter({ db: environment.db, secret: randomBytes(32).toString("base64") }),
  });
  const sid = randomBytes(24).toString("base64url");
  await sessions.login({ sid, username: user.username, password: user.password }, "127.0.0.1");
  const before = await environment.db("dmmarket_auth_users").where("id", user.id).first();
  await seed(environment.db);
  const operator = (await roles()).find((role) => role.name === "Consultor");
  await environment.db("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: operator.id });
  await seed(environment.db);
  expect(await environment.db("dmmarket_auth_users").where("id", user.id).first()).toEqual(before);
  expect((await sessions.status(sid)).stage).toBe("ready");
  expect(await environment.db("dmmarket_auth_user_roles").where("user_id", user.id)).toEqual([
    { user_id: user.id, role_id: operator.id },
  ]);
});

test("dos ejecuciones concurrentes no duplican roles, permisos ni eventos", async () => {
  await Promise.all([seed(environment.db), seed(environment.db)]);
  await matrix();
  expect(await environment.db("dmmarket_auth_events").where("action", "auth.default_role_created")).toHaveLength(5);
});

test("colisión con nombre de rol propio detiene toda la siembra sin adoptar ni sobrescribir", async () => {
  const id = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id, name: "Cobranza" });
  await environment.db("dmmarket_auth_role_capabilities").insert({ role_id: id, capability: "settings.rates.read" });
  await expect(seed(environment.db)).rejects.toThrow("Cobranza");
  expect(await roles()).toEqual([{ id, name: "Cobranza" }]);
  expect(await grants(id)).toEqual([{ capability: "settings.rates.read" }]);
  expect(await environment.db("dmmarket_auth_events")).toHaveLength(0);
});

test("error real de auditoría revierte también roles y permisos ya insertados", async () => {
  docker(
    "exec",
    "--env",
    "MYSQL_PWD=root",
    environment.container,
    "mysql",
    "--user=root",
    environment.configuration.DATABASE_NAME,
    "--execute",
    "CREATE TRIGGER fail_default_role_audit BEFORE INSERT ON dmmarket_auth_events FOR EACH ROW INSERT INTO missing_seed_audit_target(id) VALUES(NEW.id)",
  );
  try {
    await expect(seed(environment.db)).rejects.toThrow();
    expect(await roles()).toHaveLength(0);
    expect(await environment.db("dmmarket_auth_role_capabilities")).toHaveLength(0);
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
      "DROP TRIGGER fail_default_role_audit",
    );
  }
});

test("seed exige esquema compatible y no modifica tablas compartidas", async () => {
  await environment.db.schema.createTable("business_seed_sentinel", (table) => {
    table.engine("MyISAM");
    table.charset("latin1");
    table.collate("latin1_swedish_ci");
    table.string("value");
  });
  await environment.db("business_seed_sentinel").insert({ value: "business-owned" });
  const tables = await environment
    .db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .select("TABLE_NAME", "ENGINE", "TABLE_COLLATION")
    .orderBy("TABLE_NAME");
  await seed(environment.db);
  expect(await environment.db("business_seed_sentinel")).toEqual([{ value: "business-owned" }]);
  expect(
    await environment
      .db("information_schema.TABLES")
      .whereRaw("TABLE_SCHEMA = DATABASE()")
      .select("TABLE_NAME", "ENGINE", "TABLE_COLLATION")
      .orderBy("TABLE_NAME"),
  ).toEqual(tables);
  await environment.db("dmmarket_auth_control").where("id", 1).delete();
  try {
    await expect(seed(environment.db)).rejects.toThrow("control transaccional");
  } finally {
    await environment.db("dmmarket_auth_control").insert({ id: 1, commercial_model: 1 });
  }
});

test("Knex seed:run ejecuta el mismo archivo real y es idempotente desde el task runner Bun", async () => {
  const cwd = path.resolve(__dirname, "..");
  const env = { ...process.env, ...environment.configuration, DEBUG: "" };
  execFileSync("bun", ["run", "seed"], { cwd, env, stdio: "pipe", timeout: 30000 });
  const before = await matrix();
  execFileSync("bun", ["run", "seed"], { cwd, env, stdio: "pipe", timeout: 30000 });
  expect(await roles()).toEqual(before);
});

test("recuperación de una cuenta existente no concede permisos de negocio adicionales", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "settings.rates.read" }] });
  const accounts = await backend("./auth/accounts").createAccountService({ db: environment.db });
  await accounts.recoverLocally({
    mode: "recover",
    username: user.username,
    reason: "Recuperación local sin ampliar negocio",
  });
  const grants = await environment
    .db("dmmarket_auth_role_capabilities as p")
    .join("dmmarket_auth_user_roles as r", "r.role_id", "p.role_id")
    .where("r.user_id", user.id)
    .select("p.capability")
    .orderBy("p.capability");
  expect(grants).toEqual(
    [
      "access.users.read",
      "access.users.create",
      "access.users.update",
      "access.roles.read",
      "access.roles.create",
      "access.roles.update",
      "access.roles.assign",
      "access.profile.read",
      "access.profile.update",
      "access.recovery.read",
      "access.recovery.execute",
      "settings.rates.read",
    ]
      .sort()
      .map((capability) => ({ capability })),
  );
});

test("bootstrap inicial explícito concede todo el catálogo sin modificar los roles predefinidos", async () => {
  await seed(environment.db);
  const accounts = await backend("./auth/accounts").createAccountService({ db: environment.db });
  const account = await accounts.recoverLocally({
    mode: "bootstrap",
    username: "default-role-owner",
    displayName: "Responsable inicial",
    reason: "Verificar superusuario inicial",
  });
  const permissions = await environment
    .db("dmmarket_auth_role_capabilities as p")
    .join("dmmarket_auth_user_roles as r", "r.role_id", "p.role_id")
    .where("r.user_id", account.id)
    .select("p.capability")
    .orderBy("p.capability");
  expect(permissions).toEqual(
    Object.keys(CAPABILITIES)
      .sort()
      .map((capability) => ({ capability })),
  );
  const superuser = await environment.db("dmmarket_auth_roles").where("name", "Superusuario").first();
  expect(
    await environment.db("dmmarket_auth_user_roles").where({ user_id: account.id, role_id: superuser.id }),
  ).toHaveLength(1);
  await matrix();
});
