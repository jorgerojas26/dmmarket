const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { backend, until } = require("./auth-environment.cjs");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { buildNativeServer } = require("./native-server.cjs");
const { createSetupApp } = backend("./setup");
const { serializeConfiguration } = backend("./setup-config");
const { checkApplicationPort, proxyReady } = backend("./setup-network");
const { certificateInfo } = backend("./setup-certificates");

async function startSetupSandbox(environment, existing = environment.configuration, compiled = false) {
  const directory = fs.mkdtempSync(path.join(environment.directory, "setup-"));
  const web = path.join(directory, "web");
  const certificateFile = path.join(web, "data", "pki", "authorities", "local", "root.crt");
  fs.mkdirSync(path.dirname(certificateFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(certificateFile, environment.ca, { mode: 0o600 });
  fs.writeFileSync(path.join(web, "installation.json"), JSON.stringify({ component: "DMMarket-Web" }));
  const token = randomBytes(32).toString("hex");
  let server, binary, child, url;
  try {
    if (compiled) {
      binary = buildNativeServer("setup-server.cjs");
      const configurationFile = path.join(directory, "fixture.json");
      fs.writeFileSync(
        configurationFile,
        JSON.stringify({
          ...existing,
          EXPECTED_SETUP_EXECUTABLE: binary.executablePath,
          SETUP_FIXTURE_DIRECTORY: directory,
          SETUP_FIXTURE_CA: environment.ca.toString("base64"),
          SETUP_FIXTURE_TOKEN: token,
        }),
        { mode: 0o600 },
      );
      child = spawn(binary.executablePath, [configurationFile], { cwd: directory, stdio: "ignore" });
      await until(() => {
        if (child.exitCode !== null) throw new Error("El instalador compilado terminó antes de estar listo.");
        return fs.existsSync(path.join(directory, "ready.json"));
      });
      url = JSON.parse(fs.readFileSync(path.join(directory, "ready.json"), "utf8")).url;
    } else {
      let app;
      server = http.createServer((req, res) => app(req, res));
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
      url = `http://127.0.0.1:${port}`;
    }
  } catch (error) {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    binary?.close();
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
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
      if (child && child.exitCode === null) {
        child.kill("SIGTERM");
        await once(child, "exit");
      }
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
      binary?.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

const startCompiledSetupSandbox = (environment) => startSetupSandbox(environment, environment.configuration, true);
module.exports = { startSetupSandbox, startCompiledSetupSandbox };
