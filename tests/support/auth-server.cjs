const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const configuration = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  if (
    configuration.DATABASE_HOST !== "127.0.0.1" ||
    !/^dmmarket_test_[a-f0-9]{32}$/.test(configuration.DATABASE_NAME || "") ||
    Number(configuration.DATABASE_PORT) === 3306
  )
    throw new Error("El servidor de pruebas requiere su contenedor desechable.");
  if (
    configuration.EXPECTED_TEST_EXECUTABLE &&
    fs.realpathSync(process.execPath) !== fs.realpathSync(configuration.EXPECTED_TEST_EXECUTABLE)
  )
    throw new Error("El proceso compilado debe pertenecer al ejecutable temporal del laboratorio.");
  process.chdir(path.dirname(process.argv[2]));
  Object.assign(process.env, configuration);
  delete process.env.DEBUG;
  const app = require("../../packages/backend/index");
  const services = {};
  if (configuration.RATE_FIXTURE_SOURCE) {
    const origin = new URL(configuration.RATE_FIXTURE_SOURCE);
    if (origin.hostname !== "127.0.0.1" || origin.protocol !== "http:")
      throw new Error("El origen de tasas requiere el laboratorio local.");
    services.rates = require("../../packages/backend/bcv").crearServicioTasas({
      download: async (url, { etag } = {}) => {
        const response = await fetch(`${origin.origin}${new URL(url).pathname}`, {
          headers: etag ? { "if-none-match": etag } : {},
        });
        return {
          estado: response.status,
          cabeceras: Object.fromEntries(response.headers),
          cuerpo: Buffer.from(await response.arrayBuffer()),
        };
      },
    });
  }
  if (configuration.UPDATE_FIXTURE_SOURCE) {
    const origin = new URL(configuration.UPDATE_FIXTURE_SOURCE);
    if (origin.hostname !== "127.0.0.1" || origin.protocol !== "http:")
      throw new Error("El origen de releases requiere el laboratorio local.");
    services.updateReader = require("../../packages/backend/controllers/update").createUpdateReader((url, options) =>
      fetch(`${origin.origin}${new URL(url).pathname}${new URL(url).search}`, options),
    );
  }
  if (configuration.UPDATE_ASSET_FIXTURE_SOURCE) {
    const origin = new URL(configuration.UPDATE_ASSET_FIXTURE_SOURCE);
    if (origin.hostname !== "127.0.0.1" || origin.protocol !== "http:")
      throw new Error("Los assets requieren el laboratorio local.");
    services.updateInstaller = require("../../packages/backend/controllers/update").createUpdateInstaller(
      (url, options) => fetch(`${origin.origin}${new URL(url).pathname}`, options),
    );
  }
  await app.initializeAuth(configuration, services);
  const server = app.listen(Number(configuration.PORT), "127.0.0.1");
  process.once("SIGTERM", async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await app.closeAuth();
    await require("../../packages/backend/database").destroy();
  });
}

main().catch((error) => {
  let message = String(error.stack || error.message);
  for (const key of ["DATABASE_PASSWORD", "AUTH_SESSION_SECRET", "AUTH_MFA_KEY"])
    if (process.env[key]) message = message.split(process.env[key]).join("[oculta]");
  console.error(message);
  process.exit(1);
});
