import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = createRequire(path.join(root, "packages/backend/package.json"));
const { createHttpSecurity } = load("./auth/http-security");
const { proxyCredential } = load("./web-config");
const directory = mkdtempSync(path.join(os.tmpdir(), "dmmarket-dev-https-"));
const backend = http.createServer();
const frontendSockets = new Set();
const frontend = net.createServer((socket) => {
  frontendSockets.add(socket);
  socket.once("close", () => frontendSockets.delete(socket));
  socket.once("data", (data) => {
    const request = data.toString();
    if (/upgrade: websocket/i.test(request)) {
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
      return;
    }
    const host = request.match(/\r\nhost: ([^\r]+)/i)[1];
    const pathname = request.split(" ")[1];
    const body = `frontend:${host}:${pathname}`;
    socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  });
});
const proxies = [];
let fixture;
let runtime;
let urlPanel;
let panelOutput = "";
let panelReader;

function panelFrame() {
  return panelOutput.split("\u001b[2J\u001b[H").at(-1);
}

async function expectPanel(text) {
  const deadline = Date.now() + 5000;
  while (!panelFrame().includes(text)) {
    assert.equal(urlPanel.exitCode, null, "El panel HTTPS debe seguir activo.");
    assert.ok(Date.now() < deadline, `El panel HTTPS no mostró: ${text}`);
    await Bun.sleep(50);
  }
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

function request(proxy, pathname, options = {}) {
  const url = new URL(pathname, proxy.env.AUTH_PUBLIC_ORIGIN);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        ca: readFileSync(proxy.certificate),
        lookup: (_hostname, options, callback) =>
          options.all ? callback(null, [{ address: "127.0.0.1", family: 4 }]) : callback(null, "127.0.0.1", 4),
        ...options,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function webSocketHandshake(proxy) {
  const url = new URL(proxy.env.AUTH_PUBLIC_ORIGIN);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: "127.0.0.1",
      port: Number(url.port),
      servername: url.hostname,
      ca: readFileSync(proxy.certificate),
    });
    socket.setTimeout(3000, () => socket.destroy(new Error("WebSocket no respondió.")));
    socket.on("error", reject);
    socket.on("secureConnect", () =>
      socket.write(
        `GET /sockjs-node HTTP/1.1\r\nHost: ${url.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
      ),
    );
    socket.once("data", (data) => {
      socket.destroy();
      resolve(data.toString().split("\r\n")[0]);
    });
  });
}

try {
  urlPanel = Bun.spawn(["bun", path.join(root, "scripts/dev-url.mjs"), path.join(directory, "https.json")], {
    stdout: "pipe",
    stderr: "inherit",
  });
  panelReader = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of urlPanel.stdout) panelOutput += decoder.decode(chunk, { stream: true });
  })();
  await expectPanel("HTTPS detenido");
  const { startDevelopmentHttps } = await import("./dev-https.mjs");
  const backendPort = await listen(backend);
  const frontendPort = await listen(frontend);
  const options = {
    root,
    directory,
    env: {
      PORT: String(backendPort),
      AUTH_SESSION_SECRET: "inherited-invalid-secret",
      AUTH_MFA_KEY: "inherited-invalid-key",
    },
    frontendUrl: `http://dev-probe.localhost:${frontendPort}`,
  };
  const proxy = await startDevelopmentHttps(options);
  proxies.push(proxy);
  await expectPanel(proxy.env.AUTH_PUBLIC_ORIGIN);
  assert.ok(panelFrame().includes("HTTP son internos"));
  const security = createHttpSecurity(proxy.env.AUTH_PUBLIC_ORIGIN);
  const express = load("express");
  const app = express();
  app.set("trust proxy", load("./auth/http-security").trustLocalProxy);
  app.use((req, res, next) => {
    if (req.get("x-dmmarket-proxy") !== proxyCredential(proxy.env)) return res.sendStatus(403);
    if (req.get("x-dmmarket-client-ip") !== "127.0.0.1") return res.sendStatus(403);
    next();
  });
  app.use(security.transport);
  app.use((_req, res) => res.json({ ok: true }));
  backend.on("request", app);
  assert.equal(proxy.env.WEB_MODE, "caddy");
  assert.equal(proxy.env.HOST, "127.0.0.1");
  assert.notEqual(proxy.env.AUTH_SESSION_SECRET, options.env.AUTH_SESSION_SECRET);
  assert.notEqual(proxy.env.AUTH_MFA_KEY, options.env.AUTH_MFA_KEY);
  assert.equal(statSync(path.join(directory, "auth.json")).mode & 0o777, 0o600);
  assert.equal((await request(proxy, "/api/probe")).status, 200);
  assert.equal(
    (
      await request(proxy, "/api/probe", {
        headers: { "X-DMMarket-Proxy": "forged", "X-DMMarket-Client-IP": "203.0.113.1" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(proxy, "/api/probe", { method: "POST", headers: { Origin: proxy.env.AUTH_PUBLIC_ORIGIN } })).status,
    200,
  );
  assert.equal(
    (await request(proxy, "/api/probe", { method: "POST", headers: { Origin: "https://untrusted.localhost" } })).status,
    403,
  );
  assert.equal((await request(proxy, "/api/probe", { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal((await request(proxy, "/screen")).body, `frontend:dev-probe.localhost:${frontendPort}:/screen`);
  assert.equal(await webSocketHandshake(proxy), "HTTP/1.1 101 Switching Protocols");
  const direct = await fetch(`http://127.0.0.1:${backendPort}/api/probe`);
  assert.equal(direct.status, 403);
  fixture = await load(path.join(root, "tests/support/auth-environment.cjs")).startEnvironment();
  runtime = await load("./auth/runtime").createAuthRuntime({
    db: fixture.db,
    env: { ...fixture.configuration, ...proxy.env },
  });
  const authenticatedApp = express();
  authenticatedApp.set("trust proxy", load("./auth/http-security").trustLocalProxy);
  authenticatedApp.use("/api", runtime.middleware);
  backend.removeAllListeners("request");
  backend.on("request", authenticatedApp);
  const session = await request(proxy, "/api/auth/session");
  assert.equal(session.status, 200);
  assert.equal(JSON.parse(session.body).user, null);
  assert.equal(typeof JSON.parse(session.body).csrfToken, "string");
  assert.match(session.headers["set-cookie"][0], /__Host-dmmarket\.sid=/);
  assert.match(session.headers["set-cookie"][0], /; Secure/);
  assert.match(session.headers["set-cookie"][0], /; HttpOnly/);
  assert.equal(
    (
      await request(proxy, "/api/auth/logout", {
        method: "POST",
        headers: { Origin: proxy.env.AUTH_PUBLIC_ORIGIN, "Content-Type": "application/json" },
      })
    ).status,
    403,
  );
  await runtime.close();
  runtime = null;
  await proxy.close();
  await expectPanel("HTTPS detenido");
  const restarted = await startDevelopmentHttps(options);
  proxies.push(restarted);
  await expectPanel(restarted.env.AUTH_PUBLIC_ORIGIN);
  assert.equal(restarted.env.AUTH_SESSION_SECRET, proxy.env.AUTH_SESSION_SECRET);
  assert.equal(restarted.env.AUTH_MFA_KEY, proxy.env.AUTH_MFA_KEY);
  assert.equal(readFileSync(restarted.certificate, "utf8"), readFileSync(proxy.certificate, "utf8"));
  const isolated = await startDevelopmentHttps({ ...options, directory: path.join(directory, "isolated") });
  proxies.push(isolated);
  await Bun.sleep(1100);
  assert.ok(panelFrame().includes(restarted.env.AUTH_PUBLIC_ORIGIN));
  assert.ok(!panelFrame().includes(isolated.env.AUTH_PUBLIC_ORIGIN));
  const mprocs = readFileSync(path.join(root, "mprocs.yaml"), "utf8");
  assert.ok(mprocs.startsWith('procs:\n  https:\n    cmd: ["bun", "scripts/dev-url.mjs"]'));
  assert.notEqual(isolated.env.AUTH_SESSION_SECRET, proxy.env.AUTH_SESSION_SECRET);
  assert.notEqual(isolated.env.AUTH_MFA_KEY, proxy.env.AUTH_MFA_KEY);
  assert.notEqual(isolated.env.AUTH_PUBLIC_ORIGIN, restarted.env.AUTH_PUBLIC_ORIGIN);
  console.log(
    "HTTPS de desarrollo: API, cookies seguras, CSRF, frontend, WebSockets, persistencia y aislamiento verificados.",
  );
} finally {
  if (urlPanel?.exitCode === null) {
    urlPanel.kill("SIGTERM");
    await urlPanel.exited;
  }
  await panelReader;
  for (const proxy of proxies.reverse()) await proxy.close();
  if (runtime) await runtime.close();
  if (fixture) await fixture.close();
  backend.closeAllConnections();
  for (const socket of frontendSockets) socket.destroy();
  await Promise.all([
    new Promise((resolve) => backend.close(resolve)),
    new Promise((resolve) => frontend.close(resolve)),
  ]);
  rmSync(directory, { recursive: true, force: true });
}
