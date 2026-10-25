const fs = require("node:fs");
const path = require("node:path");
const { startEnvironment, until } = require("../../../tests/support/auth-environment.cjs");
const { buildNativeServer } = require("../../../tests/support/native-server.cjs");
let binary;
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
  return { client, user };
}
async function release(client) {
  const result = await client.request("/api/update/check", { method: "POST", body: {} });
  expect(result.status).toBe(200);
  return { confirmed: true, assetUrl: result.body.assetUrl, sha256AssetUrl: result.body.sha256AssetUrl };
}
beforeAll(() => {
  binary = buildNativeServer();
});
afterAll(() => {
  binary?.close();
});
afterEach(async () => {
  await environment?.close();
  environment = null;
});

test("ejecutable real mantiene guardas de lectura, ejecución y archivos fuera de privilegios", async () => {
  environment = await startEnvironment({
    web: true,
    service: true,
    executablePath: binary.executablePath,
    updateSource: { executablePath: binary.executablePath },
  });
  const who = await actor([grant("updates.read")]);
  expect((await who.client.request("/api/update/status")).body.standalone).toBe(true);
  const body = await release(who.client);
  expect((await who.client.request("/api/update/download", { method: "POST", body })).status).toBe(403);
  expect((await who.client.request("/api/update/apply", { method: "POST", body: { confirmed: true } })).status).toBe(
    403,
  );
  expect(fs.existsSync(path.join(environment.directory, ".dmmarket-update"))).toBe(false);
}, 120000);

test("hash incorrecto elimina la descarga incompleta y nunca deja binario aplicable", async () => {
  environment = await startEnvironment({
    web: true,
    service: true,
    executablePath: binary.executablePath,
    updateSource: { executablePath: binary.executablePath, corruptHash: true },
  });
  const who = await actor([grant("updates.read"), grant("updates.execute")], true);
  const body = await release(who.client);
  expect((await who.client.request("/api/update/download", { method: "POST", body })).status).toBe(500);
  const next = path.join(
    environment.directory,
    ".dmmarket-update",
    process.platform === "win32" ? "new.exe" : "new-app",
  );
  expect(fs.existsSync(next)).toBe(false);
  expect(fs.existsSync(`${next}.tmp`)).toBe(false);
  expect((await who.client.request("/api/update/apply", { method: "POST", body: { confirmed: true } })).status).toBe(
    400,
  );
  expect(environment.server.exitCode).toBeNull();
}, 120000);

test("descarga verificada reemplaza sólo ejecutable temporal y conserva sesión autorizada al reiniciar", async () => {
  environment = await startEnvironment({
    web: true,
    service: true,
    executablePath: binary.executablePath,
    updateSource: { executablePath: binary.executablePath },
  });
  const who = await actor([grant("updates.read"), grant("updates.execute")], true);
  const before = fs.statSync(binary.executablePath).ino;
  const body = await release(who.client);
  expect((await who.client.request("/api/update/download", { method: "POST", body })).status).toBe(200);
  const next = path.join(
    environment.directory,
    ".dmmarket-update",
    process.platform === "win32" ? "new.exe" : "new-app",
  );
  expect(fs.existsSync(next)).toBe(true);
  const response = await who.client.request("/api/update/apply", { method: "POST", body: { confirmed: true } });
  expect(response.status).toBe(200);
  await until(() => environment.server.exitCode === 0);
  expect(fs.existsSync(next)).toBe(false);
  if (process.platform !== "win32") expect(fs.statSync(binary.executablePath).ino).not.toBe(before);
  await environment.restartServer();
  const session = await who.client.request("/api/auth/session");
  expect(session.status).toBe(200);
  expect(session.body.stage).toBe("ready");
  expect(session.body.user.id).toBe(who.user.id);
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ actor_id: who.user.id, action: "updates.apply_requested" })
      .first(),
  ).toBeTruthy();
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ actor_id: who.user.id, action: "updates.apply_completed", outcome: "success" })
      .first(),
  ).toBeTruthy();
}, 120000);
