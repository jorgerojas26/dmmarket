const { randomUUID } = require("node:crypto");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
let environment;
const migration = () => require("../migrations/20261105_individual_commercial_identity");

beforeEach(async () => {
  environment = await startEnvironment({ legacyAuth: true });
  await seedSales(environment.db);
});
afterEach(async () => environment?.close());

async function account(grants, sellers = []) {
  const user = await environment.seedUser({ permissions: [] });
  const roleId = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id: roleId, name: roleId });
  await environment.db("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: roleId });
  if (grants.length)
    await environment
      .db("dmmarket_auth_role_permissions")
      .insert(grants.map((grant) => ({ role_id: roleId, ...grant })));
  if (sellers.length)
    await environment
      .db("dmmarket_auth_user_sellers")
      .insert(sellers.map((seller_id) => ({ user_id: user.id, seller_id })));
  return { user, roleId };
}

test("migra identidades únicas y roles uniformes sin modificar ventas, credenciales ni archivos antiguos", async () => {
  const own = await account([{ capability: "sales.breakdown.read", scope: "assigned" }], ["A"]);
  const global = await account([{ capability: "sales.breakdown.read", scope: "global" }]);
  const users = await environment.db("dmmarket_auth_users").orderBy("id");
  const oldPermissions = await environment.db("dmmarket_auth_role_permissions").orderBy("role_id");
  const links = await environment.db("dmmarket_auth_user_sellers");
  const sales = await environment.db("masterfact").orderBy("IdFactura");
  await migration().up(environment.db);
  expect(await environment.db("dmmarket_auth_commercial_profiles")).toEqual([{ user_id: own.user.id, seller_id: "A" }]);
  expect(await environment.db("dmmarket_auth_role_capabilities").where("role_id", own.roleId)).toEqual([
    { role_id: own.roleId, capability: "sales.breakdown.read" },
  ]);
  expect(await environment.db("dmmarket_auth_role_capabilities").where("role_id", global.roleId)).toEqual(
    expect.arrayContaining([
      { role_id: global.roleId, capability: "sales.breakdown.read" },
      { role_id: global.roleId, capability: "sales.others.read" },
    ]),
  );
  expect(await environment.db("dmmarket_auth_role_permissions").orderBy("role_id")).toEqual(oldPermissions);
  expect(await environment.db("dmmarket_auth_user_sellers")).toEqual(links);
  expect(await environment.db("masterfact").orderBy("IdFactura")).toEqual(sales);
  expect(await environment.db("dmmarket_auth_users").orderBy("id")).toEqual(
    users.map((user) => ({ ...user, session_version: Number(user.session_version) + 1 })),
  );
  await require("../migrations/20261107_individual_permissions").up(environment.db);
  await require("../auth/identity").assertAuthSchema(environment.db);
  const sellerRole = await environment.db("dmmarket_auth_roles").where("name", "Vendedor").first();
  expect(sellerRole).toBeTruthy();
  expect(
    await environment
      .db("dmmarket_auth_role_capabilities")
      .where({ role_id: sellerRole.id, capability: "sales.others.read" }),
  ).toHaveLength(0);
  const snapshot = await environment.db("dmmarket_auth_role_capabilities").orderBy("role_id").orderBy("capability");
  await migration().up(environment.db);
  expect(await environment.db("dmmarket_auth_role_capabilities").orderBy("role_id").orderBy("capability")).toEqual(
    snapshot,
  );
  expect(await environment.db("dmmarket_auth_users").orderBy("id")).toEqual(
    users.map((user) => ({ ...user, session_version: Number(user.session_version) + 1 })),
  );
});

test("varios vendedores por cuenta bloquean antes de crear el nuevo modelo", async () => {
  await account([{ capability: "sales.breakdown.read", scope: "assigned" }], ["A", "B"]);
  await expect(migration().up(environment.db)).rejects.toThrow(/varios vendedores/i);
  expect(await environment.db.schema.hasTable("dmmarket_auth_commercial_profiles")).toBe(false);
});

test("un mismo vendedor en dos cuentas requiere resolución explícita", async () => {
  await account([], ["A"]);
  await account([], ["A"]);
  await expect(migration().up(environment.db)).rejects.toThrow(/varias cuentas/i);
  expect(await environment.db.schema.hasTable("dmmarket_auth_role_capabilities")).toBe(false);
});

test("alcances diferentes en un rol no se convierten en acceso global", async () => {
  const { roleId } = await account(
    [
      { capability: "sales.breakdown.read", scope: "global" },
      { capability: "sales.breakdown.financial", scope: "assigned" },
    ],
    ["A"],
  );
  const before = await environment.db("dmmarket_auth_role_permissions").where("role_id", roleId);
  await expect(migration().up(environment.db)).rejects.toThrow(/alcances mezclados/i);
  expect(await environment.db("dmmarket_auth_role_permissions").where("role_id", roleId)).toEqual(before);
});

test("roles uniformes por separado tampoco amplían los permisos restringidos al combinarse", async () => {
  const { user } = await account([{ capability: "sales.breakdown.read", scope: "assigned" }], ["A"]);
  const { roleId } = await account([{ capability: "sales.dashboard.read", scope: "global" }]);
  await environment.db("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: roleId });
  await expect(migration().up(environment.db)).rejects.toThrow(/alcances mezclados/i);
  expect(await environment.db.schema.hasTable("dmmarket_auth_commercial_profiles")).toBe(false);
});

test("la base impide identidades duplicadas incluso sin pasar por HTTP", async () => {
  const first = await account([], ["A"]);
  const second = await account([]);
  await migration().up(environment.db);
  await expect(
    environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: second.user.id, seller_id: "A" }),
  ).rejects.toThrow();
  await expect(
    environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: first.user.id, seller_id: "B" }),
  ).rejects.toThrow();
});

test("la migración extraída del ejecutable funciona sin paquetes ni archivos del proyecto", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  await account([{ capability: "sales.breakdown.read", scope: "assigned" }], ["A"]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "commercial-migration-"));
  try {
    const file = path.join(directory, "migration.cjs");
    fs.copyFileSync(path.join(__dirname, "../migrations/20261105_individual_commercial_identity.js"), file);
    await require(file).up(environment.db);
    expect(await environment.db("dmmarket_auth_commercial_profiles")).toHaveLength(1);
    expect(Number((await environment.db("dmmarket_auth_control").first()).commercial_model)).toBe(1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test.each(["sales.others.read", "access.profile.read", "__proto__"])(
  "el archivo antiguo no adopta el permiso desconocido %s",
  async (capability) => {
    await account([{ capability, scope: "global" }]);
    await expect(migration().up(environment.db)).rejects.toThrow(/desconocido/i);
    expect(await environment.db.schema.hasTable("dmmarket_auth_role_capabilities")).toBe(false);
  },
);
