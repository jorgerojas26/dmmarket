import assert from "node:assert/strict";
import { mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

assert.match(process.env.DATABASE_NAME || "", /^test_innodb_[a-z0-9_]+$/, "Usa una base aislada test_innodb_...");
assert.equal(process.env.BACKUP_CONSISTENCY, "transactional");
const load = createRequire(new URL("../packages/backend/package.json", import.meta.url));
const config = load("./knexfile.js");
const db = load("knex")({ ...config, pool: { min: 0, max: 2 } });
const migrating = load("knex")(config);
const directory = path.resolve(".dev/innodb-install", process.env.DATABASE_NAME);
mkdirSync(directory, { recursive: true });
const backup = path.join(directory, "backup.sql.gz");
const names = [
  "20261011_add_receivables_operations.js",
  "20261022_add_bcv_tasas.js",
  "20261028_add_report_settings.js",
];
const probe = "installation_write_probe";
let timer;
let inFlight = Promise.resolve();
const writes = [];
const failures = [];

async function snapshot() {
  const [tables] = await db.raw(
    "SELECT TABLE_NAME, ENGINE FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  );
  const result = [];
  for (const table of tables.filter((row) => row.TABLE_NAME !== probe)) {
    const [[schema]] = await db.raw("SHOW CREATE TABLE ??", [table.TABLE_NAME]);
    const [[checksum]] = await db.raw("CHECKSUM TABLE ?? EXTENDED", [table.TABLE_NAME]);
    result.push({
      name: table.TABLE_NAME,
      engine: table.ENGINE,
      schema: schema["Create Table"],
      checksum: checksum.Checksum,
    });
  }
  return result;
}

try {
  const [[engine]] = await db.raw("SHOW VARIABLES LIKE 'storage_engine'");
  assert.equal(
    engine.Value.toLowerCase(),
    "myisam",
    "La prueba requiere MyISAM predeterminado en la conexión de control.",
  );
  await db.raw("CREATE TABLE ?? (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB", [
    probe,
  ]);
  const before = await snapshot();
  timer = setInterval(() => {
    inFlight = inFlight.then(async () => {
      const start = performance.now();
      try {
        await db(probe).insert({ value: writes.length });
        writes.push(Math.round(performance.now() - start));
      } catch (error) {
        failures.push(error.message);
      }
    });
  }, 25);
  await migrating.migrate.latest({
    migrationSource: {
      getMigrations: () => names,
      getMigrationName: (name) => name,
      getMigration: (name) => load(`./migrations/${name}`),
    },
  });
  const after = await snapshot();
  for (const original of before)
    assert.deepEqual(
      after.find((row) => row.name === original.name),
      original,
    );
  const created = after.filter((row) => !before.some((original) => original.name === row.name));
  assert.ok(created.some((row) => row.name === "knex_migrations"));
  assert.ok(created.some((row) => row.name === "knex_migrations_lock"));
  assert.ok(created.some((row) => row.name === "bcv_tasas"));
  assert.ok(created.some((row) => row.name === "dmmarket_settings"));
  for (const table of created) assert.equal(table.engine, "InnoDB", `${table.name} debe ser InnoDB`);
  const [[engineAfter]] = await db.raw("SHOW VARIABLES LIKE 'storage_engine'");
  assert.deepEqual(engineAfter, engine);
  const { backupOptions } = load("./backup-tool.js");
  const tool = await backupOptions();
  assert.equal(tool.mode, "transactional");
  assert.ok(tool.args.includes("--single-transaction"));
  assert.ok(tool.args.includes("--skip-lock-tables"));
  assert.ok(!tool.args.includes("--lock-all-tables"));
  await load("./backups.js").dumpDatabase(backup, process.env, undefined, tool);
  assert.ok(statSync(backup).size > 0);
  clearInterval(timer);
  await inFlight;
  assert.deepEqual(failures, []);
  assert.ok(writes.length > 0);
  assert.ok(Math.max(...writes) < 2000, "Las escrituras simuladas se bloquearon más de 2 segundos.");
  console.log(
    JSON.stringify(
      {
        created: created.map(({ name, engine }) => ({ name, engine })),
        preservedTables: before.length,
        writes: writes.length,
        maxWriteMs: Math.max(...writes),
        backup,
      },
      null,
      2,
    ),
  );
} finally {
  clearInterval(timer);
  await inFlight;
  await db.schema.dropTableIfExists(probe);
  await Promise.all([db.destroy(), migrating.destroy()]);
}
