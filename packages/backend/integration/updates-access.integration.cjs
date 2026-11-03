const fs = require("node:fs");
const path = require("node:path");
const { startEnvironment, until, backend } = require("../../../tests/support/auth-environment.cjs");
let environment;
const grant = (capability) => ({ capability, scope: "global" });
async function actor(permissions, enrolled = false) {
  const user = await environment.seedUser({ permissions, enrolled });
  const client = environment.client();
  await client.login(user);
  if (enrolled)
    expect(
      (await client.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(user.secret) } }))
        .status,
    ).toBe(200);
  return { user, client };
}
const assets = backend("./controllers/update").ASSETS_BY_PLATFORM[process.platform];
const urls = (tag = "v999.0.0") => ({
  confirmed: true,
  assetUrl: `https://github.com/jorgerojas26/dmmarket/releases/download/${tag}/${assets.binary}`,
  sha256AssetUrl: `https://github.com/jorgerojas26/dmmarket/releases/download/${tag}/${assets.sha}`,
});
beforeAll(async () => {
  environment = await startEnvironment({ web: true, updateSource: true });
});
afterAll(async () => {
  await environment?.close();
});

test("consultar versiones y notas no se infiere de administración de acceso", async () => {
  const who = await actor([grant("access.users")], true);
  const before = environment.updateSource.requests();
  expect((await who.client.request("/api/update/check", { method: "POST", body: {} })).status).toBe(403);
  expect((await who.client.request("/api/update/history")).status).toBe(403);
  expect(environment.updateSource.requests()).toBe(before);
});

test("consulta HTTP real de releases entrega metadatos y no concede descarga", async () => {
  const who = await actor([grant("updates.read")]);
  const result = await who.client.request("/api/update/check", { method: "POST", body: {} });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    updateAvailable: true,
    latestVersion: "999.0.0",
    notes: "Release sintética de integración",
  });
  expect(result.body.assetUrl).toBe(urls().assetUrl);
  expect((await who.client.request("/api/update/history")).body[0].version).toBe("999.0.0");
  expect((await who.client.request("/api/update/download", { method: "POST", body: urls() })).status).toBe(403);
  expect(fs.existsSync(path.join(environment.directory, ".dmmarket-update"))).toBe(false);
});

test("ejecución no concede lectura y las comprobaciones preceden cualquier escritura", async () => {
  const who = await actor([grant("updates.execute")], true);
  expect((await who.client.request("/api/update/download", { method: "POST", body: urls() })).status).toBe(403);
  expect((await who.client.request("/api/update/apply", { method: "POST", body: { confirmed: true } })).status).toBe(
    403,
  );
});

test("fuera del ejecutable compilado no se reemplaza el proceso aunque exista autorización", async () => {
  const who = await actor([grant("updates.read"), grant("updates.execute")], true);
  expect((await who.client.request("/api/update/download", { method: "POST", body: urls() })).status).toBe(400);
  expect((await who.client.request("/api/update/apply", { method: "POST", body: { confirmed: true } })).status).toBe(
    400,
  );
  expect(fs.existsSync(path.join(environment.directory, ".dmmarket-update"))).toBe(false);
  await until(
    async () =>
      Number(
        (
          await environment
            .db("dmmarket_auth_events")
            .where({ actor_id: who.user.id, action: "updates.apply_completed", outcome: "failure" })
            .count("* as n")
            .first()
        ).n,
      ) === 1,
  );
});

test("descarga rechaza URLs arbitrarias, credenciales, otra plataforma y versiones anteriores", async () => {
  const who = await actor([grant("updates.read"), grant("updates.execute")], true);
  for (const body of [
    { ...urls(), assetUrl: "http://127.0.0.1/private" },
    { ...urls(), assetUrl: urls().assetUrl.replace("github.com", "github.com.evil.invalid") },
    { ...urls(), assetUrl: urls().assetUrl.replace("jorgerojas26/dmmarket", "other/project") },
    { ...urls(), assetUrl: urls().assetUrl.replace("https://", "https://user:password@") },
    { ...urls(), assetUrl: `${urls().assetUrl}?redirect=evil` },
    { ...urls(), sha256AssetUrl: urls("v998.0.0").sha256AssetUrl },
    urls("v0.0.1"),
  ])
    expect((await who.client.request("/api/update/download", { method: "POST", body })).status).toBe(400);
});

test("CSRF, confirmación y autenticación reciente se exigen en cada solicitud", async () => {
  const who = await actor([grant("updates.read"), grant("updates.execute")], true);
  expect((await who.client.request("/api/update/download", { method: "POST", body: urls(), csrf: "bad" })).status).toBe(
    403,
  );
  expect((await who.client.request("/api/update/apply", { method: "POST", body: { confirmed: false } })).status).toBe(
    400,
  );
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", who.user.id)
    .update({ password_ms: Date.now() - 300001 });
  expect((await who.client.request("/api/update/download", { method: "POST", body: urls() })).status).toBe(403);
  expect((await who.client.request("/api/update/history?token=1")).status).toBe(400);
});
