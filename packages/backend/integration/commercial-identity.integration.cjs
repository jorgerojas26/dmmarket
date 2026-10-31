const { randomUUID } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedParties } = require("../../../tests/support/party-fixtures.cjs");
let environment;
let admin;
let owner;
const permission = (capability) => ({ capability });
const range = "from=2026-01-01&to=2026-01-31&showNoe=false";

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedParties(environment.db);
  owner = await environment.seedUser({
    permissions: Object.keys(backend("./auth/capabilities").CAPABILITIES).map(permission),
    enrolled: true,
  });
  admin = environment.client();
  await admin.login(owner);
  expect(
    (
      await admin.request("/api/auth/mfa", {
        method: "POST",
        body: { token: await environment.token(owner.secret) },
      })
    ).status,
  ).toBe(200);
});

afterAll(async () => environment?.close());
beforeEach(async () => {
  await environment.db("dmmarket_auth_commercial_profiles").delete();
});

async function seller(capabilities, sellerId = "A") {
  const user = await environment.seedUser({ permissions: capabilities.map(permission) });
  if (sellerId)
    await environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: user.id, seller_id: sellerId });
  const client = environment.client();
  expect((await client.login(user)).status).toBe(200);
  return { user, client };
}

test("permisos binarios y perfil individual aíslan las ventas en ambos sistemas y sus exportaciones", async () => {
  const { client } = await seller(["sales.breakdown.read", "sales.breakdown.financial"]);
  for (const showNoe of [false, true]) {
    const query = `${range.replace("showNoe=false", `showNoe=${showNoe}`)}`;
    const result = await client.request(`/api/sales/facturas?${query}`);
    expect(result.status).toBe(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    expect(
      result.body.data.every((row) => String(row.idFactura || row.invoiceId || row.id) === (showNoe ? "2" : "1")),
    ).toBe(true);
    expect((await client.request(`/api/sales/facturas?${query}&employeeId=B`)).body.data).toHaveLength(0);
    const exported = await client.request(`/api/exports/sales?${query}`);
    expect(exported.status).toBe(200);
    expect(JSON.stringify(exported.body)).not.toContain("B-exclusive");
  }
  const session = await client.request("/api/auth/session");
  expect(session.body.permissions).toEqual(expect.arrayContaining([permission("sales.breakdown.read")]));
  expect(session.body.permissions.every((grant) => !Object.hasOwn(grant, "scope"))).toBe(true);
});

test("no hay datos propios sin identidad y el permiso de otros no concede funciones ni rentabilidad", async () => {
  const missing = await seller(["sales.breakdown.read"], null);
  expect((await missing.client.request(`/api/sales/facturas?${range}`)).status).toBe(403);
  const shared = await seller(["sales.breakdown.read", "sales.others.read"], null);
  const all = await shared.client.request(`/api/sales/facturas?${range}`);
  expect(all.status).toBe(200);
  expect(all.body.data.length).toBeGreaterThan(1);
  expect(all.body.totals).not.toHaveProperty("utilidad");
  expect((await shared.client.request(`/api/dashboard/sales?${range}`)).status).toBe(403);
  const flagOnly = await seller(["sales.others.read"], null);
  expect((await flagOnly.client.request(`/api/sales/facturas?${range}`)).status).toBe(403);
});

test("la cartera se autoriza independientemente de consultar ventas ajenas", async () => {
  const { client } = await seller(["clients.receivables.read"]);
  expect([200, 503]).toContain((await client.request("/api/receivables")).status);
});

test("roles sin scope, catálogo sin assigned y contratos antiguos rechazados", async () => {
  const catalog = await admin.request("/api/auth/roles/catalog");
  expect(catalog.status).toBe(200);
  expect(catalog.body.data.some((row) => row.capability === "sales.others.read")).toBe(true);
  expect(catalog.body.data.every((row) => !Object.hasOwn(row, "assigned"))).toBe(true);
  const created = await admin.request("/api/auth/roles", {
    method: "POST",
    body: { name: randomUUID(), permissions: [permission("sales.breakdown.read")] },
  });
  expect(created.status).toBe(201);
  expect(created.body.permissions).toEqual([permission("sales.breakdown.read")]);
  for (const scope of ["assigned", "global"]) {
    expect(
      (
        await admin.request("/api/auth/roles", {
          method: "POST",
          body: { name: randomUUID(), permissions: [{ capability: "sales.breakdown.read", scope }] },
        })
      ).status,
    ).toBe(400);
  }
  expect([403, 404]).toContain((await admin.request(`/api/auth/users/${owner.id}/sellers`)).status);
});

test("un solo perfil por cuenta, exclusivo, validado contra Solser y con auditoría y revocación", async () => {
  const { user, client } = await seller(["settings.rates.read"], null);
  const result = await admin.request(`/api/auth/users/${user.id}/commercial-profile`, {
    method: "PUT",
    body: { sellerId: "A", reason: "Identidad comercial verificada" },
  });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ sellerId: "A", name: "Vendedor A" });
  expect((await client.request("/api/currency_rates")).status).toBe(401);
  expect((await admin.request(`/api/auth/users/${user.id}/commercial-profile`)).body).toMatchObject({ sellerId: "A" });
  const other = await environment.seedUser({ permissions: [] });
  expect(
    (
      await admin.request(`/api/auth/users/${other.id}/commercial-profile`, {
        method: "PUT",
        body: { sellerId: "A", reason: "Intento de identidad duplicada" },
      })
    ).status,
  ).toBe(409);
  for (const sellerId of [["A", "B"], "missing", "𐐀", 123]) {
    expect(
      (
        await admin.request(`/api/auth/users/${other.id}/commercial-profile`, {
          method: "PUT",
          body: { sellerId, reason: "Identidad comercial inválida" },
        })
      ).status,
    ).toBe(400);
  }
  expect(
    await environment.db("dmmarket_auth_events").where({
      actor_id: owner.id,
      target_user_id: user.id,
      action: "auth.commercial_profile_changed",
    }),
  ).toHaveLength(1);
});

test("crear un usuario vendedor requiere identidad y no cambia el catálogo heredado", async () => {
  const { seed } = backend("./seeds/001_default_roles");
  await seed(environment.db);
  const role = await environment.db("dmmarket_auth_roles").where("name", "Vendedor").first();
  expect(role).toBeTruthy();
  expect(
    await environment
      .db("dmmarket_auth_role_capabilities")
      .where({ role_id: role.id, capability: "sales.others.read" }),
  ).toHaveLength(0);
  const before = await environment.db("vendedores").orderBy("idVend");
  const body = { username: `seller-${randomUUID().slice(0, 8)}`, displayName: "Vendedor A", roleIds: [role.id] };
  expect((await admin.request("/api/auth/users", { method: "POST", body })).status).toBe(400);
  const created = await admin.request("/api/auth/users", { method: "POST", body: { ...body, sellerId: "A" } });
  expect(created.status).toBe(201);
  expect(await environment.db("dmmarket_auth_commercial_profiles").where("user_id", created.body.id)).toEqual([
    { user_id: created.body.id, seller_id: "A" },
  ]);
  expect(await environment.db("vendedores").orderBy("idVend")).toEqual(before);
});

test("cambiar roles no elimina el perfil y retirar un perfil requerido se rechaza", async () => {
  const { user } = await seller(["sales.breakdown.read"]);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/commercial-profile`, {
        method: "PUT",
        body: { sellerId: null, reason: "Retirar identidad requerida" },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/roles`, {
        method: "PUT",
        body: { roleIds: [] },
      })
    ).status,
  ).toBe(200);
  expect(await environment.db("dmmarket_auth_commercial_profiles").where("user_id", user.id)).toHaveLength(1);
  expect(
    (
      await admin.request(`/api/auth/users/${user.id}/commercial-profile`, {
        method: "PUT",
        body: { sellerId: null, reason: "Cuenta sin funciones comerciales" },
      })
    ).status,
  ).toBe(200);
});
