const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

async function main() {
  const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  if (
    config.DATABASE_HOST !== "127.0.0.1" ||
    config.DATABASE_NAME !== "dmmarket_auth_test" ||
    Number(config.DATABASE_PORT) === 3306 ||
    fs.realpathSync(process.execPath) !== fs.realpathSync(config.EXPECTED_SETUP_EXECUTABLE)
  )
    throw new Error("El instalador compilado de pruebas requiere su binario y MySQL desechables.");
  process.chdir(config.SETUP_FIXTURE_DIRECTORY);
  Object.assign(process.env, config);
  delete process.env.DEBUG;
  const { createSetupApp } = require("../../packages/backend/setup");
  const { serializeConfiguration } = require("../../packages/backend/setup-config");
  const { checkApplicationPort, proxyReady } = require("../../packages/backend/setup-network");
  const { certificateInfo } = require("../../packages/backend/setup-certificates");
  const directory = config.SETUP_FIXTURE_DIRECTORY,
    web = path.join(directory, "web"),
    ca = Buffer.from(config.SETUP_FIXTURE_CA, "base64");
  let app;
  const server = http.createServer((request, response) => app(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  app = createSetupApp({
    token: config.SETUP_FIXTURE_TOKEN,
    port,
    existing: config,
    installed: true,
    directory,
    addresses: [],
    install: async (configuration) =>
      fs.writeFileSync(path.join(directory, ".env"), serializeConfiguration(configuration), { mode: 0o600 }),
    checkPort: (configuration, saved, installed) =>
      checkApplicationPort(configuration, saved, installed, { ca, directory: web }),
    ready: (configuration) => proxyReady(configuration, ca),
    certificate: () => certificateInfo(web),
    firewall: async () => {
      throw new Error("El laboratorio no permite modificar el firewall.");
    },
    trust: async () => {
      throw new Error("El laboratorio no permite modificar la confianza del SO.");
    },
  });
  fs.writeFileSync(path.join(directory, "ready.json"), JSON.stringify({ url: `http://127.0.0.1:${port}` }), {
    mode: 0o600,
  });
  process.once("SIGTERM", async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
  });
}
main().catch(() => {
  console.error("No se pudo iniciar el instalador compilado de pruebas.");
  process.exitCode = 1;
});
