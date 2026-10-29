const { randomUUID, randomBytes } = require("node:crypto");
const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const migration = backend("./migrations/20261102_add_user_mfa_requirement");
const ownerPermissions = ["access.users", "access.roles", "access.links", "access.recover"].map((capability) => ({
  capability,
  scope: "global",
}));
let environment;

async function signIn(user) {
  const client = environment.client();
  expect((await client.login(user)).body.stage).toBe("ready");
  return client;
}

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
});
afterAll(async () => {
  await environment?.close();
});

test("roles sensibles no obligan MFA y la reautenticación acepta solo contraseña", async () => {
  const user = await environment.seedUser({ permissions: ownerPermissions });
  const client = await signIn(user);
  const status = (await client.request("/api/auth/session")).body;
  expect(status.mfaEnabled).toBe(false);
  expect(status.mfaRequired).toBe(false);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .update({ password_ms: Date.now() - 300001 });
  const input = { name: randomUUID(), permissions: [] };
  const denied = await client.request("/api/auth/roles", { method: "POST", body: input });
  expect(denied.body.error.code).toBe("RECENT_AUTH_REQUIRED");
  expect(
    (await client.request("/api/auth/reauthenticate", { method: "POST", body: { password: "incorrecta" } })).status,
  ).toBe(401);
  expect(
    (await client.request("/api/auth/reauthenticate", { method: "POST", body: { password: user.password } })).status,
  ).toBe(200);
  expect((await client.request("/api/auth/roles", { method: "POST", body: input })).status).toBe(201);
});

test.each([false, true])(
  "el alta guarda MFA requerido=%s y aplica la política tras cambiar contraseña",
  async (mfaRequired) => {
    const owner = await environment.seedUser({ permissions: ownerPermissions });
    const admin = await signIn(owner);
    const role = await environment.db("dmmarket_auth_user_roles").where("user_id", owner.id).first();
    const created = await admin.request("/api/auth/users", {
      method: "POST",
      body: {
        username: `policy-${randomUUID().slice(0, 8)}`,
        displayName: "Ana",
        roleIds: [role.role_id],
        mfaRequired,
      },
    });
    expect(created.status).toBe(201);
    const user = await environment.db("dmmarket_auth_users").where("id", created.body.id).first();
    expect(Boolean(user.mfa_required)).toBe(mfaRequired);
    const client = environment.client();
    expect((await client.login({ username: user.username, password: created.body.temporaryPassword })).body.stage).toBe(
      "password",
    );
    const password = randomBytes(24).toString("base64url");
    const changed = await client.request("/api/auth/password", {
      method: "POST",
      body: { currentPassword: created.body.temporaryPassword, newPassword: password },
    });
    expect(changed.body.stage).toBe(mfaRequired ? "mfa-enrollment" : "ready");
    if (mfaRequired) {
      expect((await client.request("/api/auth/users")).status).toBe(403);
      const enrollment = await client.request("/api/auth/mfa/enrollment", { method: "POST", body: { password } });
      const secret = new URL(enrollment.body.uri).searchParams.get("secret");
      expect(
        (
          await client.request("/api/auth/mfa/enrollment/confirm", {
            method: "POST",
            body: { token: await environment.token(secret) },
          })
        ).body.stage,
      ).toBe("ready");
      expect(
        (await client.request("/api/auth/mfa/disable", { method: "POST", body: { password, token: "000000" } })).status,
      ).toBe(403);
      await client.request("/api/auth/logout", { method: "POST", body: {} });
      expect((await client.login({ username: user.username, password })).body.stage).toBe("mfa");
    } else expect((await client.request("/api/auth/users")).status).toBe(200);
  },
);

test("el alta omite MFA por defecto y rechaza valores no booleanos sin crear cuentas", async () => {
  const owner = await environment.seedUser({ permissions: ownerPermissions });
  const client = await signIn(owner);
  const role = await environment.db("dmmarket_auth_user_roles").where("user_id", owner.id).first();
  for (const mfaRequired of ["false", 1, null]) {
    const username = `invalid-${randomUUID().slice(0, 8)}`;
    expect(
      (
        await client.request("/api/auth/users", {
          method: "POST",
          body: { username, displayName: "Ana", roleIds: [role.role_id], mfaRequired },
        })
      ).status,
    ).toBe(400);
    expect(await environment.db("dmmarket_auth_users").where({ username })).toHaveLength(0);
  }
  const result = await client.request("/api/auth/users", {
    method: "POST",
    body: { username: `default-${randomUUID().slice(0, 8)}`, displayName: "Ana", roleIds: [role.role_id] },
  });
  expect(result.status).toBe(201);
  expect(Boolean((await environment.db("dmmarket_auth_users").where("id", result.body.id).first()).mfa_required)).toBe(
    false,
  );
});

test("MFA voluntario se puede activar y desactivar con contraseña y código sin perder permisos", async () => {
  const user = await environment.seedUser({ permissions: ownerPermissions });
  const client = await signIn(user);
  const enrollment = await client.request("/api/auth/mfa/enrollment", {
    method: "POST",
    body: { password: user.password },
  });
  expect(enrollment.status).toBe(200);
  const secret = new URL(enrollment.body.uri).searchParams.get("secret");
  const confirmed = await client.request("/api/auth/mfa/enrollment/confirm", {
    method: "POST",
    body: { token: await environment.token(secret) },
  });
  expect(confirmed.body.mfaEnabled).toBe(true);
  expect(confirmed.body.mfaRequired).toBe(false);
  expect(
    (
      await client.request("/api/auth/mfa/disable", {
        method: "POST",
        body: { password: user.password, token: "invalid" },
      })
    ).status,
  ).toBe(401);
  const lastStep = Number((await environment.db("dmmarket_auth_users").where("id", user.id).first()).mfa_last_step);
  while (Math.floor(Date.now() / 30000) <= lastStep) await new Promise((resolve) => setTimeout(resolve, 200));
  const disabled = await client.request("/api/auth/mfa/disable", {
    method: "POST",
    body: { password: user.password, token: await environment.token(secret) },
  });
  expect(disabled.body.stage).toBe("ready");
  expect(disabled.body.mfaEnabled).toBe(false);
  expect((await client.request("/api/auth/users")).status).toBe(200);
  const stored = await environment.db("dmmarket_auth_users").where("id", user.id).first();
  expect(stored.mfa_secret).toBeNull();
  expect(stored.mfa_last_step).toBeNull();
  expect(
    await environment.db("dmmarket_auth_events").where({ target_user_id: user.id, action: "auth.mfa_disabled" }),
  ).toHaveLength(1);
});

test("migración es idempotente, inicia sin obligación y conserva secretos y sesiones existentes", async () => {
  const user = await environment.seedUser({ enrolled: true });
  const before = await environment.db("dmmarket_auth_users").where("id", user.id).first();
  await migration.up(environment.db);
  await migration.up(environment.db);
  expect(await environment.db("dmmarket_auth_users").where("id", user.id).first()).toEqual(before);
  expect(Boolean(before.mfa_required)).toBe(false);
});
