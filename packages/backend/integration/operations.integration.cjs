const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedRates } = require("../../../tests/support/rate-fixtures.cjs");
let environment;
const grant = (capability) => ({ capability, scope: "global" });
async function reader(permissions, enrolled = false) {
  const user = await environment.seedUser({ permissions, enrolled });
  const client = environment.client();
  await client.login(user);
  if (enrolled)
    expect(
      (await client.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(user.secret) } }))
        .status,
    ).toBe(200);
  return { client, user };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedRates(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("las consultas operativas no se infieren desde administración de cuentas", async () => {
  const { client } = await reader([grant("access.users")], true);
  for (const path of ["/api/currency_rates/bcv", "/api/backups", "/api/update/status", "/api/update/progress"])
    expect((await client.request(path)).status).toBe(403);
});

test("historial BCV entrega sólo fecha y tasa, no columna de compra ni metadatos internos", async () => {
  const { client } = await reader([grant("rates.read")]);
  const result = await client.request("/api/currency_rates/bcv?from=2026-01-01&to=2026-01-03");
  expect(result.status).toBe(200);
  expect(result.body).toEqual([
    { fecha: "2026-01-01", tasa: 200.1234 },
    { fecha: "2026-01-02", tasa: 201.1234 },
  ]);
  const byDate = await client.request("/api/currency_rates/bcv/2026-01-03");
  expect(byDate.body).toEqual({ fecha: "2026-01-02", tasa: 201.1234, solicitada: "2026-01-03", exacta: false });
});

test("tasa vigente no toma una publicación futura", async () => {
  const { client } = await reader([grant("rates.read")]);
  const latest = await client.request("/api/currency_rates/bcv/latest");
  const status = await client.request("/api/currency_rates/bcv/status");
  expect(latest.body.tasa).toBe(300);
  expect(status.body.ultimaPublicada.tasa).toBe(310);
  expect(status.body.ultimaTasa).toEqual(latest.body);
});

test("validación de rango y fecha no permiten consulta futura ni extraer campos arbitrarios", async () => {
  const { client } = await reader([grant("rates.read")]);
  for (const path of [
    "/api/currency_rates/bcv?from=2025-01-01&to=2027-01-01",
    "/api/currency_rates/bcv/9999-01-01",
    "/api/currency_rates/bcv/2026-02-30",
    "/api/currency_rates/bcv?fields=Compra",
    "/api/currency_rates/bcv/status?token=1",
  ])
    expect((await client.request(path)).status).toBe(400);
});

test("metadatos de respaldos no entregan ruta del servidor ni tokens de control", async () => {
  const { client } = await reader([grant("backups.read")]);
  const status = await client.request("/api/backups");
  expect(status.status).toBe(200);
  expect(status.body.backups).toEqual([]);
  expect(status.body).not.toHaveProperty("controlToken");
  expect(status.body).not.toHaveProperty("directory");
  const drive = await client.request("/api/backups/drive");
  expect(drive.status).toBe(200);
  expect(drive.body.localAccess).toBe(false);
  expect(drive.body).not.toHaveProperty("controlToken");
  expect(drive.body).not.toHaveProperty("localSetupUrl");
  for (const action of ["connect", "enable", "test", "disconnect", "recovery-key"])
    expect(
      (await client.request(`/api/backups/drive/${action}`, { method: "POST", body: { confirmed: true } })).status,
    ).toBe(403);
  const unrelated = await reader([grant("rates.read")]);
  expect((await unrelated.client.request("/api/backups/drive")).status).toBe(403);
});

test("estado de actualización sólo es lectura y no autoriza descarga o aplicación", async () => {
  const { client } = await reader([grant("updates.read")]);
  expect((await client.request("/api/update/status")).body).toMatchObject({ standalone: false });
  expect((await client.request("/api/update/progress")).body).toEqual({ active: false, bytes: 0, total: 0 });
  expect((await client.request("/api/update/apply", { method: "POST", body: {} })).status).toBe(403);
});

test("limpieza de caché exige confirmación, CSRF, MFA reciente y permiso específico", async () => {
  const { client, user } = await reader([grant("cache.clear")], true);
  expect((await client.request("/api/cache/clear", { method: "POST", body: { confirmed: false } })).status).toBe(400);
  expect(
    (await client.request("/api/cache/clear", { method: "POST", body: { confirmed: true }, csrf: "bad" })).status,
  ).toBe(403);
  const result = await client.request("/api/cache/clear", { method: "POST", body: { confirmed: true } });
  expect(result.status).toBe(200);
  expect(result.body.cleared).toBe(true);
  expect(
    Number(
      (
        await environment
          .db("dmmarket_auth_events")
          .where({ actor_id: user.id, reason: result.body.operationId })
          .count("* as n")
          .first()
      ).n,
    ),
  ).toBe(2);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .update({ password_ms: Date.now() - 300001 });
  expect((await client.request("/api/cache/clear", { method: "POST", body: { confirmed: true } })).status).toBe(403);
  const readOnly = await reader([grant("rates.read")]);
  expect(
    (await readOnly.client.request("/api/cache/clear", { method: "POST", body: { confirmed: true } })).status,
  ).toBe(403);
});
