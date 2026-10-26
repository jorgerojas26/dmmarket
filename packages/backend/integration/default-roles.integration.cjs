const { randomUUID, randomBytes } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { seed } = backend("./seeds/001_default_roles");
const { createAccess } = backend("./auth/capabilities");
const { createSessionService } = backend("./auth/sessions");
const { createAttemptLimiter } = backend("./auth/attempts");
let environment;
const expected = {
  Dirección: [
    "sales.read",
    "sales.financial",
    "sales.export",
    "clients.read",
    "clients.personal",
    "clients.export",
    "sellers.read",
    "sellers.personal",
    "sellers.export",
    "providers.read",
    "providers.export",
    "purchases.read",
    "purchases.costs",
    "purchases.export",
    "inventory.read",
    "inventory.costs",
    "inventory.export",
    "receivables.read",
    "receivables.export",
    "receivables.payment",
    "receivables.void",
    "receivables.close",
    "receivables.reopen",
    "rates.read",
    "access.users",
    "access.roles",
    "access.links",
  ],
  "Administración técnica": [
    "access.users",
    "access.roles",
    "access.links",
    "access.recover",
    "rates.read",
    "rates.sync",
    "backups.read",
    "backups.create",
    "updates.read",
    "updates.execute",
    "cache.clear",
    "audit.read",
  ],
  "Consulta operativa": ["sales.read", "inventory.read"],
  Cobranza: ["receivables.read", "receivables.payment"],
};
async function roles() {
  return environment.db("dmmarket_auth_roles").orderBy("id");
}
async function grants(id) {
  return environment
    .db("dmmarket_auth_role_permissions")
    .where("role_id", id)
    .select("capability", "scope")
    .orderBy("capability");
}
async function matrix() {
  const rows = await roles();
  expect(rows).toHaveLength(4);
  for (const row of rows)
    expect(await grants(row.id)).toEqual(
      expected[row.name]
        .map((capability) => ({ capability, scope: "global" }))
        .sort((a, b) => a.capability.localeCompare(b.capability)),
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
    "dmmarket_auth_user_sellers",
    "dmmarket_auth_role_permissions",
    "dmmarket_auth_users",
    "dmmarket_auth_roles",
  ])
    await environment.db(table).delete();
});

test("seed crea exactamente los cuatro roles acordados sin cuentas, credenciales ni asignaciones", async () => {
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
  expect(events).toHaveLength(4);
  expect(events.every((row) => row.actor_id === null && created.some((role) => role.id === row.target_role_id))).toBe(
    true,
  );
});

test("permisos son grupos ordinarios, Dirección no recibe técnicos y Operativa es global sin finanzas", async () => {
  await seed(environment.db);
  const rows = await roles();
  const access = async (name) => createAccess(await grants(rows.find((row) => row.name === name).id), []);
  const direction = await access("Dirección");
  for (const cap of [
    "access.users",
    "access.roles",
    "access.links",
    "receivables.void",
    "receivables.close",
    "receivables.reopen",
    "sales.financial",
  ])
    expect(direction.hasGlobal(cap)).toBe(true);
  for (const cap of [
    "access.recover",
    "backups.read",
    "backups.create",
    "updates.read",
    "updates.execute",
    "rates.sync",
    "cache.clear",
    "audit.read",
    "commissions.update",
  ])
    expect(direction.hasGlobal(cap)).toBe(false);
  const technical = await access("Administración técnica");
  expect(technical.hasGlobal("access.recover")).toBe(true);
  expect(technical.hasGlobal("sales.read")).toBe(false);
  expect(technical.hasGlobal("sales.financial")).toBe(false);
  const operational = await access("Consulta operativa");
  expect(operational.canRecord("sales.read", "B")).toBe(true);
  expect(operational.hasGlobal("sales.financial")).toBe(false);
  expect(operational.hasGlobal("sales.export")).toBe(false);
  expect(operational.privileged).toBe(false);
  const collection = await access("Cobranza");
  expect(collection.hasGlobal("receivables.payment")).toBe(true);
  expect(collection.hasGlobal("receivables.void")).toBe(false);
  expect(collection.privileged).toBe(true);
});

test("repetir seed preserva IDs, nombres personalizados y permisos vaciados o modificados", async () => {
  await seed(environment.db);
  const rows = await roles(),
    id = rows.find((row) => row.name === "Dirección").id,
    empty = rows.find((row) => row.name === "Cobranza").id;
  await environment.db("dmmarket_auth_roles").where("id", id).update({ name: "Dirección personalizada" });
  await environment.db("dmmarket_auth_role_permissions").whereIn("role_id", [id, empty]).delete();
  await environment
    .db("dmmarket_auth_role_permissions")
    .insert({ role_id: id, capability: "rates.read", scope: "global" });
  const before = await roles(),
    permissions = await environment.db("dmmarket_auth_role_permissions").orderBy("role_id").orderBy("capability");
  await seed(environment.db);
  await seed(environment.db);
  expect(await roles()).toEqual(before);
  expect(await environment.db("dmmarket_auth_role_permissions").orderBy("role_id").orderBy("capability")).toEqual(
    permissions,
  );
  expect(await environment.db("dmmarket_auth_events").where("action", "auth.default_role_created")).toHaveLength(4);
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
  const operator = (await roles()).find((role) => role.name === "Consulta operativa");
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
  expect(await environment.db("dmmarket_auth_events").where("action", "auth.default_role_created")).toHaveLength(4);
});

test("colisión con nombre de rol propio detiene toda la siembra sin adoptar ni sobrescribir", async () => {
  const id = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id, name: "Cobranza" });
  await environment
    .db("dmmarket_auth_role_permissions")
    .insert({ role_id: id, capability: "rates.read", scope: "global" });
  await expect(seed(environment.db)).rejects.toThrow("Cobranza");
  expect(await roles()).toEqual([{ id, name: "Cobranza" }]);
  expect(await grants(id)).toEqual([{ capability: "rates.read", scope: "global" }]);
  expect(await environment.db("dmmarket_auth_events")).toHaveLength(0);
});

test("error real de auditoría revierte también roles y permisos ya insertados", async () => {
  await environment.db.raw(
    "CREATE TRIGGER fail_default_role_audit BEFORE INSERT ON dmmarket_auth_events FOR EACH ROW INSERT INTO missing_seed_audit_target(id) VALUES(NEW.id)",
  );
  try {
    await expect(seed(environment.db)).rejects.toThrow();
    expect(await roles()).toHaveLength(0);
    expect(await environment.db("dmmarket_auth_role_permissions")).toHaveLength(0);
  } finally {
    await environment.db.raw("DROP TRIGGER fail_default_role_audit");
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
    await environment.db("dmmarket_auth_control").insert({ id: 1 });
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

test("bootstrap explícito conserva sólo permisos de emergencia sin asignar el rol técnico ampliado", async () => {
  await seed(environment.db);
  const accounts = await backend("./auth/accounts").createAccountService({ db: environment.db });
  const account = await accounts.recoverLocally({
    mode: "bootstrap",
    username: "default-role-owner",
    displayName: "Responsable inicial",
    reason: "Verificar bootstrap sin ampliación",
  });
  const permissions = await environment
    .db("dmmarket_auth_role_permissions as p")
    .join("dmmarket_auth_user_roles as r", "r.role_id", "p.role_id")
    .where("r.user_id", account.id)
    .select("p.capability", "p.scope")
    .orderBy("p.capability");
  expect(permissions).toEqual(
    ["access.users", "access.roles", "access.links", "access.recover"]
      .sort()
      .map((capability) => ({ capability, scope: "global" })),
  );
  const technical = await environment.db("dmmarket_auth_roles").where("name", "Administración técnica").first();
  expect(
    await environment.db("dmmarket_auth_user_roles").where({ user_id: account.id, role_id: technical.id }),
  ).toHaveLength(0);
});
