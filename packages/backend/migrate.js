const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const IS_STANDALONE = typeof Bun !== "undefined" && Bun.embeddedFiles.length > 0;

async function runEmbeddedMigrations() {
  if (!IS_STANDALONE) return;

  const assets = require("./assets.js").default;
  const migrationKeys = Object.keys(assets)
    .filter((key) => key.startsWith("./migrations/") && key.endsWith(".js"))
    .sort();

  if (migrationKeys.length === 0) return;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-migrations-"));
  let knex;
  try {
    for (const key of migrationKeys) {
      fs.writeFileSync(path.join(dir, path.basename(key)), fs.readFileSync(assets[key], "utf8"));
    }
    knex = require("knex")(require("./knexfile"));
    const [[server]] = await knex.raw("SELECT VERSION() AS version");
    console.log(`Preparando la base de datos con MySQL ${server.version}.`);
    const migrations = new Map(
      migrationKeys.map((key) => {
        const name = path.basename(key);
        return [name, require(path.join(dir, name))];
      }),
    );
    const history = (await knex.schema.hasTable("knex_migrations")) ? await knex("knex_migrations").select("name") : [];
    const completed = new Set(history.map((row) => row.name));
    const unknown = [...completed].filter((name) => !migrations.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `El historial contiene migraciones desconocidas. No se modificó el bloqueo: ${unknown.join(", ")}`,
      );
    }
    const automatic = [...migrations.keys()].filter(
      (name) => completed.has(name) || migrations.get(name).config?.scope === "dmmarket",
    );
    const manual = [...migrations.keys()].filter((name) => !automatic.includes(name));
    if (manual.length > 0) {
      console.log(
        `No se modificarán las tablas compartidas. Migraciones reservadas a mantenimiento manual: ${manual.join(", ")}`,
      );
    }
    if (await knex.schema.hasTable("knex_migrations_lock")) {
      const locks = await knex("knex_migrations_lock").select("is_locked");
      if (locks.length !== 1 || locks.some((lock) => Number(lock.is_locked) !== 0)) {
        await knex.migrate.forceFreeMigrationsLock();
        console.log("Se recuperó un bloqueo de migraciones abandonado bajo acceso exclusivo.");
      }
    }
    const migrationSource = {
      getMigrations: () => automatic,
      getMigrationName: (name) => name,
      getMigration(name) {
        const migration = migrations.get(name);
        return {
          ...migration,
          async up(connection) {
            console.log(`Iniciando migración: ${name}`);
            await migration.up(connection);
            console.log(`Migración completada: ${name}`);
          },
        };
      },
    };
    const [, applied] = await knex.migrate.latest({ migrationSource });
    if (applied.length > 0) console.log(`Migraciones aplicadas automáticamente: ${applied.join(", ")}`);
    console.log("Preparación de la base de datos completada.");
  } finally {
    try {
      if (knex) await knex.destroy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

module.exports = { runEmbeddedMigrations };
