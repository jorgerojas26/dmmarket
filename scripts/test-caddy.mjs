import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import web from "../packages/backend/web-config.js";
import service from "../packages/backend/web-service.js";
import { prepareCaddy } from "./prepare-caddy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = `${process.platform}-${process.arch}`;
await prepareCaddy(root, [target]);
const binary = service.verifiedCaddy(
  path.join(root, ".cache/caddy", target, process.platform === "win32" ? "caddy.exe" : "caddy"),
);
const directory = mkdtempSync(path.join(os.tmpdir(), "DMMarket proxy smoke "));
const backend = http.createServer(async (request, response) => {
  if (request.url === "/api/update/status") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ service: true }));
  } else if (request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.end(Buffer.concat(chunks));
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end("<html><body>DMMarket proxy test</body></html>");
  }
});
let child;
try {
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const configuration = {
    HOST: "127.0.0.1",
    PORT: String(backend.address().port),
    WEB_MODE: "caddy",
    WEB_HOSTNAME: "reportes.solser.internal",
  };
  const config = path.join(directory, "Caddyfile");
  const logs = path.join(directory, "logs");
  mkdirSync(logs);
  writeFileSync(config, web.caddyFile(configuration, path.join(logs, "caddy.log")).replace(":80 {", `:${port} {`));
  const validation = spawnSync(binary, ["validate", "--config", config, "--adapter", "caddyfile"], {
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(validation.status, 0, validation.stderr);
  child = spawn(binary, ["run", "--config", config, "--adapter", "caddyfile"], { stdio: ["ignore", "ignore", "pipe"] });
  let failure = "";
  child.stderr.on("data", (data) => {
    failure += data;
  });
  child.on("error", (error) => {
    failure += error.message;
  });
  const url = `http://127.0.0.1:${port}`;
  const headers = { Host: configuration.WEB_HOSTNAME };
  let ready;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      ready = await fetch(`${url}/api/update/status`, { headers, signal: AbortSignal.timeout(300) });
      if (ready.ok) break;
    } catch {}
    await delay(100);
  }
  assert.ok(ready?.ok, `Caddy no respondió: ${failure}`);
  assert.equal(ready.headers.get("X-DMMarket-Web"), web.proxyIdentity(configuration));
  assert.equal((await ready.json()).service, true);
  assert.ok((await (await fetch(url, { headers })).text()).includes("DMMarket proxy test"));
  const payload = JSON.stringify({ report: "ventas", value: 123 });
  const posted = await fetch(`${url}/api/test`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: payload,
  });
  assert.equal(await posted.text(), payload);
  const unknownHost = await fetch(url, { headers: { Host: "otro.solser.internal" } });
  assert.equal(unknownHost.headers.get("X-DMMarket-Web"), null);
  assert.ok(!(await unknownHost.text()).includes("DMMarket proxy test"));
  await new Promise((resolve) => backend.close(resolve));
  const unavailable = await fetch(`${url}/api/update/status`, { headers });
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.headers.get("X-DMMarket-Web"), web.proxyIdentity(configuration));
  console.log(
    "Caddy real: configuración válida, frontend y API por HTTP, POST intacto, nombre e identidad con backend caído verificados.",
  );
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 3000);
    force.unref();
    await exited;
    clearTimeout(force);
  }
  await new Promise((resolve) => backend.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
