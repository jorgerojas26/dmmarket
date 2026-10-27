const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { appendEvent } = require("../auth/identity");
let environment;
let actor;
let target;
let roleId;
const range = "from=2026-01-01&to=2026-01-31";
const grant = (capability) => ({ capability, scope: "global" });
async function reader(permissions) {
  const user = await environment.seedUser({ permissions });
  const client = environment.client();
  await client.login(user);
  return { client, user };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  actor = await environment.seedUser();
  target = await environment.seedUser();
  await environment.db("dmmarket_auth_users").where("id", actor.id).update({ display_name: "Ana Pérez" });
  await environment.db("dmmarket_auth_users").where("id", target.id).update({ display_name: "Carlos Díaz" });
  roleId = (await environment.db("dmmarket_auth_user_roles").where("user_id", actor.id).first()).role_id;
  await environment.db("dmmarket_auth_roles").where("id", roleId).update({ name: "Equipo de ventas" });
  await appendEvent(environment.db, {
    actorId: actor.id,
    targetId: target.id,
    targetRoleId: roleId,
    action: "auth.role_changed",
    reason: "Cambio sintético A",
    occurredMs: Date.parse("2026-01-05T12:00:00Z"),
  });
  await appendEvent(environment.db, {
    actorId: actor.id,
    targetId: target.id,
    action: "auth.user_disabled",
    reason: "Bloqueo sintético B",
    occurredMs: Date.parse("2026-01-06T23:59:59Z"),
  });
  await appendEvent(environment.db, {
    targetId: target.id,
    action: "auth.login_failed",
    outcome: "failure",
    reason: "Control 50%_ verificado",
    occurredMs: Date.parse("2026-01-31T23:59:59.999Z"),
  });
  await appendEvent(environment.db, {
    actorId: actor.id,
    targetId: target.id,
    action: "auth.role_changed",
    occurredMs: Date.parse("2026-02-01T00:00:00Z"),
  });
});
afterAll(async () => {
  await environment?.close();
});

test("auditoría no se infiere desde administración o lectura financiera", async () => {
  for (const capability of ["access.users", "access.roles", "access.recover", "sales.read", "purchases.read"]) {
    const { client } = await reader([grant(capability)]);
    expect((await client.request(`/api/auth/audit?${range}`)).status).toBe(403);
  }
});

test("rango inclusivo, orden estable y páginas conservan el total filtrado", async () => {
  const { client } = await reader([grant("audit.read")]);
  const first = await client.request(`/api/auth/audit?${range}&limit=1`);
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ total: 3, page: 1, limit: 1 });
  expect(first.body.data[0]).toMatchObject({
    actorId: null,
    targetId: target.id,
    action: "auth.login_failed",
    outcome: "failure",
  });
  const second = await client.request(`/api/auth/audit?${range}&limit=1&page=2`);
  expect(second.body.total).toBe(3);
  expect(second.body.data[0].action).toBe("auth.user_disabled");
  expect(Object.keys(second.body.data[0]).sort()).toEqual(
    [
      "action",
      "actorId",
      "actorName",
      "actorUsername",
      "id",
      "occurredMs",
      "outcome",
      "reason",
      "roleId",
      "roleName",
      "targetId",
      "targetName",
      "targetUsername",
    ].sort(),
  );
});

test("filtros por actor, objetivo, rol y resultado preceden conteo y paginación", async () => {
  const { client } = await reader([grant("audit.read")]);
  const role = await client.request(
    `/api/auth/audit?${range}&actorId=${actor.id}&targetId=${target.id}&roleId=${roleId}&action=auth.role_changed&outcome=success&limit=1`,
  );
  expect(role.body.total).toBe(1);
  expect(role.body.data[0].reason).toBe("Cambio sintético A");
  const failure = await client.request(`/api/auth/audit?${range}&outcome=failure`);
  expect(failure.body.total).toBe(1);
  expect(failure.body.data[0].action).toBe("auth.login_failed");
});

test("el historial de login real no entrega contraseñas, hashes o secretos de sesión", async () => {
  const { client, user } = await reader([grant("audit.read")]);
  const today = new Date().toISOString().slice(0, 10);
  const result = await client.request(
    `/api/auth/audit?from=${today}&to=${today}&targetId=${user.id}&action=auth.login_succeeded`,
  );
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(1);
  expect(JSON.stringify(result.body)).not.toContain(user.password);
  expect(JSON.stringify(result.body)).not.toContain(user.passwordHash);
  expect(JSON.stringify(result.body)).not.toMatch(/csrfToken|mfa_secret|sid_hash/);
  expect((await client.request("/api/auth/users")).status).toBe(403);
});

test("el lector de auditoría obtiene nombres actuales sin permisos de administración", async () => {
  const { client } = await reader([grant("audit.read")]);
  const result = await client.request(`/api/auth/audit?${range}&roleId=${roleId}`);
  expect(result.status).toBe(200);
  expect(result.body.data[0]).toMatchObject({
    actorId: actor.id,
    actorName: "Ana Pérez",
    actorUsername: actor.username,
    targetId: target.id,
    targetName: "Carlos Díaz",
    targetUsername: target.username,
    roleId,
    roleName: "Equipo de ventas",
  });
  expect((await client.request("/api/auth/directory")).status).toBe(403);
  expect((await client.request("/api/auth/roles")).status).toBe(403);
});

test("buscar nombres, usuarios, roles o motivos filtra antes del conteo y trata comodines literalmente", async () => {
  const { client } = await reader([grant("audit.read")]);
  for (const [search, total] of [
    ["ANA PÉREZ", 2],
    [target.username, 3],
    ["Equipo de ventas", 1],
    ["50%_", 1],
    ["no-existe", 0],
  ]) {
    const result = await client.request(`/api/auth/audit?${range}&search=${encodeURIComponent(search)}&limit=1`);
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(total);
    expect(result.body.data).toHaveLength(Math.min(1, total));
  }
  const combined = await client.request(`/api/auth/audit?${range}&search=Ana&outcome=failure`);
  expect(combined.body.total).toBe(0);
  const fallback = await client.request(`/api/auth/audit?${range}&outcome=failure`);
  expect(fallback.body.data[0]).toMatchObject({ actorId: null, actorName: null, roleName: null });
});

test("filtros y parámetros inválidos no abren búsquedas libres ni exportaciones", async () => {
  const { client } = await reader([grant("audit.read")]);
  for (const suffix of [
    "limit=101",
    "page=0",
    "actorId=invalid",
    "targetId[]=a",
    "roleId=abc",
    "action=auth.%25",
    "outcome=any",
    `search=${"a".repeat(129)}`,
    "search[]=name",
    "export=true",
    "sortBy=reason",
  ])
    expect((await client.request(`/api/auth/audit?${range}&${suffix}`)).status).toBe(400);
  expect((await client.request("/api/auth/audit")).status).toBe(400);
  expect(
    (await client.request(`/api/auth/audit?${range}`, { method: "POST", body: { reason: "Alterar evento" } })).status,
  ).toBe(403);
  expect(await environment.db("dmmarket_auth_events").where("reason", "Alterar evento").first()).toBeUndefined();
});
