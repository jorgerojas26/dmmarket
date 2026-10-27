const { randomUUID } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const renameRole = backend("./migrations/20261030_rename_initial_superuser");
const ownerPermissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));
let environment;
let owner;
let admin;

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
});
afterAll(async () => {
  await environment?.close();
});
beforeEach(async () => {
  owner = await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  admin = environment.client();
  await admin.login(owner);
  expect(
    (await admin.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(owner.secret) } }))
      .status,
  ).toBe(200);
});

test("crear, editar y asignar roles no requieren motivo manual y mantienen auditoría y revocación", async () => {
  const created = await admin.request("/api/auth/roles", {
    method: "POST",
    body: { name: randomUUID(), permissions: [] },
  });
  expect(created.status).toBe(201);
  const target = await environment.seedUser();
  const reader = environment.client();
  await reader.login(target);
  expect(
    (await admin.request(`/api/auth/users/${target.id}/roles`, { method: "PUT", body: { roleIds: [created.body.id] } }))
      .status,
  ).toBe(200);
  expect((await reader.request("/api/currency_rates")).status).toBe(401);
  const renamed = `${created.body.name}-edit`;
  expect(
    (
      await admin.request(`/api/auth/roles/${created.body.id}`, {
        method: "PUT",
        body: { name: renamed, permissions: [] },
      })
    ).status,
  ).toBe(200);
  for (const action of ["auth.role_created", "auth.role_changed", "auth.user_roles_changed"]) {
    const event = await environment.db("dmmarket_auth_events").where({ actor_id: owner.id, action }).first();
    expect(event).toBeTruthy();
    expect(event.reason).toBeNull();
  }
});

test("perfil expone solo la identidad y los roles de la propia cuenta sin permiso administrativo", async () => {
  const user = await environment.seedUser();
  const role = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id).first();
  await environment.db("dmmarket_auth_roles").where("id", role.role_id).update({ name: "Consulta personal" });
  const reader = environment.client();
  await reader.login(user);
  const profile = await reader.request("/api/auth/profile");
  expect(profile.status).toBe(200);
  expect(profile.body).toEqual({ roles: [{ id: role.role_id, name: "Consulta personal" }] });
  expect((await reader.request("/api/auth/users")).status).toBe(403);
  expect((await environment.client().request("/api/auth/profile")).status).toBe(401);
});

test("no permite deshabilitar la propia cuenta incluso si existe otro administrador", async () => {
  await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  const result = await admin.request(`/api/auth/users/${owner.id}/enabled`, {
    method: "POST",
    body: { enabled: false, reason: "Deshabilitación propia no permitida" },
  });
  expect(result.status).toBe(409);
  expect(Number((await environment.db("dmmarket_auth_users").where("id", owner.id).first()).enabled)).toBe(1);
  expect((await admin.request("/api/auth/profile")).status).toBe(200);
});

test("el renombrado conserva el ID, permisos y asignaciones y es idempotente", async () => {
  const role = await environment.db("dmmarket_auth_user_roles").where("user_id", owner.id).first();
  await environment.db("dmmarket_auth_roles").where("id", role.role_id).update({ name: "Superusuario inicial" });
  const grants = await environment
    .db("dmmarket_auth_role_permissions")
    .where("role_id", role.role_id)
    .orderBy("capability");
  await renameRole.up(environment.db);
  await renameRole.up(environment.db);
  expect((await environment.db("dmmarket_auth_roles").where("id", role.role_id).first()).name).toBe("Superusuario");
  expect(
    await environment.db("dmmarket_auth_role_permissions").where("role_id", role.role_id).orderBy("capability"),
  ).toEqual(grants);
  expect(
    await environment.db("dmmarket_auth_user_roles").where({ user_id: owner.id, role_id: role.role_id }),
  ).toHaveLength(1);
  await environment.db("dmmarket_auth_roles").where("id", role.role_id).update({ name: randomUUID() });
});

test("el renombrado no fusiona roles cuando ya existe el nombre Superusuario", async () => {
  const oldId = randomUUID(),
    existingId = randomUUID();
  await environment.db("dmmarket_auth_roles").insert([
    { id: oldId, name: "Superusuario inicial" },
    { id: existingId, name: "Superusuario" },
  ]);
  await expect(renameRole.up(environment.db)).rejects.toThrow("Superusuario");
  expect((await environment.db("dmmarket_auth_roles").where("id", oldId).first()).name).toBe("Superusuario inicial");
  await environment.db("dmmarket_auth_roles").whereIn("id", [oldId, existingId]).delete();
});
