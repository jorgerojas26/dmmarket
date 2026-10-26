const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const backend = path.resolve(__dirname, "../packages/backend");
const load = createRequire(path.join(backend, "package.json"));
const knex = load("knex")(load("./knexfile.js"));

async function main() {
  const required = ["clientes", "productos", "proveedores", "masterfact", "slavefact", "mastercomp", "slavecomp"];
  for (const table of required) {
    if (!(await knex.schema.hasTable(table)))
      throw new Error(`Falta la tabla ${table}. La importación no está completa; no se ejecutaron migraciones.`);
  }
  if (process.argv.includes("--check")) return;
  const migrations = new Map(
    fs
      .readdirSync(path.join(backend, "migrations"))
      .filter((name) => name.endsWith(".js"))
      .sort()
      .map((name) => [name, load(path.join(backend, "migrations", name))]),
  );
  const history = (await knex.schema.hasTable("knex_migrations")) ? await knex("knex_migrations").select("name") : [];
  const applied = new Set(history.map(({ name }) => name));
  const unknown = [...applied].filter((name) => !migrations.has(name));
  if (unknown.length) throw new Error(`Migraciones desconocidas en esta base: ${unknown.join(", ")}`);
  const names = [...migrations.keys()].filter(
    (name) => applied.has(name) || migrations.get(name).config?.scope === "dmmarket",
  );
  const [, completed] = await knex.migrate.latest({
    migrationSource: {
      getMigrations: () => names,
      getMigrationName: (name) => name,
      getMigration: (name) => migrations.get(name),
    },
  });
  console.log(
    `Tablas base verificadas. Migraciones propias aplicadas: ${completed.join(", ") || "ninguna pendiente"}.`,
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => knex.destroy());
