const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
let environment;
beforeEach(async () => {
  environment = await startEnvironment();
});
afterEach(async () => environment?.close());
const migration = () => require("../migrations/20261104_complete_functional_consultation");

test("la simplificación conserva roles, identidades, vínculos y alcances sin convertir información aislada en consulta", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.dashboard.read", scope: "assigned" }] });
  const [{ role_id }] = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id);
  await environment.db("dmmarket_auth_role_permissions").insert([
    { role_id, capability: "sales.dashboard.amounts", scope: "global" },
    { role_id, capability: "sales.pareto.financial", scope: "assigned" },
    { role_id, capability: "clients.receivables.amounts", scope: "global" },
  ]);
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const before = await environment.db("dmmarket_auth_users").where("id", user.id).first();
  const roles = await environment.db("dmmarket_auth_roles");
  const assignments = await environment.db("dmmarket_auth_user_roles");
  const links = await environment.db("dmmarket_auth_user_sellers");
  await migration().up(environment.db);
  expect(await environment.db("dmmarket_auth_roles")).toEqual(roles);
  expect(await environment.db("dmmarket_auth_user_roles")).toEqual(assignments);
  expect(await environment.db("dmmarket_auth_user_sellers")).toEqual(links);
  expect(await environment.db("dmmarket_auth_users").where("id", user.id).first()).toEqual({
    ...before,
    session_version: Number(before.session_version) + 1,
  });
  const grants = await environment
    .db("dmmarket_auth_role_permissions")
    .where("role_id", role_id)
    .select("capability", "scope");
  expect(grants).toEqual(
    expect.arrayContaining([
      { capability: "sales.dashboard.read", scope: "assigned" },
      { capability: "sales.dashboard.financial", scope: "assigned" },
    ]),
  );
  expect(grants).toHaveLength(2);
});

test("los permisos de consulta de análisis embebidos se unen sin ampliar alcances vinculados", async () => {
  const user = await environment.seedUser({ permissions: [{ capability: "sales.dashboard.read", scope: "assigned" }] });
  const [{ role_id }] = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id);
  await environment
    .db("dmmarket_auth_role_permissions")
    .insert({ role_id, capability: "sales.pareto.read", scope: "global" });
  await migration().up(environment.db);
  expect(
    await environment
      .db("dmmarket_auth_role_permissions")
      .where({ role_id, capability: "sales.dashboard.read" })
      .select("scope"),
  ).toEqual([{ scope: "global" }]);
});

test("un catálogo desconocido aborta antes de modificar concesiones", async () => {
  const user = await environment.seedUser({
    permissions: [{ capability: "clients.receivables.read", scope: "global" }],
  });
  const [{ role_id }] = await environment.db("dmmarket_auth_user_roles").where("user_id", user.id);
  await environment
    .db("dmmarket_auth_role_permissions")
    .insert({ role_id, capability: "unknown.permission.read", scope: "global" });
  const before = await environment.db("dmmarket_auth_role_permissions");
  await expect(migration().up(environment.db)).rejects.toThrow("desconocido");
  expect(await environment.db("dmmarket_auth_role_permissions")).toEqual(before);
});
