const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const legacyRoles = require("../../../tests/support/legacy-seed-roles.json");
const migration = () => require("../migrations/20261106_minimum_operational_roles");
let environment;
beforeEach(async () => {
  environment = await startEnvironment({ legacyAuth: true });
  await require("../migrations/20261105_individual_commercial_identity").up(environment.db);
});
afterEach(async () => environment?.close());

async function legacyRole(name, capabilities) {
  const id = randomUUID();
  await environment.db("dmmarket_auth_roles").insert({ id, name });
  await environment
    .db("dmmarket_auth_role_capabilities")
    .insert(capabilities.map((capability) => ({ role_id: id, capability })));
  return id;
}

test("reemplaza permisos seed anteriores sin compatibilidad y revoca sesiones una vez", async () => {
  for (const role of legacyRoles) {
    if (await environment.db("dmmarket_auth_roles").where("id", role.id).first()) continue;
    await environment.db("dmmarket_auth_roles").insert({ id: role.id, name: role.name });
    await environment
      .db("dmmarket_auth_role_capabilities")
      .insert(role.permissions.map((capability) => ({ role_id: role.id, capability })));
  }
  const custom = await legacyRole("Cobranza personalizada", [
    "sales.others.read",
    "clients.receivables.read",
    "clients.receivables.void",
    "sales.breakdown.read",
  ]);
  const user = await environment.seedUser({ permissions: [] });
  await environment.db("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: custom });
  const original = await environment.db("dmmarket_auth_users").where("id", user.id).first();
  await migration().up(environment.db);
  const grants = await environment.db("dmmarket_auth_role_capabilities").where("role_id", custom).pluck("capability");
  expect(grants.sort()).toEqual(
    ["sales.others.read", "clients.receivables.read", "clients.receivables.void", "sales.breakdown.read"].sort(),
  );
  const collection = await environment.db("dmmarket_auth_roles").where("name", "Cobranza").first();
  expect(
    (
      await environment.db("dmmarket_auth_role_capabilities").where("role_id", collection.id).pluck("capability")
    ).sort(),
  ).toEqual(["clients.receivables.read", "clients.receivables.payment", "settings.rates.read"].sort());
  const after = await environment.db("dmmarket_auth_users").where("id", user.id).first();
  expect(after.password_hash).toBe(original.password_hash);
  expect(Number(after.session_version)).toBe(Number(original.session_version) + 1);
  const snapshot = await environment.db("dmmarket_auth_role_capabilities").orderBy(["role_id", "capability"]);
  await migration().up(environment.db);
  expect(await environment.db("dmmarket_auth_role_capabilities").orderBy(["role_id", "capability"])).toEqual(snapshot);
  expect(await environment.db("dmmarket_auth_users").where("id", user.id).first()).toEqual(after);
});

test("restablece un seed modificado sin conservar su nombre ni sus permisos previos", async () => {
  const vendor = legacyRoles.find((role) => role.name === "Vendedor");
  await environment.db("dmmarket_auth_roles").insert({ id: vendor.id, name: "Vendedor personalizado" });
  await environment.db("dmmarket_auth_role_capabilities").where("role_id", vendor.id).delete();
  await environment
    .db("dmmarket_auth_role_capabilities")
    .insert({ role_id: vendor.id, capability: "sales.others.read" });
  await migration().up(environment.db);
  expect((await environment.db("dmmarket_auth_roles").where("id", vendor.id).first()).name).toBe("Vendedor");
  const expected = require("../auth/default-roles").roles.find((role) => role.id === vendor.id);
  expect(
    (await environment.db("dmmarket_auth_role_capabilities").where("role_id", vendor.id).pluck("capability")).sort(),
  ).toEqual([...expected.permissions].sort());
  expect(expected.permissions).not.toContain("sales.others.read");
});

test("la migración extraída del ejecutable no depende de archivos externos", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "seed-roles-migration-"));
  try {
    const file = path.join(directory, "migration.cjs");
    fs.copyFileSync(path.join(__dirname, "../migrations/20261106_minimum_operational_roles.js"), file);
    await require(file).up(environment.db);
    expect(Number((await environment.db("dmmarket_auth_control").first()).operational_roles)).toBe(1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
