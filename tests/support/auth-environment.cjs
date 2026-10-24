const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const https = require("node:https");
const tls = require("node:tls");
const { spawn, execFileSync } = require("node:child_process");
const { randomBytes, randomUUID, createHash, X509Certificate } = require("node:crypto");
const { createRequire } = require("node:module");
const backend = createRequire(path.resolve(__dirname, "../../packages/backend/package.json"));
const knex = backend("knex");
const MySql2Client = backend("knex/lib/dialects/mysql2");
const migration = backend("./migrations/20261024_add_auth_access");
const { hashPassword } = backend("./auth/passwords");
const { createMfa } = backend("./auth/mfa");
const { caddyFile } = backend("./web-config");
const { NodeCryptoPlugin } = backend("@otplib/plugin-crypto-node");
const root = path.resolve(__dirname, "../..");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

async function until(work, timeout = 30000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const result = await work();
      if (result) return result;
    } catch (error) {
      last = error;
    }
    await delay(100);
  }
  throw new Error("No respondió el entorno aislado de pruebas.", { cause: last });
}

async function port() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}

function client(environment) {
  const jar = { cookie: "", csrf: "" };
  return {
    jar,
    async request(url, { method = "GET", body, headers = {}, cookie = jar.cookie, csrf = jar.csrf } = {}) {
      const result = await new Promise((resolve, reject) => {
        const request = https.request(
          {
            hostname: "127.0.0.1",
            port: environment.httpsPort,
            servername: "auth-probe.localhost",
            ca: environment.ca,
            path: url,
            method,
            headers: {
              host: new URL(environment.origin).host,
              origin: environment.origin,
              ...(cookie ? { cookie } : {}),
              ...(csrf ? { "x-csrf-token": csrf } : {}),
              ...(body === undefined ? {} : { "content-type": "application/json" }),
              ...headers,
            },
          },
          (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              text += chunk;
            });
            response.on("error", reject);
            response.on("end", () => {
              let json;
              try {
                json = JSON.parse(text);
              } catch {
                json = null;
              }
              resolve({ status: response.statusCode, headers: response.headers, body: json, text });
            });
          },
        );
        request.on("error", reject);
        request.setTimeout(10000, () => request.destroy(new Error("Timeout HTTPS de pruebas")));
        request.end(body === undefined ? undefined : JSON.stringify(body));
      });
      for (const value of result.headers["set-cookie"] || []) jar.cookie = value.split(";")[0];
      if (result.body?.csrfToken) jar.csrf = result.body.csrfToken;
      return result;
    },
    async login(user) {
      await this.request("/api/auth/session");
      return this.request("/api/auth/login", {
        method: "POST",
        body: { username: user.username, password: user.password },
      });
    },
  };
}

async function startEnvironment({ web = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-auth-test-"));
  fs.chmodSync(directory, 0o700);
  let container;
  let db;
  const children = [];
  let closed = false;
  const environment = {
    directory,
    async close() {
      if (closed) return;
      closed = true;
      try {
        for (const child of children.reverse()) {
          if (child.exitCode !== null || child.signalCode) continue;
          child.kill("SIGTERM");
          let timeout;
          try {
            await Promise.race([
              new Promise((resolve) => child.once("exit", resolve)),
              new Promise((resolve) => {
                timeout = setTimeout(resolve, 5000);
              }),
            ]);
          } finally {
            clearTimeout(timeout);
          }
          if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
        }
        if (db) await db.destroy();
      } finally {
        try {
          if (container) docker("rm", "-f", "-v", container);
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      }
    },
  };
  try {
    const password = randomBytes(32).toString("hex");
    container = docker(
      "run",
      "-d",
      "--label",
      "dmmarket.auth-test=true",
      "--platform",
      "linux/amd64",
      "--memory",
      "768m",
      "--cpus",
      "1",
      "--tmpfs",
      "/var/lib/mysql:rw,size=268435456",
      "-p",
      "127.0.0.1::3306",
      "-e",
      `MYSQL_ROOT_PASSWORD=${password}`,
      "-e",
      "MYSQL_DATABASE=dmmarket_auth_test",
      "dmmarket/mysql:5.0.24",
    );
    environment.container = container;
    const metadata = JSON.parse(docker("inspect", container))[0];
    const binding = metadata.NetworkSettings.Ports["3306/tcp"][0];
    if (binding.HostIp !== "127.0.0.1" || binding.HostPort === "3306") throw new Error("Publicación MySQL no aislada.");
    const configuration = {
      HOST: "127.0.0.1",
      DATABASE_HOST: "127.0.0.1",
      DATABASE_PORT: binding.HostPort,
      DATABASE_NAME: "dmmarket_auth_test",
      DATABASE_USER: "root",
      DATABASE_PASSWORD: password,
      AUTH_SESSION_SECRET: randomBytes(32).toString("base64"),
      AUTH_MFA_KEY: randomBytes(32).toString("base64"),
    };
    db = knex({
      client: MySql2Client,
      connection: {
        host: "127.0.0.1",
        port: Number(binding.HostPort),
        user: "root",
        password,
        database: configuration.DATABASE_NAME,
        charset: "UTF8_GENERAL_CI",
        connectTimeout: 1000,
      },
      pool: { min: 0, max: 6 },
      acquireConnectionTimeout: 2000,
    });
    await until(async () => {
      const [[version]] = await db.raw("SELECT VERSION() AS version");
      if (String(version.version) !== "5.0.24") throw new Error("Se requiere MySQL 5.0.24 exacto.");
      return true;
    });
    const existing = await db("information_schema.TABLES")
      .whereRaw("TABLE_SCHEMA = DATABASE()")
      .count("* as total")
      .first();
    if (Number(existing.total)) throw new Error("El contenedor debe tener una base vacía.");
    await migration.up(db);
    await backend("./migrations/20261025_add_auth_event_role").up(db);
    environment.db = db;
    environment.configuration = configuration;
    environment.mfa = createMfa(configuration.AUTH_MFA_KEY);
    environment.seedUser = async ({
      permissions = [{ capability: "rates.read", scope: "global" }],
      temporary = false,
      enrolled = false,
    } = {}) => {
      const user = {
        id: randomUUID(),
        username: `user-${randomBytes(6).toString("hex")}`,
        password: randomBytes(24).toString("base64url"),
      };
      const enrollment = enrolled ? await environment.mfa.createEnrollment(user.id, user.username) : null;
      if (enrollment) user.secret = new URL(enrollment.uri).searchParams.get("secret");
      user.passwordHash = await hashPassword(user.password);
      await db("dmmarket_auth_users").insert({
        id: user.id,
        username: user.username,
        display_name: user.username,
        password_hash: user.passwordHash,
        must_change_password: temporary,
        temporary_expires_ms: temporary ? Date.now() + 1800000 : null,
        mfa_secret: enrollment?.encryptedSecret || null,
      });
      if (permissions.length) {
        const role = randomUUID();
        await db("dmmarket_auth_roles").insert({ id: role, name: role });
        await db("dmmarket_auth_role_permissions").insert(permissions.map((grant) => ({ role_id: role, ...grant })));
        await db("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: role });
      }
      return user;
    };
    environment.token = async (secret) =>
      (
        await import(
          require("node:url").pathToFileURL(backend.resolve("otplib").replace(/index\.cjs$/, "index.js")).href
        )
      ).generate({ secret, crypto: new NodeCryptoPlugin() });
    environment.client = () => client(environment);
    if (!web) return environment;
    if (!fs.existsSync(path.join(root, "packages/backend/client/build/index.html")))
      throw new Error("Ejecuta bun --filter @dmmarket/backend build:prepare antes de las suites web.");
    await db.schema.createTable("divisas", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("Simbolo", 8).primary();
      table.decimal("Cambio", 18, 6);
      table.string("PrivateFixture", 64);
    });
    await db("divisas").insert({ Simbolo: "BsS", Cambio: "42.125", PrivateFixture: "must-not-leak" });
    environment.httpsPort = await port();
    environment.internalPort = await port();
    environment.origin = `https://auth-probe.localhost:${environment.httpsPort}`;
    Object.assign(configuration, {
      PORT: String(environment.internalPort),
      WEB_MODE: "caddy",
      WEB_HOSTNAME: "auth-probe.localhost",
      WEB_BIND_ADDRESS: "127.0.0.1",
      AUTH_PUBLIC_ORIGIN: environment.origin,
    });
    const configurationFile = path.join(directory, "configuration.json");
    fs.writeFileSync(configurationFile, JSON.stringify(configuration), { mode: 0o600 });
    fs.writeFileSync(path.join(directory, "Caddyfile"), caddyFile(configuration), { mode: 0o600 });
    const server = spawn("bun", [path.join(__dirname, "auth-server.cjs"), configurationFile], { stdio: "ignore" });
    children.push(server);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "packages/backend/caddy-manifest.json")));
    const target = `${process.platform}-${process.arch}`;
    const binary = path.join(root, ".cache/caddy", target, manifest.targets[target].binary);
    if (createHash("sha256").update(fs.readFileSync(binary)).digest("hex") !== manifest.targets[target].sha256)
      throw new Error("Caddy no coincide con el manifiesto.");
    const caddy = spawn(binary, ["run", "--config", path.join(directory, "Caddyfile"), "--adapter", "caddyfile"], {
      env: {
        ...process.env,
        XDG_DATA_HOME: path.join(directory, "data"),
        XDG_CONFIG_HOME: path.join(directory, "config"),
      },
      stdio: "ignore",
    });
    children.push(caddy);
    await until(() => {
      const file = path.join(directory, "data/caddy/pki/authorities/local/root.crt");
      return fs.existsSync(file) && fs.readFileSync(file);
    });
    environment.ca = fs.readFileSync(path.join(directory, "data/caddy/pki/authorities/local/root.crt"));
    await until(async () => (await environment.client().request("/health")).status === 200);
    environment.spki = await new Promise((resolve, reject) => {
      const socket = tls.connect(
        { host: "127.0.0.1", port: environment.httpsPort, servername: "auth-probe.localhost", ca: environment.ca },
        () => {
          const certificate = new X509Certificate(socket.getPeerCertificate().raw);
          resolve(
            createHash("sha256")
              .update(certificate.publicKey.export({ type: "spki", format: "der" }))
              .digest("base64"),
          );
          socket.end();
        },
      );
      socket.on("error", reject);
    });
    return environment;
  } catch (error) {
    await environment.close();
    throw error;
  }
}

module.exports = { startEnvironment, backend, until, docker };
