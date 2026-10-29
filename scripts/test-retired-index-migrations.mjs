import assert from "node:assert/strict";
import { createRequire } from "node:module";

const load = createRequire(new URL("../packages/backend/package.json", import.meta.url));
const names = [
  "20260808_add_masterfact_anulada_fecha.js",
  "20260809_add_slavefact_ventas_index.js",
  "20260810_add_slavefact_ventas_cover.js",
  "20260929_add_client_history_indexes.js",
];
const migrations = names.map((name) => ({ name, migration: load(`./migrations/${name}`) }));
for (const { name, migration } of migrations) {
  assert.equal(typeof migration.retired?.up, "function", `${name}: falta la referencia retirada`);
  assert.equal(typeof migration.retired?.down, "function", `${name}: falta la referencia retirada`);
  assert.notEqual(migration.up, migration.retired.up);
  assert.notEqual(migration.down, migration.retired.down);
}

const database = load("./database.js");
async function snapshot() {
  const [indexes] = await database.raw(
    "SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE FROM information_schema.statistics WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
  );
  const history = (await database.schema.hasTable("knex_migrations"))
    ? await database("knex_migrations").select("name").orderBy("id")
    : [];
  return { indexes, history };
}

try {
  const before = await snapshot();
  const queries = [];
  const observe = (query) => queries.push(query.sql);
  database.on("query", observe);
  try {
    for (const { migration } of migrations) {
      await migration.up(database);
      await migration.down(database);
    }
  } finally {
    database.removeListener("query", observe);
  }
  assert.deepEqual(queries, [], "Las migraciones retiradas no deben ejecutar consultas.");
  assert.deepEqual(await snapshot(), before, "Los índices y el historial deben permanecer intactos.");
  for (const { name } of before.history) assert.ok(load(`./migrations/${name}`));
  console.log(
    "Las cuatro migraciones conservan su referencia y no ejecutan consultas en up/down. Índices e historial intactos.",
  );
} finally {
  await database.destroy();
}
