import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { createRequire } from "node:module";

const load = createRequire(new URL("../packages/frontend/package.json", import.meta.url));
const express = createRequire(new URL("../packages/backend/package.json", import.meta.url))("express");
let forwarded = 0;
const backend = http.createServer((req, res) => {
  forwarded++;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ host: req.headers.host }));
});
backend.listen(0, "127.0.0.1");
await once(backend, "listening");
const target = `http://127.0.0.1:${backend.address().port}`;
process.env.DMMARKET_API_URL = target;
const app = express();
load("./src/setupProxy.js")(app);
const frontend = app.listen(0, "127.0.0.1");
await once(frontend, "listening");
const url = `http://127.0.0.1:${frontend.address().port}/api/auth/session`;
try {
  const missingBackend = await fetch(url, { headers: { Host: new URL(target).host } });
  assert.equal(missingBackend.status, 503, "Una ruta backend resuelta al frontend no debe volver a Portless.");
  assert.equal(forwarded, 0);
  const session = await fetch(url, { headers: { Host: "frontend.localhost:1355" } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).host, new URL(target).host);
  assert.equal(forwarded, 1);
  console.log("Proxy de desarrollo: Host correcto y protección frente al bucle de Portless verificados.");
} finally {
  frontend.closeAllConnections();
  backend.closeAllConnections();
  await Promise.all([new Promise((resolve) => frontend.close(resolve)), new Promise((resolve) => backend.close(resolve))]);
}
