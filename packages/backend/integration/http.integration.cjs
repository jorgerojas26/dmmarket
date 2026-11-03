const http = require("node:http");
const https = require("node:https");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
let environment;
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
});
afterAll(async () => {
  await environment?.close();
});

test("HTTPS verifica CA y rechaza una conexión no confiable", async () => {
  expect((await environment.client().request("/health")).status).toBe(200);
  await expect(
    new Promise((resolve, reject) => {
      const request = https.get(
        { hostname: "127.0.0.1", port: environment.httpsPort, servername: "auth-probe.localhost" },
        resolve,
      );
      request.on("error", reject);
    }),
  ).rejects.toMatchObject({ code: expect.stringMatching(/CERT|ISSUER|VERIFY/) });
});

test("APIs anónimas denegadas y proyección explícita para lector", async () => {
  const client = environment.client();
  for (const url of ["/api/sales", "/api/products", "/api/currency_rates", "/api/update/status", "/api/backups/status"])
    expect((await client.request(url)).status).toBe(401);
  const user = await environment.seedUser();
  expect((await client.login(user)).body.stage).toBe("ready");
  const response = await client.request("/api/currency_rates");
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toEqual([{ Simbolo: "BsS", Cambio: "42.125000" }]);
  expect((await client.request("/api/auth/users")).status).toBe(403);
  expect((await client.request("/api/sales")).status).toBe(403);
});

test("SID rota, cookie es segura y errores no destruyen sesión previa", async () => {
  const client = environment.client();
  const user = await environment.seedUser();
  const anonymous = await client.request("/api/auth/session");
  const cookie = client.jar.cookie;
  expect(anonymous.headers["set-cookie"][0]).toMatch(
    /__Host-dmmarket.sid=.*; Path=\/;.*HttpOnly; Secure; SameSite=Lax/,
  );
  expect(
    (
      await client.request("/api/auth/login", {
        method: "POST",
        body: { username: user.username, password: "incorrect" },
      })
    ).status,
  ).toBe(401);
  expect(client.jar.cookie).toBe(cookie);
  expect((await client.login(user)).status).toBe(200);
  expect(client.jar.cookie).not.toBe(cookie);
  expect((await client.request("/api/currency_rates", { cookie })).status).toBe(401);
});

test("CSRF, origen, formato y tamaño se aplican en la app real", async () => {
  const client = environment.client();
  await client.login(await environment.seedUser());
  expect((await client.request("/api/auth/logout", { method: "POST", body: {}, csrf: "invalid" })).status).toBe(403);
  expect(
    (
      await client.request("/api/auth/logout", {
        method: "POST",
        body: {},
        headers: { origin: "https://attacker.invalid" },
      })
    ).status,
  ).toBe(403);
  expect(
    (await client.request("/api/auth/logout", { method: "POST", body: {}, headers: { "content-type": "text/plain" } }))
      .status,
  ).toBe(415);
  expect(
    (await client.request("/api/auth/password", { method: "POST", body: { password: "a".repeat(9000) } })).status,
  ).toBe(413);
  expect((await client.request("/api/currency_rates")).status).toBe(200);
});

test("cabeceras proxy falsificadas no habilitan el puerto HTTP interno", async () => {
  const client = environment.client();
  await client.login(await environment.seedUser());
  const status = await new Promise((resolve, reject) => {
    const request = http.get(
      {
        host: "127.0.0.1",
        port: environment.internalPort,
        path: "/api/currency_rates",
        headers: {
          host: new URL(environment.origin).host,
          cookie: client.jar.cookie,
          "x-forwarded-proto": "https",
          "x-dmmarket-proxy": "forged",
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
  });
  expect(status).toBe(403);
});

test("la cuota devuelve 429/Retry-After pero permite cerrar sesión", async () => {
  const client = environment.client();
  const user = await environment.seedUser();
  await client.login(user);
  for (let index = 0; index < 9; index++)
    expect(
      (await client.request("/api/auth/reauthenticate", { method: "POST", body: { password: "incorrect" } })).status,
    ).toBe(401);
  const limited = await client.request("/api/auth/reauthenticate", {
    method: "POST",
    body: { password: user.password },
  });
  expect(limited.status).toBe(429);
  expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  expect((await client.request("/api/auth/logout", { method: "POST", body: {} })).status).toBe(200);
  expect((await client.request("/api/currency_rates")).status).toBe(401);
});
