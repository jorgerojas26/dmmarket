const { randomUUID } = require("node:crypto");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const ownerPermissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));
let environment;
let owner;
let admin;
async function administrator() {
  const user = await environment.seedUser({ permissions: ownerPermissions, enrolled: true });
  const client = environment.client();
  expect((await client.login(user)).body.stage).toBe("mfa");
  expect(
    (await client.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(user.secret) } }))
      .body.stage,
  ).toBe("ready");
  return { user, client };
}
async function createRole(permissions = [{ capability: "rates.read", scope: "global" }]) {
  const result = await admin.request("/api/auth/roles", {
    method: "POST",
    body: { name: randomUUID(), permissions, reason: "Integration role creation", actorId: "forged" },
  });
  expect(result.status).toBe(201);
  return result.body;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await environment.db.schema.createTable("vendedores", (table) => {
    table.engine("InnoDB");
    table.charset("utf8");
    table.collate("utf8_bin");
    table.string("idVend", 32).primary();
  });
  await environment.db("vendedores").insert([{ idVend: "A" }, { idVend: "B" }]);
});
afterAll(async () => {
  await environment?.close();
});
beforeEach(async () => {
  await environment.db("dmmarket_auth_users").update({ enabled: false });
  const result = await administrator();
  owner = result.user;
  admin = result.client;
});

test("catálogo cerrado, permisos separados y acceso no administrativo denegado", async () => {
  const reader = environment.client();
  await reader.login(await environment.seedUser());
  expect((await reader.request("/api/auth/roles/catalog")).status).toBe(403);
  expect(
    (
      await reader.request("/api/auth/roles", {
        method: "POST",
        body: { name: "forged", permissions: [], reason: "Invalid role attempt" },
      })
    ).status,
  ).toBe(403);
  const catalog = await admin.request("/api/auth/roles/catalog");
  expect(catalog.body.data.find((entry) => entry.capability === "access.roles")).toMatchObject({
    privileged: true,
    assigned: false,
  });
  expect(catalog.body.data).toHaveLength(37);
  expect(catalog.body.data.find((row) => row.capability === "sales.financial")).toMatchObject({
    assigned: true,
    privileged: false,
  });
  expect(
    catalog.body.data.some((row) => ["sales.costs", "sales.profit", "providers.personal"].includes(row.capability)),
  ).toBe(false);
  expect(catalog.body.data.some((row) => row.capability === "commissions.read")).toBe(true);
  expect(catalog.body.data.some((row) => row.capability === "commissions.update")).toBe(true);
  for (const permission of [
    { capability: "sales.costs", scope: "global" },
    { capability: "sales.profit", scope: "global" },
    { capability: "providers.personal", scope: "global" },
    { capability: "manage.all", scope: "global" },
    { capability: "clients.read", scope: "assigned" },
  ]) {
    expect(
      (
        await admin.request("/api/auth/roles", {
          method: "POST",
          body: { name: randomUUID(), permissions: [permission], reason: "Invalid capability scope" },
        })
      ).status,
    ).toBe(400);
  }
  expect((await admin.request(`/api/auth/roles/${randomUUID()}`)).status).toBe(404);
});

test("editar rol compartido revoca a todos y audita actor y objetivo del servidor", async () => {
  const role = await createRole();
  const users = await Promise.all([environment.seedUser(), environment.seedUser()]);
  const readers = [];
  for (const user of users) {
    expect(
      (
        await admin.request(`/api/auth/users/${user.id}/roles`, {
          method: "PUT",
          body: { roleIds: [role.id], reason: "Assign shared role" },
        })
      ).status,
    ).toBe(200);
    const client = environment.client();
    await client.login(user);
    readers.push(client);
  }
  const changed = await admin.request(`/api/auth/roles/${role.id}`, {
    method: "PUT",
    body: { name: role.name, permissions: [], reason: "Remove rates capability", actorId: users[0].id },
  });
  expect(changed.status).toBe(200);
  expect(changed.body.affectedUsers).toBe(2);
  for (let index = 0; index < readers.length; index++) {
    expect((await readers[index].request("/api/currency_rates")).status).toBe(401);
    await readers[index].login(users[index]);
    expect((await readers[index].request("/api/currency_rates")).status).toBe(403);
  }
  const event = await environment
    .db("dmmarket_auth_events")
    .where({ action: "auth.role_changed", target_role_id: role.id })
    .first();
  expect(event.actor_id).toBe(owner.id);
  expect(event.reason).toBe("Remove rates capability");
});

test("cambiar roles invalida la sesión y nueva capacidad privilegiada exige enrolamiento", async () => {
  const role = await createRole([{ capability: "cache.clear", scope: "global" }]);
  const user = await environment.seedUser();
  const reader = environment.client();
  await reader.login(user);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/roles`, {
        method: "PUT",
        body: { roleIds: [role.id], reason: "Grant privileged capability" },
      })
    ).status,
  ).toBe(200);
  expect((await reader.request("/api/currency_rates")).status).toBe(401);
  expect((await reader.login(user)).body.stage).toBe("mfa-enrollment");
  expect((await reader.request("/api/currency_rates")).status).toBe(403);
});

test("vínculos verifican IDs reales y revocan sin convertir vacío en global", async () => {
  const user = await environment.seedUser();
  const reader = environment.client();
  await reader.login(user);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/sellers`, {
        method: "PUT",
        body: { sellerIds: ["not-existing"], reason: "Reject unknown seller" },
      })
    ).status,
  ).toBe(400);
  expect((await reader.request("/api/currency_rates")).status).toBe(200);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/sellers`, {
        method: "PUT",
        body: { sellerIds: ["A", "A"], reason: "Assign known seller" },
      })
    ).status,
  ).toBe(200);
  expect((await reader.request("/api/currency_rates")).status).toBe(401);
  expect((await admin.request(`/api/auth/users/${user.id}/sellers`)).body.data).toEqual(["A"]);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/sellers`, {
        method: "PUT",
        body: { sellerIds: [], reason: "Remove seller assignment" },
      })
    ).status,
  ).toBe(200);
  expect((await admin.request(`/api/auth/users/${user.id}/sellers`)).body.data).toEqual([]);
});

test("no elimina permisos ni roles del último administrador", async () => {
  const [roleId] = await environment.db("dmmarket_auth_user_roles").where("user_id", owner.id).pluck("role_id");
  const role = (await admin.request(`/api/auth/roles/${roleId}`)).body;
  expect(
    (
      await admin.request(`/api/auth/users/${owner.id}/roles`, {
        method: "PUT",
        body: { roleIds: [], reason: "Last administrator roles" },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await admin.request(`/api/auth/roles/${roleId}`, {
        method: "PUT",
        body: { name: role.name, permissions: [], reason: "Last administrator permissions" },
      })
    ).status,
  ).toBe(409);
  expect((await admin.request(`/api/auth/roles/${roleId}`)).body.permissions).toHaveLength(4);
  expect((await admin.request("/api/auth/users")).status).toBe(200);
});

test("fallo de auditoría revierte rol, vínculos y revocación juntos", async () => {
  const role = await createRole();
  const user = await environment.seedUser();
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/roles`, {
        method: "PUT",
        body: { roleIds: [role.id], reason: "Prepare atomic role" },
      })
    ).status,
  ).toBe(200);
  const reader = environment.client();
  await reader.login(user);
  await environment.db.schema.renameTable("dmmarket_auth_events", "unavailable_events");
  try {
    expect(
      (
        await admin.request(`/api/auth/roles/${role.id}`, {
          method: "PUT",
          body: { name: role.name, permissions: [], reason: "Audit failure rollback" },
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await admin.request(`/api/auth/users/${user.id}/sellers`, {
          method: "PUT",
          body: { sellerIds: ["A"], reason: "Audit link rollback" },
        })
      ).status,
    ).toBe(503);
  } finally {
    await environment.db.schema.renameTable("unavailable_events", "dmmarket_auth_events");
  }
  expect((await reader.request("/api/currency_rates")).status).toBe(200);
  expect((await admin.request(`/api/auth/roles/${role.id}`)).body.permissions).toEqual([
    { capability: "rates.read", scope: "global" },
  ]);
  expect((await admin.request(`/api/auth/users/${user.id}/sellers`)).body.data).toEqual([]);
});

test("ediciones concurrentes de roles conservan un administrador", async () => {
  const other = await administrator();
  const owners = [{ user: owner, client: admin }, other];
  const inputs = [];
  for (const item of owners) {
    const [id] = await environment.db("dmmarket_auth_user_roles").where("user_id", item.user.id).pluck("role_id");
    inputs.push({ id, name: (await item.client.request(`/api/auth/roles/${id}`)).body.name });
  }
  const results = await Promise.all(
    owners.map((item, index) =>
      item.client.request(`/api/auth/roles/${inputs[index].id}`, {
        method: "PUT",
        body: { name: inputs[index].name, permissions: [], reason: "Concurrent owner role edit" },
      }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
});
