const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { realDatabase } = require("./test-database.cjs");
async function main() {
  const db = realDatabase();
  try {
    const configuration = db.client.config.connection;
    const [{ total }] = await db("masterfact").count("* as total");
    if (!Number(total)) throw new Error("La copia real no contiene ventas.");
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(DATABASE_|INVOICE_TEST_)/.test(key)) delete env[key];
    Object.assign(env, {
      DATABASE_HOST: configuration.host,
      DATABASE_PORT: String(configuration.port),
      DATABASE_NAME: configuration.database,
      DATABASE_USER: configuration.user,
      DATABASE_PASSWORD: configuration.password,
    });
    const result = spawnSync(
      "bun",
      [path.resolve(__dirname, "../../packages/backend/tests/invoice-dispatch.integration.mjs")],
      { env, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`La integración con datos reales terminó con ${result.signal || result.status}.`);
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
