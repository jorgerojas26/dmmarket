const { randomUUID } = require("node:crypto");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
let environment;
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
});
afterAll(async () => environment?.close());

test("el detalle obtiene una cuenta por ID sin exponer credenciales ni depender de la página del directorio", async () => {
  const owner = await environment.seedUser({ permissions: [{ capability: "access.users.read" }] });
  const target = await environment.seedUser({ permissions: [] });
  await environment.db("dmmarket_auth_users").where("id", target.id).update({ enabled: false });
  const client = environment.client();
  await client.login(owner);
  const result = await client.request(`/api/auth/users/${target.id}`);
  expect(result.status).toBe(200);
  expect(Object.keys(result.body).sort()).toEqual([
    "display_name",
    "enabled",
    "id",
    "mfa_enabled",
    "mfa_required",
    "must_change_password",
    "temporary_expires_ms",
    "username",
  ]);
  expect(result.body).toMatchObject({ id: target.id, username: target.username, enabled: 0 });
  expect((await client.request(`/api/auth/users/${randomUUID()}`)).status).toBe(404);
  expect((await client.request("/api/auth/users/not-an-id")).status).toBe(400);
});

test("los permisos del directorio se conservan para administradores parciales", async () => {
  const target = await environment.seedUser({ permissions: [] });
  for (const capability of ["access.roles.read", "access.profile.read", "access.recovery.read"]) {
    const user = await environment.seedUser({ permissions: [{ capability }] });
    const client = environment.client();
    await client.login(user);
    expect((await client.request(`/api/auth/users/${target.id}`)).status).toBe(200);
  }
});

test("un lector de negocio no puede consultar cuentas por ID", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "settings.rates.read" }] });
  const client = environment.client();
  await client.login(user);
  expect((await client.request(`/api/auth/users/${user.id}`)).status).toBe(403);
  expect((await environment.client().request(`/api/auth/users/${user.id}`)).status).toBe(401);
});
