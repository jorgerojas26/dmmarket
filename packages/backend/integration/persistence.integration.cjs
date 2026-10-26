const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { createSessionService } = backend("./auth/sessions");
const { createAttemptLimiter } = backend("./auth/attempts");
const { createAccountService } = backend("./auth/accounts");
const { createSessionStore } = backend("./auth/mysql-store");
const mysql = backend("mysql2/promise");
const migration = backend("./migrations/20261024_add_auth_access");
const { IDLE_SESSION_MS, ABSOLUTE_SESSION_MS, RECENT_AUTH_MS } = backend("./auth/http-security");
const ownerPermissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));
let environment;
let clock;
let sessions;
let accounts;
const sid = () => randomBytes(24).toString("base64url");
const source = "127.0.0.1";
const login = async (user) => {
  const id = sid();
  const result = await sessions.login({ sid: id, username: user.username, password: user.password }, source);
  return { sid: id, ...result };
};

beforeAll(async () => {
  environment = await startEnvironment();
});
afterAll(async () => {
  await environment?.close();
});
beforeEach(async () => {
  clock = Date.now();
  const attempts = createAttemptLimiter({
    db: environment.db,
    secret: randomBytes(32).toString("base64"),
    now: () => clock,
  });
  sessions = await createSessionService({ db: environment.db, mfa: environment.mfa, attempts, now: () => clock });
  accounts = await createAccountService({ db: environment.db, sessions, now: () => clock });
});

test("MySQL de Compose persiste todas las tablas propias en InnoDB/utf8_bin", async () => {
  await migration.up(environment.db);
  const rows = await environment
    .db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .select("ENGINE", "TABLE_COLLATION");
  expect(rows).toHaveLength(migration.tables.length);
  expect(rows.every((row) => String(row.ENGINE) === "InnoDB" && String(row.TABLE_COLLATION) === "utf8_bin")).toBe(true);
});

test("un guardado tardío del store no resucita una sesión revocada", async () => {
  const user = await environment.seedUser();
  const active = await login(user);
  const configuration = environment.configuration;
  const connection = await mysql.createConnection({
    host: configuration.DATABASE_HOST,
    port: Number(configuration.DATABASE_PORT),
    user: configuration.DATABASE_USER,
    password: configuration.DATABASE_PASSWORD,
    database: configuration.DATABASE_NAME,
  });
  const store = createSessionStore(connection);
  try {
    await store.onReady();
    const data = { cookie: { expires: new Date(Date.now() + 60000) }, authenticated: true };
    await store.set(active.sid, data);
    await sessions.logout(active.sid);
    await store.destroy(active.sid);
    await store.set(active.sid, data);
    expect(await store.get(active.sid)).not.toBeNull();
    await expect(sessions.status(active.sid)).rejects.toMatchObject({ status: 401 });
  } finally {
    await store.close();
    await connection.end();
  }
});

test("revalida versión de cuenta y bloqueo en la siguiente petición", async () => {
  const user = await environment.seedUser();
  const first = await login(user);
  await environment.db("dmmarket_auth_users").where("id", user.id).increment("session_version", 1);
  await expect(sessions.status(first.sid)).rejects.toMatchObject({ status: 401 });
  const second = await login(user);
  await environment.db("dmmarket_auth_users").where("id", user.id).update({ enabled: false });
  await expect(sessions.withSession(second.sid)).rejects.toMatchObject({ status: 401 });
});

test("credencial temporal es de un solo uso y no permite operaciones pendientes", async () => {
  const user = await environment.seedUser({ temporary: true });
  const pending = await login(user);
  expect(pending.stage).toBe("password");
  await expect(sessions.withSession(pending.sid)).rejects.toMatchObject({ status: 403 });
  await expect(login(user)).rejects.toMatchObject({ status: 401 });
  const newSid = sid();
  await sessions.changePassword(
    pending.sid,
    { currentPassword: user.password, newPassword: "Integration permanent password 2026!", newSid },
    source,
  );
  await expect(sessions.status(pending.sid)).rejects.toMatchObject({ status: 401 });
  expect((await sessions.status(newSid)).stage).toBe("ready");
});

test("un reporte lento no bloquea la consulta de sesión y la revocación se observa al terminar", async () => {
  const user = await environment.seedUser();
  const active = await login(user);
  let release;
  let entered;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const report = sessions.withSession(active.sid, {}, async () => {
    entered();
    await blocked;
  });
  let status;
  let timer;
  try {
    await started;
    status = sessions.status(active.sid);
    const result = await Promise.race([
      status,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 1000);
      }),
    ]);
    expect(result?.stage).toBe("ready");
  } finally {
    clearTimeout(timer);
    release();
    await Promise.all([report, status]);
  }
  await sessions.logout(active.sid);
  await expect(sessions.status(active.sid)).rejects.toMatchObject({ status: 401 });
});

test("reportes de una sesión leen en paralelo y logout espera a que termine el reporte activo", async () => {
  const user = await environment.seedUser();
  const active = await login(user);
  let release;
  let entered;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const report = sessions.withSession(active.sid, {}, async () => {
    entered();
    await blocked;
  });
  let second;
  let logout;
  let timer;
  try {
    await started;
    second = sessions.withSession(
      active.sid,
      {},
      async ({ transaction }) => (await transaction.raw("SELECT 1 AS ready"))[0][0].ready,
    );
    const result = await Promise.race([
      second,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 1000);
      }),
    ]);
    expect(result).toBe(1);
    let revoked = false;
    logout = sessions.logout(active.sid).then(() => {
      revoked = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(revoked).toBe(false);
  } finally {
    clearTimeout(timer);
    release();
    await Promise.all([report, second, logout]);
  }
  await expect(sessions.status(active.sid)).rejects.toMatchObject({ status: 401 });
});

test("dos conexiones no pueden consumir el mismo paso MFA", async () => {
  const user = await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  const one = await login(user);
  const two = await login(user);
  expect(one.stage).toBe("mfa");
  const token = await environment.token(user.secret);
  const result = await Promise.allSettled([
    sessions.verifyMfa(one.sid, token, source),
    sessions.verifyMfa(two.sid, token, source),
  ]);
  expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(1);
  expect(result.filter((value) => value.status === "rejected" && value.reason.status === 401)).toHaveLength(1);
});

test("polling no renueva inactividad y se respetan límites absoluto y reciente", async () => {
  const user = await environment.seedUser();
  const active = await login(user);
  const hash = createHash("sha256").update(active.sid).digest("hex");
  const before = await environment.db("dmmarket_auth_session_state").where("sid_hash", hash).first();
  clock += 1000;
  await sessions.status(active.sid);
  expect(
    String((await environment.db("dmmarket_auth_session_state").where("sid_hash", hash).first()).activity_ms),
  ).toBe(String(before.activity_ms));
  clock = Number(before.activity_ms) + IDLE_SESSION_MS;
  await expect(sessions.status(active.sid)).rejects.toMatchObject({ status: 401 });
  const recent = await login(user);
  clock += RECENT_AUTH_MS;
  await expect(sessions.withSession(recent.sid, { recent: true })).rejects.toMatchObject({ status: 403 });
  const absolute = await login(user);
  const began = clock;
  for (let elapsed = 600000; elapsed < ABSOLUTE_SESSION_MS; elapsed += 600000) {
    clock = began + elapsed;
    await sessions.withSession(absolute.sid, { activity: true });
  }
  clock = began + ABSOLUTE_SESSION_MS;
  await expect(sessions.status(absolute.sid)).rejects.toMatchObject({ status: 401 });
});

test.each([
  [RECENT_AUTH_MS, { recent: true }, 403],
  [IDLE_SESSION_MS, {}, 401],
])("revierte escritura si caduca durante el callback (%i ms)", async (elapsed, options, status) => {
  const user = await environment.seedUser();
  const active = await login(user);
  const event = randomUUID();
  await expect(
    sessions.withSession(active.sid, options, async ({ transaction }) => {
      await transaction("dmmarket_auth_events").insert({
        id: event,
        actor_id: user.id,
        action: "integration.rollback",
        outcome: "success",
        occurred_ms: clock,
      });
      clock += elapsed;
    }),
  ).rejects.toMatchObject({ status });
  expect(await environment.db("dmmarket_auth_events").where("id", event).first()).toBeUndefined();
});

test("un fallo de auditoría revierte la revocación", async () => {
  const user = await environment.seedUser();
  const active = await login(user);
  await environment.db.schema.renameTable("dmmarket_auth_events", "unavailable_events");
  try {
    await expect(sessions.logout(active.sid)).rejects.toBeDefined();
  } finally {
    await environment.db.schema.renameTable("unavailable_events", "dmmarket_auth_events");
  }
  expect((await sessions.status(active.sid)).stage).toBe("ready");
});

test("cuotas persistentes se comparten entre instancias y no bloquean logout", async () => {
  const user = await environment.seedUser();
  const active = await login(user);
  const secret = randomBytes(32).toString("base64");
  const one = createAttemptLimiter({ db: environment.db, secret });
  const two = createAttemptLimiter({ db: environment.db, secret });
  const results = await Promise.allSettled(
    Array.from({ length: 15 }, (_, index) =>
      (index % 2 ? one : two).consume({ source, account: `user:${user.id}`, targetUserId: user.id }),
    ),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
  expect(results.filter((result) => result.status === "rejected" && result.reason.status === 429)).toHaveLength(5);
  await sessions.logout(active.sid);
  await expect(sessions.status(active.sid)).rejects.toMatchObject({ status: 401 });
});

test("bloqueos cruzados concurrentes dejan un administrador habilitado", async () => {
  await environment.db("dmmarket_auth_users").update({ enabled: false });
  const admins = await Promise.all([
    environment.seedUser({ permissions: ownerPermissions, enrolled: true }),
    environment.seedUser({ permissions: ownerPermissions, enrolled: true }),
  ]);
  const active = await Promise.all(admins.map(login));
  for (let index = 0; index < 2; index++)
    await sessions.verifyMfa(active[index].sid, await environment.token(admins[index].secret), source);
  const result = await Promise.allSettled([
    accounts.setEnabled(active[0].sid, admins[1].id, false, "Integration cross-disable"),
    accounts.setEnabled(active[1].sid, admins[0].id, false, "Integration cross-disable"),
  ]);
  expect(result.filter((value) => value.status === "fulfilled")).toHaveLength(1);
  expect(
    await environment
      .db("dmmarket_auth_users")
      .whereIn(
        "id",
        admins.map((admin) => admin.id),
      )
      .where("enabled", true),
  ).toHaveLength(1);
});

test("permisos cargados desde SQL conservan alcances por capacidad", async () => {
  const user = await environment.seedUser({
    permissions: [
      { capability: "sales.read", scope: "global" },
      { capability: "sales.financial", scope: "assigned" },
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const active = await login(user);
  await sessions.withSession(active.sid, {}, async ({ access }) => {
    expect(access.canRecord("sales.read", "B")).toBe(true);
    expect(access.canRecord("sales.financial", "A")).toBe(true);
    expect(access.canRecord("sales.financial", "B")).toBe(false);
    expect(access.covers("sales.financial", ["A", "B"])).toBe(false);
  });
});

test("no inicia acceso si falta una tabla y el rollback no borra identidades", async () => {
  await environment.db.schema.renameTable("dmmarket_auth_events", "unavailable_events");
  try {
    const attempts = createAttemptLimiter({ db: environment.db, secret: randomBytes(32).toString("base64") });
    await expect(createSessionService({ db: environment.db, mfa: environment.mfa, attempts })).rejects.toThrow(
      "esquema de autenticación",
    );
  } finally {
    await environment.db.schema.renameTable("unavailable_events", "dmmarket_auth_events");
  }
  await expect(migration.down(environment.db)).rejects.toThrow("No se elimina autenticación");
});
