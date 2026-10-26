const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { CAPABILITIES } = backend("./auth/capabilities");
let environment;
let owner;
let ownerClient;
const range = "from=2026-01-01&to=2026-01-31&showNoe=false";
const dashboard = `/api/dashboard/sales?${range}`;

async function reader(seller = "A", financial = false) {
  const user = await environment.seedUser({
    permissions: [
      { capability: "sales.read", scope: "assigned" },
      ...(financial ? [{ capability: "sales.financial", scope: "assigned" }] : []),
    ],
  });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: seller });
  const client = environment.client();
  await client.login(user);
  return { user, client };
}

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await require("../../../tests/support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../../../tests/support/pareto-fixtures.cjs").seedPareto(environment.db);
  await require("../../../tests/support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../../../tests/support/party-fixtures.cjs").seedParties(environment.db);
  owner = await environment.seedUser({
    permissions: Object.keys(CAPABILITIES).map((capability) => ({ capability, scope: "global" })),
    enrolled: true,
  });
  ownerClient = environment.client();
  await ownerClient.login(owner);
  await ownerClient.request("/api/auth/mfa", {
    method: "POST",
    body: { token: await environment.token(owner.secret) },
  });
});
afterAll(async () => {
  await environment?.close();
});

beforeEach(async () => {
  expect((await ownerClient.request("/api/cache/clear", { method: "POST", body: { confirmed: true } })).status).toBe(
    200,
  );
});

test.each([
  "/dashboard/sales",
  "/dashboard/pareto",
  "/clients/dashboard",
  "/clients/sin-facturar",
  "/purchases/dashboard",
  "/purchases/pareto",
  "/sellers/dashboard",
])("refresh reutiliza la caché autorizada de %s sin caché de navegador", async (path) => {
  const params = path.startsWith("/purchases/") ? "from=2026-01-01&to=2026-01-31" : range;
  const first = await ownerClient.request(`/api${path}?${params}`);
  expect(first.status).toBe(200);
  expect(first.headers["x-report-cache"]).toBe("MISS");
  const reversed = path.startsWith("/purchases/")
    ? "to=2026-01-31&from=2026-01-01"
    : "showNoe=false&to=2026-01-31&from=2026-01-01";
  const repeated = await ownerClient.request(`/api${path}?${reversed}`, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  expect(repeated.status).toBe(200);
  expect(repeated.headers["x-report-cache"]).toBe("HIT");
  expect(repeated.headers["cache-control"]).toBe("no-store");
  expect(repeated.body).toEqual(first.body);
});

test("un HIT evita consultar ventas aunque la tabla esté bloqueada", async () => {
  const { client } = await reader();
  const first = await client.request(dashboard);
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  let pending;
  let timer;
  try {
    await environment.db.raw("LOCK TABLES slavefact WRITE").connection(connection);
    locked = true;
    pending = client.request(dashboard);
    const response = await Promise.race([
      pending,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 1000);
      }),
    ]);
    expect(response?.headers["x-report-cache"]).toBe("HIT");
    expect(response.body).toEqual(first.body);
  } finally {
    clearTimeout(timer);
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
    await pending;
  }
});

test("un refresh comparte el cálculo autorizado aunque se cierre la conexión anterior", async () => {
  const { client } = await reader();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  let request;
  let pending;
  try {
    await environment.db.raw("LOCK TABLES slavefact WRITE").connection(connection);
    locked = true;
    request = require("node:https").get(
      {
        hostname: "127.0.0.1",
        port: environment.httpsPort,
        servername: "auth-probe.localhost",
        ca: environment.ca,
        path: dashboard,
        headers: { host: new URL(environment.origin).host, origin: environment.origin, cookie: client.jar.cookie },
      },
      (response) => response.resume(),
    );
    request.on("error", () => {});
    await require("../../../tests/support/auth-environment.cjs").until(async () => {
      const [rows] = await environment.db.raw("SHOW FULL PROCESSLIST");
      return rows.some((row) => String(row.State) === "Locked" && String(row.Info).includes("slavefact"));
    }, 1000);
    request.destroy();
    pending = client.request(dashboard);
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    request?.destroy();
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
  }
  const response = await pending;
  expect(response.status).toBe(200);
  expect(["HIT", "SHARED"]).toContain(response.headers["x-report-cache"]);
  expect(response.body.kpis.totalRawProfit).toBe(100);
  expect((await client.request(dashboard)).headers["x-report-cache"]).toBe("HIT");
});

test("usuarios, permisos efectivos y vendedores vinculados nunca comparten resultados", async () => {
  const first = await reader("A", true);
  const second = await reader("B");
  const privateReport = await first.client.request(dashboard);
  expect(privateReport.body.kpis.totalRawProfit).toBe(100);
  expect(privateReport.body.kpis).toHaveProperty("totalNetProfit");
  const other = await second.client.request(dashboard);
  expect(other.headers["x-report-cache"]).toBe("MISS");
  expect(other.body.kpis.totalRawProfit).toBe(450);
  expect(other.body.kpis).not.toHaveProperty("totalNetProfit");
  const role = await environment.db("dmmarket_auth_user_roles").where("user_id", first.user.id).first();
  await environment
    .db("dmmarket_auth_role_permissions")
    .where({ role_id: role.role_id, capability: "sales.financial" })
    .delete();
  const reduced = await first.client.request(dashboard);
  expect(reduced.headers["x-report-cache"]).toBe("MISS");
  expect(reduced.body.kpis).not.toHaveProperty("totalNetProfit");
  await environment.db("dmmarket_auth_user_sellers").where("user_id", first.user.id).update({ seller_id: "B" });
  const relinked = await first.client.request(dashboard);
  expect(relinked.headers["x-report-cache"]).toBe("MISS");
  expect(relinked.body.kpis.totalRawProfit).toBe(450);
});

test("la caché no permite usar sesiones revocadas, vencidas o cuentas deshabilitadas", async () => {
  for (const kind of ["disabled", "expired", "logout"]) {
    const { user, client } = await reader();
    expect((await client.request(dashboard)).status).toBe(200);
    expect((await client.request(dashboard)).headers["x-report-cache"]).toBe("HIT");
    if (kind === "disabled")
      await environment.db("dmmarket_auth_users").where("id", user.id).update({ enabled: false });
    else if (kind === "expired")
      await environment
        .db("dmmarket_auth_session_state")
        .where("user_id", user.id)
        .update({ activity_ms: Date.now() - 1800001 });
    else await client.request("/api/auth/logout", { method: "POST", body: {} });
    const denied = await client.request(dashboard);
    expect(denied.status).toBe(401);
    expect(denied.body).not.toHaveProperty("kpis");
    expect(denied.headers["x-report-cache"]).not.toBe("HIT");
  }
});

test("un reporte que caduca antes de confirmar la transacción no entra en caché", async () => {
  const { user, client } = await reader();
  const expires = Date.now() + 1500;
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .update({ activity_ms: expires - 1800000 });
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  let pending;
  try {
    await environment.db.raw("LOCK TABLES slavefact WRITE").connection(connection);
    locked = true;
    pending = client.request(dashboard);
    await require("../../../tests/support/auth-environment.cjs").until(async () => {
      const [rows] = await environment.db.raw("SHOW FULL PROCESSLIST");
      return rows.some((row) => String(row.State) === "Locked" && String(row.Info).includes("slavefact"));
    }, 1000);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, expires - Date.now()) + 100));
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
  }
  expect((await pending).status).toBe(401);
  expect((await client.login(user)).body.stage).toBe("ready");
  const fresh = await client.request(dashboard);
  expect(fresh.status).toBe(200);
  expect(fresh.headers["x-report-cache"]).toBe("MISS");
});

test("limpiar la caché obliga a recalcular y una respuesta inválida no se guarda", async () => {
  expect((await ownerClient.request(dashboard)).headers["x-report-cache"]).toBe("MISS");
  expect((await ownerClient.request(dashboard)).headers["x-report-cache"]).toBe("HIT");
  await ownerClient.request("/api/cache/clear", { method: "POST", body: { confirmed: true } });
  expect((await ownerClient.request(dashboard)).headers["x-report-cache"]).toBe("MISS");
  for (let index = 0; index < 2; index++) {
    const invalid = await ownerClient.request(`${dashboard}&unknown=true`);
    expect(invalid.status).toBe(400);
    expect(invalid.headers["x-report-cache"]).not.toBe("HIT");
  }
});
