const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
let environment;
let admin;
let owner;
const grant = (capability) => ({ capability });
const endpoint = (id) => `/api/auth/users/${id}/permissions`;
const update = (id, permissions) =>
  admin.request(endpoint(id), { method: "PUT", body: { permissions: permissions.map(grant) } });
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  owner = await environment.seedUser({
    permissions: Object.keys(backend("./auth/capabilities").CAPABILITIES).map(grant),
    enrolled: true,
  });
  admin = environment.client();
  await admin.login(owner);
  expect(
    (await admin.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(owner.secret) } }))
      .status,
  ).toBe(200);
});
afterAll(async () => environment?.close());

test("los permisos individuales se suman, no modifican roles y se auditan sin motivo", async () => {
  const user = await environment.seedUser({ permissions: [grant("inventory.stock.read")] });
  const client = environment.client();
  await client.login(user);
  const role = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id).first();
  const before = await environment.db("dmmarket_auth_role_capabilities").where("role_id", role.role_id);
  expect((await update(user.id, ["settings.rates.read"])).status).toBe(200);
  expect((await client.request("/api/auth/session")).body.stage).toBe("anonymous");
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).toEqual(
    expect.arrayContaining([grant("inventory.stock.read"), grant("settings.rates.read")]),
  );
  const assigned = await admin.request(endpoint(user.id));
  expect(assigned.body).toMatchObject({
    permissions: [grant("settings.rates.read")],
    inherited: [grant("inventory.stock.read")],
  });
  expect(await environment.db("dmmarket_auth_role_capabilities").where("role_id", role.role_id)).toEqual(before);
  const event = await environment
    .db("dmmarket_auth_events")
    .where({ target_user_id: user.id, action: "auth.user_permissions_changed" })
    .first();
  expect(event.actor_id).toBe(owner.id);
  expect(event.reason).toBeNull();
  expect(JSON.parse(event.details)).toEqual({ added: ["settings.rates.read"], removed: [] });
  const date = new Date().toISOString().slice(0, 10);
  const audit = await admin.request(
    `/api/auth/audit?from=${date}&to=${date}&targetId=${user.id}&action=auth.user_permissions_changed`,
  );
  expect(audit.body.data[0].details).toEqual({ added: ["settings.rates.read"], removed: [] });
  const version = (await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version;
  expect((await update(user.id, ["settings.rates.read", "settings.rates.read"])).status).toBe(200);
  expect((await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version).toBe(version);
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ target_user_id: user.id, action: "auth.user_permissions_changed" }),
  ).toHaveLength(1);
  expect((await update(user.id, [])).status).toBe(200);
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).toEqual([grant("inventory.stock.read")]);
  const events = await environment
    .db("dmmarket_auth_events")
    .where({ target_user_id: user.id, action: "auth.user_permissions_changed" });
  expect(events.some((event) => JSON.parse(event.details).removed.includes("settings.rates.read"))).toBe(true);
});

test("retirar una concesión individual no niega lo heredado y los roles siguen propagándose", async () => {
  const user = await environment.seedUser({ permissions: [grant("inventory.stock.read")] });
  expect((await update(user.id, ["inventory.stock.read", "settings.rates.read"])).status).toBe(200);
  const assignment = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id).first();
  const role = await environment.db("dmmarket_auth_roles").where("id", assignment.role_id).first();
  expect(
    (
      await admin.request(`/api/auth/roles/${role.id}`, {
        method: "PUT",
        body: { name: role.name, permissions: [grant("purchases.dashboard.read")] },
      })
    ).status,
  ).toBe(200);
  expect((await update(user.id, ["settings.rates.read"])).status).toBe(200);
  const client = environment.client();
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).toEqual(
    expect.arrayContaining([grant("purchases.dashboard.read"), grant("settings.rates.read")]),
  );
  expect(
    (await admin.request(`/api/auth/users/${user.id}/roles`, { method: "PUT", body: { roleIds: [] } })).status,
  ).toBe(200);
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).toEqual([grant("settings.rates.read")]);
});

test("las concesiones respetan dependencias, perfil comercial y visibilidad propia", async () => {
  const user = await environment.seedUser({ permissions: [] });
  expect((await update(user.id, ["sales.breakdown.read"])).status).toBe(400);
  expect((await update(user.id, ["sales.breakdown.read", "sales.others.read"])).status).toBe(200);
  expect(
    (await admin.request(`/api/auth/users/${user.id}/roles`, { method: "PUT", body: { roleIds: [] } })).status,
  ).toBe(200);
  expect((await update(user.id, [])).status).toBe(200);
  await environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: user.id, seller_id: "A" });
  expect((await update(user.id, ["sales.breakdown.read"])).status).toBe(200);
  const client = environment.client();
  await client.login(user);
  const sales = await client.request("/api/sales/facturas?from=2026-01-01&to=2026-01-31&showNoe=false");
  expect(sales.status).toBe(200);
  expect(sales.body.data.map((row) => String(row.idFactura || row.invoiceId || row.id))).toEqual(["1"]);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/commercial-profile`, {
        method: "PUT",
        body: { sellerId: null, reason: "Prueba de identidad" },
      })
    ).status,
  ).toBe(409);
  expect((await update(user.id, ["clients.receivables.payment"])).status).toBe(200);
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).not.toContainEqual(
    grant("clients.receivables.payment"),
  );
});

test("no se puede quitar un rol global si deja permisos individuales propios sin perfil", async () => {
  const user = await environment.seedUser({ permissions: [grant("sales.others.read")] });
  expect((await update(user.id, ["sales.breakdown.read"])).status).toBe(200);
  expect(
    (await admin.request(`/api/auth/users/${user.id}/roles`, { method: "PUT", body: { roleIds: [] } })).status,
  ).toBe(400);
});

test("solo administradores autorizados modifican permisos y las entradas inválidas no alteran el estado", async () => {
  const user = await environment.seedUser({ permissions: [grant("settings.rates.read")] });
  const client = environment.client();
  await client.login(user);
  expect((await client.request(endpoint(user.id))).status).toBe(403);
  expect(
    (await client.request(endpoint(user.id), { method: "PUT", body: { permissions: [grant("access.roles.assign")] } }))
      .status,
  ).toBe(403);
  for (const permissions of [
    [{ capability: "not.real" }],
    [{ capability: "settings.rates.read", scope: "global" }],
    null,
  ])
    expect((await admin.request(endpoint(user.id), { method: "PUT", body: { permissions } })).status).toBe(400);
  expect((await update(randomUUID(), [])).status).toBe(404);
  const reader = await environment.seedUser({ permissions: [grant("access.roles.read")] });
  const readClient = environment.client();
  await readClient.login(reader);
  expect((await readClient.request(endpoint(user.id))).status).toBe(200);
  expect((await readClient.request(endpoint(user.id), { method: "PUT", body: { permissions: [] } })).status).toBe(403);
});

test("la protección del último administrador considera también permisos individuales", async () => {
  const capabilities = [
    "access.users.read",
    "access.users.update",
    "access.roles.read",
    "access.roles.update",
    "access.roles.assign",
    "access.profile.read",
    "access.profile.update",
    "access.recovery.read",
    "access.recovery.execute",
  ];
  const user = await environment.seedUser({ permissions: [] });
  expect((await update(user.id, capabilities)).status).toBe(200);
  await environment.db
    .transaction(async (connection) => {
      await connection("dmmarket_auth_users").whereNot("id", user.id).update({ enabled: false });
      await backend("./auth/identity").assertAdministratorRemains(connection);
      throw Object.assign(new Error("rollback"), { expected: true });
    })
    .catch((error) => {
      if (!error.expected) throw error;
    });
});

test("la migración es autocontenida, idempotente y no asigna permisos a nadie", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-user-permissions-"));
  try {
    const filename = path.join(directory, "migration.cjs");
    fs.copyFileSync(path.join(__dirname, "../migrations/20261107_individual_permissions.js"), filename);
    const migration = require(filename);
    expect(migration.config.scope).toBe("dmmarket");
    const before = await environment.db("dmmarket_auth_user_capabilities").orderBy(["user_id", "capability"]);
    const users = await environment.db("dmmarket_auth_users").orderBy("id");
    await migration.up(environment.db);
    await migration.up(environment.db);
    expect(await environment.db("dmmarket_auth_user_capabilities").orderBy(["user_id", "capability"])).toEqual(before);
    expect(await environment.db("dmmarket_auth_users").orderBy("id")).toEqual(users);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
