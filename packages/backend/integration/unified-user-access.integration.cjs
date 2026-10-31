const { randomUUID } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
let environment;
let admin;
let owner;
const grant = (capability) => ({ capability });
const url = (id) => `/api/auth/users/${id}/access`;
const save = (id, roleIds, capabilities) =>
  admin.request(url(id), { method: "PUT", body: { roleIds, permissions: capabilities.map(grant) } });
async function role(name, capabilities) {
  const id = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id, name: `${name} ${id}` });
  if (capabilities.length)
    await environment
      .db("dmmarket_auth_role_capabilities")
      .insert(capabilities.map((capability) => ({ role_id: id, capability })));
  return id;
}
async function snapshot(id) {
  return {
    user: await environment.db("dmmarket_auth_users").where("id", id).first(),
    roles: await environment.db("dmmarket_auth_user_roles").where("user_id", id).orderBy("role_id"),
    permissions: await environment.db("dmmarket_auth_user_capabilities").where("user_id", id).orderBy("capability"),
    events: await environment.db("dmmarket_auth_events").where("target_user_id", id).orderBy("id"),
  };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
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

test("roles y adicionales se guardan juntos, auditan sus diferencias y revocan una sola vez", async () => {
  const user = await environment.seedUser({ permissions: [grant("inventory.stock.read")] });
  const previous = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id).first();
  const replacement = await role("Consulta de compras", ["purchases.dashboard.read"]);
  const client = environment.client();
  await client.login(user);
  const before = await snapshot(user.id);
  const saved = await save(user.id, [replacement], ["settings.rates.read"]);
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({
    id: user.id,
    roleIds: [replacement],
    permissions: [grant("settings.rates.read")],
  });
  expect(saved.body.roles.find((role) => role.id === replacement).permissions).toEqual([
    grant("purchases.dashboard.read"),
  ]);
  expect((await client.request("/api/auth/session")).body.stage).toBe("anonymous");
  const after = await snapshot(user.id);
  expect(Number(after.user.session_version)).toBe(Number(before.user.session_version) + 1);
  expect(after.roles.map((row) => row.role_id)).toEqual([replacement]);
  const event = after.events.find((row) => row.action === "auth.user_access_changed");
  expect(event.actor_id).toBe(owner.id);
  expect(event.reason).toBeNull();
  expect(JSON.parse(event.details)).toMatchObject({
    added: ["settings.rates.read"],
    removed: [],
    rolesAdded: [{ id: replacement }],
    rolesRemoved: [{ id: previous.role_id }],
  });
  expect(after.events.filter((row) => row.action === "auth.user_access_changed")).toHaveLength(1);
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).toEqual(
    expect.arrayContaining([grant("purchases.dashboard.read"), grant("settings.rates.read")]),
  );
});

test("guardar la misma configuración no revoca ni genera otro evento", async () => {
  const user = await environment.seedUser({ permissions: [grant("settings.rates.read")] });
  const assigned = await admin.request(url(user.id));
  expect(assigned.status).toBe(200);
  const before = await snapshot(user.id);
  expect((await save(user.id, [...assigned.body.roleIds, ...assigned.body.roleIds], [])).status).toBe(200);
  expect(await snapshot(user.id)).toEqual(before);
});

test("validaciones fallidas revierten roles, permisos, versiones y auditoría completos", async () => {
  const user = await environment.seedUser({ permissions: [grant("inventory.stock.read")] });
  const own = await role("Ventas propias", ["sales.breakdown.read"]);
  const before = await snapshot(user.id);
  expect((await save(user.id, [own], ["settings.rates.read"])).status).toBe(400);
  expect(await snapshot(user.id)).toEqual(before);
  expect((await save(user.id, [randomUUID()], ["settings.rates.read"])).status).toBe(400);
  expect(await snapshot(user.id)).toEqual(before);
  expect((await save(user.id, [], ["not.real"])).status).toBe(400);
  expect(await snapshot(user.id)).toEqual(before);
});

test("un fallo de auditoría revierte ambas asignaciones y conserva la sesión previa", async () => {
  const user = await environment.seedUser({ permissions: [grant("inventory.stock.read")] });
  const replacement = await role("Consulta aislada", ["settings.rates.read"]);
  const client = environment.client();
  await client.login(user);
  const before = await snapshot(user.id);
  await environment.db.schema.renameTable("dmmarket_auth_events", "unavailable_access_events");
  try {
    expect((await save(user.id, [replacement], ["purchases.dashboard.read"])).status).toBe(503);
  } finally {
    await environment.db.schema.renameTable("unavailable_access_events", "dmmarket_auth_events");
  }
  expect(await snapshot(user.id)).toEqual(before);
  expect((await client.request("/api/auth/session")).body.stage).toBe("ready");
});

test("la identidad se valida contra el resultado conjunto, no contra un estado intermedio", async () => {
  const user = await environment.seedUser({ permissions: [grant("sales.others.read")] });
  await environment
    .db("dmmarket_auth_user_capabilities")
    .insert({ user_id: user.id, capability: "sales.breakdown.read" });
  expect((await save(user.id, [], ["sales.breakdown.read", "sales.others.read"])).status).toBe(200);
});

test("la propagación se mantiene y retirar el adicional no niega lo heredado", async () => {
  const user = await environment.seedUser({ permissions: [] });
  const selected = await role("Inventario compartido", ["inventory.stock.read"]);
  expect((await save(user.id, [selected], ["inventory.stock.read"])).status).toBe(200);
  expect((await save(user.id, [selected], [])).status).toBe(200);
  const client = environment.client();
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).toContainEqual(grant("inventory.stock.read"));
  const row = await environment.db("dmmarket_auth_roles").where("id", selected).first();
  expect(
    (
      await admin.request(`/api/auth/roles/${selected}`, {
        method: "PUT",
        body: { name: row.name, permissions: [grant("purchases.dashboard.read")] },
      })
    ).status,
  ).toBe(200);
  await client.login(user);
  expect((await client.request("/api/auth/session")).body.permissions).toEqual([grant("purchases.dashboard.read")]);
});

test("la lectura no permite escritura y el último administrador no puede perder el acceso", async () => {
  const user = await environment.seedUser({ permissions: [grant("access.roles.read")] });
  const reader = environment.client();
  await reader.login(user);
  expect((await reader.request(url(user.id))).status).toBe(200);
  expect((await reader.request(url(user.id), { method: "PUT", body: { roleIds: [], permissions: [] } })).status).toBe(
    403,
  );
  const ordinary = await environment.seedUser({ permissions: [grant("settings.rates.read")] });
  const client = environment.client();
  await client.login(ordinary);
  expect((await client.request(url(user.id))).status).toBe(403);
  const before = await snapshot(owner.id);
  expect((await save(owner.id, [], [])).status).toBe(409);
  expect(await snapshot(owner.id)).toEqual(before);
});
