const crypto = require("node:crypto");
const http = require("node:http");
const { startDriveOAuth } = require("../drive-oauth");
const { SCOPE } = require("../drive-client");

let session;
afterEach(() => session?.close());

it("uses a loopback callback, offline consent and PKCE, rejects forged state, and consumes the code once", async () => {
  const complete = jest.fn().mockResolvedValue(undefined);
  const failed = jest.fn();
  session = await startDriveOAuth({ client: { clientId: "client" }, complete, failed });
  const url = new URL(session.authorizationUrl);
  const parameters = url.searchParams;
  expect(url.origin).toBe("https://accounts.google.com");
  expect(parameters.get("scope")).toBe(SCOPE);
  expect(parameters.get("access_type")).toBe("offline");
  const callback = new URL(parameters.get("redirect_uri"));
  expect(callback.hostname).toBe("127.0.0.1");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", "forged");
  expect((await fetch(callback)).status).toBe(400);
  expect(complete).not.toHaveBeenCalled();
  callback.searchParams.set("state", parameters.get("state"));
  const response = await fetch(callback);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Cuenta conectada");
  const data = complete.mock.calls[0][0];
  expect(data.code).toBe("authorization-code");
  expect(crypto.createHash("sha256").update(data.verifier).digest("base64url")).toBe(parameters.get("code_challenge"));
  expect(complete).toHaveBeenCalledTimes(1);
  expect(failed).not.toHaveBeenCalled();
});

it("reports a denied consent without exposing codes or raw Google errors", async () => {
  const complete = jest.fn();
  const failed = jest.fn();
  session = await startDriveOAuth({ client: { clientId: "client" }, complete, failed });
  const params = new URL(session.authorizationUrl).searchParams;
  const callback = new URL(params.get("redirect_uri"));
  callback.searchParams.set("state", params.get("state"));
  callback.searchParams.set("error", "access_denied");
  expect((await fetch(callback)).status).toBe(400);
  expect(complete).not.toHaveBeenCalled();
  expect(failed.mock.calls[0][0].message).toMatch(/No se autorizó/);
});

it("rejects a forged Host header even with the correct OAuth state", async () => {
  const complete = jest.fn();
  session = await startDriveOAuth({ client: { clientId: "client" }, complete, failed: jest.fn() });
  const params = new URL(session.authorizationUrl).searchParams;
  const callback = new URL(params.get("redirect_uri"));
  callback.searchParams.set("state", params.get("state"));
  callback.searchParams.set("code", "code");
  const status = await new Promise((resolve, reject) => {
    http
      .get(callback, { headers: { Host: "evil.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
      .on("error", reject);
  });
  expect(status).toBe(404);
  expect(complete).not.toHaveBeenCalled();
});

it("expires abandoned authorizations and closes the callback listener", async () => {
  let resolve;
  const expired = new Promise((done) => {
    resolve = done;
  });
  const failed = jest.fn(resolve);
  session = await startDriveOAuth({ client: { clientId: "client" }, complete: jest.fn(), failed, timeoutMs: 20 });
  await expired;
  expect(failed.mock.calls[0][0].message).toMatch(/expiró/);
});
