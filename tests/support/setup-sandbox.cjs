const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { backend } = require("./auth-environment.cjs");
const { createSetupApp } = backend("./setup");
const { serializeConfiguration } = backend("./setup-config");
const { checkApplicationPort, proxyReady } = backend("./setup-network");
const { certificateInfo } = backend("./setup-certificates");

async function startSetupSandbox(environment, existing = environment.configuration) {
  const directory = fs.mkdtempSync(path.join(environment.directory, "setup-"));
  const web = path.join(directory, "web");
  const certificateFile = path.join(web, "data", "pki", "authorities", "local", "root.crt");
  fs.mkdirSync(path.dirname(certificateFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(certificateFile, environment.ca, { mode: 0o600 });
  fs.writeFileSync(path.join(web, "installation.json"), JSON.stringify({ component: "DMMarket-Web" }));
  const token = randomBytes(32).toString("hex");
  let app;
  const server = http.createServer((req, res) => app(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  app = createSetupApp({
    token,
    port,
    existing,
    installed: true,
    directory,
    addresses: [],
    install: async (configuration) => {
      fs.writeFileSync(path.join(directory, ".env"), serializeConfiguration(configuration), { mode: 0o600 });
    },
    checkPort: (configuration, saved, installed) =>
      checkApplicationPort(configuration, saved, installed, { ca: environment.ca, directory: web }),
    ready: (configuration) => proxyReady(configuration, environment.ca),
    certificate: () => certificateInfo(web),
  });
  const url = `http://127.0.0.1:${port}`;
  return {
    directory,
    web,
    token,
    url,
    async request(route, body, authorization = true) {
      const response = await fetch(`${url}/api/${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(authorization ? { authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json",
          origin: url,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        value = text;
      }
      return { status: response.status, body: value, headers: response.headers };
    },
    payload: {
      DATABASE_HOST: environment.configuration.DATABASE_HOST,
      DATABASE_PORT: environment.configuration.DATABASE_PORT,
      DATABASE_USER: environment.configuration.DATABASE_USER,
      DATABASE_PASSWORD: environment.configuration.DATABASE_PASSWORD,
      DATABASE_NAME: environment.configuration.DATABASE_NAME,
      HOST: "127.0.0.1",
      PORT: environment.configuration.PORT,
      WEB_MODE: "caddy",
      WEB_HOSTNAME: environment.configuration.WEB_HOSTNAME,
      WEB_BIND_ADDRESS: "127.0.0.1",
      WEB_HTTPS_PORT: String(environment.httpsPort),
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

module.exports = { startSetupSandbox };
