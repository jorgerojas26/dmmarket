const { startEnvironment, backend } = require("./auth-environment.cjs");
const { realDatabase } = require("./test-database.cjs");

async function startRealReportsEnvironment() {
  const source = realDatabase();
  const environment = await startEnvironment({ web: true, seedCurrency: false });
  const configuration = environment.configuration;
  const admin = backend("knex")({
    client: backend("knex/lib/dialects/mysql2"),
    connection: { ...environment.db.client.config.connection, user: "root", password: "root" },
    pool: { min: 0, max: 1 },
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      const [processes] = await admin.raw("SHOW FULL PROCESSLIST");
      for (const process of processes) {
        if (String(process.User) === configuration.DATABASE_USER && String(process.Command) === "Query") {
          const id = Number(process.Id);
          if (Number.isSafeInteger(id) && id > 0) {
            try {
              await admin.raw(`KILL QUERY ${id}`);
            } catch (error) {
              if (Number(error.errno) !== 1094) throw error;
            }
          }
        }
      }
    } finally {
      try {
        await environment.close();
      } finally {
        await source.destroy();
        await admin.destroy();
      }
    }
  };
  try {
    const name = source.client.config.connection.database;
    if (name !== "dmmarket_real_test") throw new Error("Los reportes reales requieren la copia de tests.");
    await admin.raw("GRANT SELECT ON ??.* TO ?@'%'", [name, configuration.DATABASE_USER]);
    const tables = await admin("information_schema.TABLES")
      .where({ TABLE_SCHEMA: name, TABLE_TYPE: "BASE TABLE" })
      .select("TABLE_NAME");
    for (const row of tables) {
      const table = String(row.TABLE_NAME);
      if (/^(dmmarket_auth_|knex_)/.test(table) || (await environment.db.schema.hasTable(table))) continue;
      await admin.raw("CREATE ALGORITHM=MERGE SQL SECURITY INVOKER VIEW ?? AS SELECT * FROM ??.??", [
        table,
        name,
        table,
      ]);
    }
    return { ...environment, close };
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { startRealReportsEnvironment };
