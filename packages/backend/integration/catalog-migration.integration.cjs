const { randomUUID, randomBytes } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const migration = backend("./migrations/20261028_consolidate_access_catalog");
const { assertAuthSchema, accessFor } = backend("./auth/identity");
const { createSessionService } = backend("./auth/sessions");
const { createAttemptLimiter } = backend("./auth/attempts");
let environment;
const grant = (capability, scope = "global") => ({ capability, scope });
async function role(grants) {
  const id = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id, name: id });
  if (grants.length)
    await environment.db("dmmarket_auth_role_permissions").insert(grants.map((row) => ({ role_id: id, ...row })));
  return id;
}
async function assign(user, roles) {
  await environment.db("dmmarket_auth_user_roles").insert(roles.map((role_id) => ({ user_id: user.id, role_id })));
}
beforeAll(async () => {
  environment = await startEnvironment();
});
afterAll(async () => {
  await environment?.close();
});
afterEach(async () => {
  await environment.db("dmmarket_auth_role_permissions").delete();
});

test.each([
  [null, null, null],
  ["assigned", null, null],
  ["global", null, null],
  [null, "assigned", null],
  [null, "global", null],
  ["assigned", "assigned", "assigned"],
  ["assigned", "global", "assigned"],
  ["global", "assigned", "assigned"],
  ["global", "global", "global"],
])(
  "migra intersección por rol sin ampliar acceso: costos=%s utilidad=%s resultado=%s",
  async (cost, profit, expected) => {
    const user = await environment.seedUser({ permissions: [] });
    const id = await role([
      grant("sales.read"),
      grant("providers.personal"),
      ...(cost ? [grant("sales.costs", cost)] : []),
      ...(profit ? [grant("sales.profit", profit)] : []),
    ]);
    await assign(user, [id]);
    await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
    await expect(assertAuthSchema(environment.db)).rejects.toThrow("migración manual");
    await migration.up(environment.db);
    await assertAuthSchema(environment.db);
    const permissions = await environment
      .db("dmmarket_auth_role_permissions")
      .where("role_id", id)
      .select("capability", "scope");
    expect(permissions).toEqual(expect.arrayContaining([grant("sales.read")]));
    expect(
      permissions.some((row) => ["sales.costs", "sales.profit", "providers.personal"].includes(row.capability)),
    ).toBe(false);
    expect(permissions.filter((row) => row.capability === "sales.financial")).toEqual(
      expected ? [grant("sales.financial", expected)] : [],
    );
    const access = await accessFor(environment.db, user.id);
    expect(access.canRecord("sales.financial", "A")).toBe(Boolean(expected));
    expect(access.canRecord("sales.financial", "B")).toBe(expected === "global");
    const events = await environment
      .db("dmmarket_auth_events")
      .where({ target_role_id: id, action: "auth.catalog_migrated" });
    expect(events).toHaveLength(1);
    expect(events[0].actor_id).toBeNull();
    const version = (await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version;
    await migration.up(environment.db);
    expect((await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version).toBe(version);
    expect(
      await environment.db("dmmarket_auth_events").where({ target_role_id: id, action: "auth.catalog_migrated" }),
    ).toHaveLength(1);
  },
);

test.each([
  ["global", "global"],
  ["assigned", "global"],
  ["global", "assigned"],
])("roles separados %s/%s requieren revisión y dejan todo intacto", async (cost, profit) => {
  const user = await environment.seedUser({ permissions: [] });
  const first = await role([grant("sales.costs", cost)]),
    second = await role([grant("sales.profit", profit)]);
  const other = await environment.seedUser({
    permissions: [grant("sales.costs"), grant("sales.profit"), grant("providers.personal")],
  });
  await assign(user, [first, second]);
  const before = await environment.db("dmmarket_auth_role_permissions").orderBy("role_id").orderBy("capability");
  const versions = await environment
    .db("dmmarket_auth_users")
    .whereIn("id", [user.id, other.id])
    .select("id", "session_version")
    .orderBy("id");
  await expect(migration.up(environment.db)).rejects.toThrow("Revisión manual requerida");
  expect(await environment.db("dmmarket_auth_role_permissions").orderBy("role_id").orderBy("capability")).toEqual(
    before,
  );
  expect(
    await environment
      .db("dmmarket_auth_users")
      .whereIn("id", [user.id, other.id])
      .select("id", "session_version")
      .orderBy("id"),
  ).toEqual(versions);
  expect(await environment.db("dmmarket_auth_events").whereIn("target_role_id", [first, second])).toHaveLength(0);
});

test("detecta reducción global a asignado por combinaciones aunque cada rol tenga conversión local", async () => {
  const user = await environment.seedUser({ permissions: [] });
  await assign(user, [
    await role([grant("sales.costs", "assigned"), grant("sales.profit", "assigned")]),
    await role([grant("sales.costs")]),
    await role([grant("sales.profit")]),
  ]);
  await expect(migration.up(environment.db)).rejects.toThrow("Revisión manual requerida");
});

test("roles combinados equivalentes conservan alcance sin dar finanzas al rol incompleto compartido", async () => {
  const full = await environment.seedUser({ permissions: [] }),
    partial = await environment.seedUser({ permissions: [] });
  const cost = await role([grant("sales.costs")]),
    profit = await role([grant("sales.profit")]),
    complete = await role([grant("sales.costs"), grant("sales.profit")]);
  await assign(full, [cost, profit, complete]);
  await assign(partial, [cost]);
  await migration.up(environment.db);
  expect((await accessFor(environment.db, full.id)).hasGlobal("sales.financial")).toBe(true);
  expect((await accessFor(environment.db, partial.id)).hasGlobal("sales.financial")).toBe(false);
  expect(await environment.db("dmmarket_auth_role_permissions").where("role_id", cost)).toHaveLength(0);
});

test("revoca sesiones reales y permite volver a iniciar sin bloquear la cuenta", async () => {
  const user = await environment.seedUser({ permissions: [] });
  const sessions = await createSessionService({
    db: environment.db,
    mfa: environment.mfa,
    attempts: createAttemptLimiter({ db: environment.db, secret: randomBytes(32).toString("base64") }),
  });
  const sid = randomBytes(24).toString("base64url");
  expect((await sessions.login({ sid, username: user.username, password: user.password }, "127.0.0.1")).stage).toBe(
    "ready",
  );
  await assign(user, [await role([grant("sales.read"), grant("sales.costs"), grant("sales.profit")])]);
  await migration.up(environment.db);
  await expect(sessions.status(sid)).rejects.toMatchObject({ status: 401 });
  const newSid = randomBytes(24).toString("base64url");
  expect(
    (await sessions.login({ sid: newSid, username: user.username, password: user.password }, "127.0.0.1")).stage,
  ).toBe("ready");
  expect((await accessFor(environment.db, user.id)).hasGlobal("sales.financial")).toBe(true);
});

test("permiso financiero existente se conserva y no hay auditoría ni revocación en catálogo nuevo", async () => {
  const user = await environment.seedUser({ permissions: [grant("sales.financial")] });
  await migration.up(environment.db);
  expect((await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version).toBe(1);
  expect((await accessFor(environment.db, user.id)).hasGlobal("sales.financial")).toBe(true);
});

test("alcance inválido de permiso retirado aborta antes de modificar grants", async () => {
  const id = await role([grant("providers.personal", "assigned")]);
  await expect(migration.up(environment.db)).rejects.toThrow("alcances inválidos");
  expect(await environment.db("dmmarket_auth_role_permissions").where("role_id", id).first()).toMatchObject(
    grant("providers.personal", "assigned"),
  );
});

test("permisos asignados sin vínculos no ganan acceso y conservan semántica al vincular", async () => {
  const user = await environment.seedUser({
    permissions: [grant("sales.costs", "assigned"), grant("sales.profit", "assigned")],
  });
  await migration.up(environment.db);
  expect((await accessFor(environment.db, user.id)).canRecord("sales.financial", "A")).toBe(false);
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  expect((await accessFor(environment.db, user.id)).canRecord("sales.financial", "A")).toBe(true);
  expect((await accessFor(environment.db, user.id)).canRecord("sales.financial", "a")).toBe(false);
});

test("migra roles sin usuarios y conserva permisos financieros nuevos ya aprobados", async () => {
  const id = await role([grant("sales.financial", "assigned"), grant("sales.costs"), grant("providers.personal")]);
  await migration.up(environment.db);
  expect(
    await environment.db("dmmarket_auth_role_permissions").where("role_id", id).select("capability", "scope"),
  ).toEqual([grant("sales.financial", "assigned")]);
});

test("un fallo SQL de auditoría revierte permisos y versiones de cuenta en la transacción real", async () => {
  const user = await environment.seedUser({ permissions: [grant("sales.costs"), grant("sales.profit")] });
  const before = await environment.db("dmmarket_auth_role_permissions").orderBy("role_id").orderBy("capability");
  await environment.db.schema.alterTable("dmmarket_auth_events", (table) => table.dropColumn("target_role_id"));
  try {
    await expect(migration.up(environment.db)).rejects.toThrow();
    expect(await environment.db("dmmarket_auth_role_permissions").orderBy("role_id").orderBy("capability")).toEqual(
      before,
    );
    expect((await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version).toBe(1);
  } finally {
    await backend("./migrations/20261025_add_auth_event_role").up(environment.db);
  }
});
