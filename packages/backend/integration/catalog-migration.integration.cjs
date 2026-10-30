const { randomUUID } = require("node:crypto");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { CAPABILITIES } = require("../auth/capabilities");
const migration = require("../migrations/20261103_rebuild_permission_catalog");
let environment;
beforeEach(async () => {
  environment = await startEnvironment();
});
afterEach(async () => {
  await environment?.close();
});

test("la sustitución de catálogo no conserva concesiones antiguas ni elimina cuentas o roles personalizados", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.dispatch.read", scope: "assigned" }] });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const role = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id).first();
  await environment
    .db("dmmarket_auth_role_permissions")
    .where("role_id", role.role_id)
    .update({ capability: "sales.read" });
  await expect(require("../auth/identity").assertAuthSchema(environment.db)).rejects.toThrow("catálogo");
  await migration.up(environment.db);
  await require("../migrations/20261104_complete_functional_consultation").up(environment.db);
  expect(await environment.db("dmmarket_auth_roles").where("id", role.role_id)).toHaveLength(1);
  expect(await environment.db("dmmarket_auth_user_roles").where("user_id", user.id)).toHaveLength(1);
  expect(await environment.db("dmmarket_auth_user_sellers").where("user_id", user.id)).toHaveLength(1);
  expect(await environment.db("dmmarket_auth_role_permissions").where("role_id", role.role_id)).toEqual([]);
  for (const grant of await environment.db("dmmarket_auth_role_permissions"))
    expect(Object.hasOwn(CAPABILITIES, grant.capability)).toBe(true);
  expect((await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version).toBe(3);
});

test("un conflicto de nombres revierte el vaciado de permisos, la auditoría y las cuentas", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.dispatch.read", scope: "global" }] });
  const id = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id, name: "Superusuario" });
  const before = await environment.db("dmmarket_auth_role_permissions");
  await expect(migration.up(environment.db)).rejects.toThrow("identificador distinto");
  expect(await environment.db("dmmarket_auth_role_permissions")).toEqual(before);
  expect((await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version).toBe(1);
  expect(await environment.db("dmmarket_auth_events")).toEqual([]);
});

test("los roles base tienen todos sus permisos nuevos y no se convierten tablas ajenas", async () => {
  await environment.db.schema.createTable("business_catalog_sentinel", (table) => {
    table.engine("MyISAM");
    table.charset("latin1");
    table.string("value");
  });
  await environment.db("business_catalog_sentinel").insert({ value: "unchanged" });
  await migration.up(environment.db);
  await require("../migrations/20261104_complete_functional_consultation").up(environment.db);
  expect((await environment.db("dmmarket_auth_roles").select("name")).map((role) => role.name).sort()).toEqual([
    "Administrador",
    "Cobranza",
    "Consultor",
    "Superusuario",
  ]);
  const superuser = await environment.db("dmmarket_auth_roles").where("name", "Superusuario").first();
  expect(
    (await environment.db("dmmarket_auth_role_permissions").where("role_id", superuser.id))
      .map((grant) => grant.capability)
      .sort(),
  ).toEqual(Object.keys(CAPABILITIES).sort());
  const [tables] = await environment.db.raw("SHOW TABLE STATUS LIKE 'business_catalog_sentinel'");
  expect(tables[0].Engine).toBe("MyISAM");
  expect(await environment.db("business_catalog_sentinel")).toEqual([{ value: "unchanged" }]);
});

test("la migración rechaza control no transaccional antes de vaciar concesiones", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.dispatch.read", scope: "global" }] });
  const before = await environment.db("dmmarket_auth_role_permissions");
  await environment.db.raw("ALTER TABLE dmmarket_auth_control ENGINE=MyISAM");
  try {
    await expect(migration.up(environment.db)).rejects.toThrow("InnoDB/utf8_bin");
    expect(await environment.db("dmmarket_auth_role_permissions")).toEqual(before);
    expect((await environment.db("dmmarket_auth_users").where("id", user.id).first()).session_version).toBe(1);
  } finally {
    await environment.db.raw("ALTER TABLE dmmarket_auth_control ENGINE=InnoDB");
  }
});
