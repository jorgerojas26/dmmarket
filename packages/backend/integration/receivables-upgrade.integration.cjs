const { randomUUID } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedReceivables } = require("../../../tests/support/receivables-fixtures.cjs");
const preparation = require("../migrations/20261031_prepare_receivables_writes");
let environment;
let client;
let user;

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedReceivables(environment.db);
  user = await environment.seedUser({
    permissions: ["receivables.read", "receivables.payment"].map((capability) => ({ capability, scope: "global" })),
    enrolled: true,
  });
  client = environment.client();
  await client.login(user);
  await client.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(user.secret) } });
});

afterAll(async () => {
  await environment?.close();
});

test("actualización automática desde main conserva historia y prepara únicamente tablas propias", async () => {
  await environment.db("cxc_operaciones").insert({
    IdOperacion: randomUUID(),
    IdCliente: "C",
    Tipo: "CIERRE",
    Referencia: 1,
    Huella: "a".repeat(64),
    Motivo: "Registro histórico",
    Datos: "{}",
    FechaRegistro: "2026-01-01 12:00:00",
  });
  const documents = await environment.db("cxc_documentos").orderBy("IdDocumento");
  const historical = await environment.db("cxc_operaciones").orderBy("IdOperacion");
  const shared = await environment
    .db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", ["clientes", "masterfact", "cxc_documentos", "cxc_movimientos", "cxc_cruces", "divisas"])
    .select("TABLE_NAME", "ENGINE")
    .orderBy("TABLE_NAME");
  expect((await client.request("/api/receivables/status")).body.writesAvailable).toBe(false);
  const migrations = new Map([
    ["20261011_add_receivables_operations.js", require("../migrations/20261011_add_receivables_operations")],
    ["20261026_add_receivables_actor.js", require("../migrations/20261026_add_receivables_actor")],
    ["20261031_prepare_receivables_writes.js", preparation],
  ]);
  const source = {
    getMigrations: () => [...migrations.keys()].filter((name) => migrations.get(name).config?.scope === "dmmarket"),
    getMigrationName: (name) => name,
    getMigration: (name) => migrations.get(name),
  };
  const migrationDb = backend("knex")({
    ...environment.db.client.config,
    connection: { ...environment.db.client.config.connection, charset: "utf8" },
    pool: { min: 0, max: 1 },
  });
  let applied;
  try {
    [, applied] = await migrationDb.migrate.latest({ migrationSource: source });
  } finally {
    await migrationDb.destroy();
  }
  expect(applied).toContain("20261031_prepare_receivables_writes.js");
  expect(applied).not.toContain("20261026_add_receivables_actor.js");
  expect((await client.request("/api/receivables/status")).body.writesAvailable).toBe(true);
  expect(await environment.db("cxc_documentos").orderBy("IdDocumento")).toEqual(documents);
  const columns = Object.keys(historical[0]);
  expect(await environment.db("cxc_operaciones").select(columns).orderBy("IdOperacion")).toEqual(historical);
  expect((await environment.db("cxc_operaciones").first()).ActorId).toBeNull();
  expect(
    await environment
      .db("information_schema.TABLES")
      .whereRaw("TABLE_SCHEMA = DATABASE()")
      .whereIn(
        "TABLE_NAME",
        shared.map((row) => row.TABLE_NAME),
      )
      .select("TABLE_NAME", "ENGINE")
      .orderBy("TABLE_NAME"),
  ).toEqual(shared);
  await preparation.up(environment.db);
  expect(await environment.db("cxc_documentos").orderBy("IdDocumento")).toEqual(documents);
  expect(Number((await environment.db("cxc_operaciones").count("* as n").first()).n)).toBe(1);
  await expect(preparation.down(environment.db)).rejects.toThrow("no se revierte");
});

test("el esquema actualizado registra abonos con actor y no duplica una solicitud repetida", async () => {
  const payload = { type: "payment", amount: "5", currency: "USD", date: "2026-01-10", method: "EFECTIVO" };
  const preview = await client.request("/api/receivables/CXC-C2/preview", { method: "POST", body: payload });
  expect(preview.status).toBe(200);
  const requestId = randomUUID();
  const request = { ...payload, requestId, snapshot: preview.body.snapshot };
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await client.request("/api/receivables/CXC-C2/operations", { method: "POST", body: request });
    expect(result.status).toBe(200);
  }
  expect(Number((await environment.db("cxc_movimientos").count("* as n").first()).n)).toBe(1);
  expect((await environment.db("cxc_operaciones").where("IdOperacion", requestId).first()).ActorId).toBe(user.id);
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ actor_id: user.id, action: "receivables.payment", reason: requestId })
      .first(),
  ).toBeTruthy();
});
