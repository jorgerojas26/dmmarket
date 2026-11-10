const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
let environment;
const grants = (...capabilities) => capabilities.map((capability) => ({ capability, scope: "global" }));

async function client(permissions) {
  const user = await environment.seedUser({ permissions });
  const connection = environment.client();
  expect((await connection.login(user)).body.stage).toBe("ready");
  return { connection, user };
}

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await environment.db.schema.createTable("bancos", (table) => {
    table.engine("InnoDB");
    table.charset("utf8");
    table.collate("utf8_general_ci");
    table.string("Id_Banco", 10).primary();
    table.string("Nombre", 50);
  });
  await environment.db("bancos").insert([
    { Id_Banco: "B1", Nombre: "Banco uno" },
    { Id_Banco: "B2", Nombre: "Banco dos" },
  ]);
  await backend("./migrations/20261029_add_collection_catalogs").up(environment.db);
  await backend("./migrations/20261030_add_collection_order").up(environment.db);
});

afterAll(async () => environment?.close());

test("los catálogos conservan sesión, permisos propios, CSRF y auditoría", async () => {
  const base = "/api/receivables/catalogs/banks";
  expect((await environment.client().request(base)).status).toBe(401);
  const { connection: collector } = await client(grants("receivables.read"));
  expect((await collector.request("/api/receivables/banks")).status).toBe(200);
  expect((await collector.request("/api/receivables/methods")).status).toBe(200);
  expect((await collector.request(base)).status).toBe(403);
  const { connection: reader } = await client(grants("settings.collections.read"));
  expect((await reader.request(base)).status).toBe(200);
  expect((await reader.request(base, { method: "POST", body: { id: "B3", name: "Banco tres" } })).status).toBe(403);
  const { connection: editor, user } = await client(grants("settings.collections.read", "settings.collections.update"));
  expect(
    (await editor.request(base, { method: "POST", body: { id: "B3", name: "Banco tres" }, csrf: "invalid" })).status,
  ).toBe(403);
  expect((await editor.request(base, { method: "POST", body: { id: "B3", name: "Banco tres" } })).status).toBe(200);
  const reordered = await editor.request(`${base}/reorder`, { method: "POST", body: { ids: ["B3", "B2", "B1"] } });
  expect(reordered.status).toBe(200);
  expect((await collector.request("/api/receivables/banks")).body.map((row) => row.id)).toEqual(["B3", "B2", "B1"]);
  expect(
    (await editor.request(`${base}/B3`, { method: "PUT", body: { name: "Banco tres", active: false } })).status,
  ).toBe(200);
  expect((await collector.request("/api/receivables/banks")).body.map((row) => row.id)).toEqual(["B2", "B1"]);
  expect(
    await environment.db("dmmarket_auth_events").where({ actor_id: user.id, action: "collections.updated" }),
  ).toHaveLength(3);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .update({ password_ms: Date.now() - 301000 });
  const stale = await editor.request(`${base}/reorder`, { method: "POST", body: { ids: ["B1", "B2", "B3"] } });
  expect(stale.status).toBe(403);
  expect(stale.body.error.code).toBe("RECENT_AUTH_REQUIRED");
});
