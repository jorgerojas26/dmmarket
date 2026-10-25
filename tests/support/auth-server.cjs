const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const configuration = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  if (
    configuration.DATABASE_HOST !== "127.0.0.1" ||
    configuration.DATABASE_NAME !== "dmmarket_auth_test" ||
    Number(configuration.DATABASE_PORT) === 3306
  )
    throw new Error("El servidor de pruebas requiere su contenedor desechable.");
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
  await app.initializeAuth(configuration, services);
  const server = app.listen(Number(configuration.PORT), "127.0.0.1");
  process.once("SIGTERM", async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await app.closeAuth();
    await require("../../packages/backend/database").destroy();
  });
}

main().catch(() => process.exit(1));
