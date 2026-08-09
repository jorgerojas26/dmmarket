// Aplica migraciones pendientes al arranque del binario compilado, antes de levantar el server.
// Sin esto, un update con migración nueva rompería la DB del cliente (hoy las migraciones son manuales).
//
// Solo corre en binario compilado (standalone); en dev no toca nada — sigue el flujo manual `bun run migrate`.
//
// Mecanismo: extrae los archivos de migración embebidos (assets.js) a un directorio temporal y
// delega en el migrator de knex (misma tabla knex_migrations, mismo formato batch/name, transaccional
// e idempotente). Si una migración falla, knex aborta; el error llega al bootstrap que sale con código ≠ 0.
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

  // knex necesita archivos reales en un directorio; los embebidos viven en paths virtuales
  // de bunfs ($bunfs/...), legibles con readFileSync pero no copiables (copyFileSync falla).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-migrations-"));
  try {
    for (const key of migrationKeys) {
      const content = fs.readFileSync(assets[key], "utf8");
      fs.writeFileSync(path.join(dir, path.basename(key)), content);
    }
    const knex = require("./database");
    const [, applied] = await knex.migrate.latest({ directory: dir });
    if (applied.length > 0) {
      console.log(`migraciones aplicadas automáticamente: ${applied.join(", ")}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runEmbeddedMigrations };
