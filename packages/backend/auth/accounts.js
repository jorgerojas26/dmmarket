const { randomUUID } = require("node:crypto");
const { hashPassword, createTemporaryPassword } = require("./passwords");
const { isLocalSource, initialSetupState } = require("./initial-setup");
const { validateGrants } = require("./capabilities");
const {
  assertAuthSchema,
  lockAccessMutation,
  appendEvent,
  invalidateUser,
  assertAdministratorRemains,
  validateReason,
} = require("./identity");

const TEMPORARY_MS = 30 * 60 * 1000;
const OWNER_CAPABILITIES = ["access.users", "access.roles", "access.links", "access.recover"];

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function accountNames(username, displayName) {
  if (typeof username !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(username)) fail(400, "El usuario no es válido.");
  if (
    typeof displayName !== "string" ||
    !displayName.trim() ||
    displayName.trim().length > 128 ||
    /[\p{Cc}\p{Cs}\u{10000}-\u{10FFFF}]/u.test(displayName)
  )
    fail(400, "El nombre no es válido.");
  return { username: username.toLowerCase(), display_name: displayName.trim() };
}

async function temporaryCredential(now) {
  const temporaryPassword = createTemporaryPassword();
  return { temporaryPassword, passwordHash: await hashPassword(temporaryPassword), expiresAtMs: now + TEMPORARY_MS };
}

async function createAccountService({ db, sessions, now = Date.now }) {
  await assertAuthSchema(db);

  function time() {
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("El reloj del servidor no es válido.");
    return value;
  }

  async function audit(connection, actorId, targetId, action, reason) {
    await appendEvent(connection, { actorId, targetId, action, reason, occurredMs: time() });
  }

  async function rolesExist(connection, roleIds) {
    if (
      !Array.isArray(roleIds) ||
      roleIds.length > 100 ||
      roleIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9-]{1,36}$/.test(id))
    )
      fail(400, "La selección de roles no es válida.");
    const ids = [...new Set(roleIds)];
    if (ids.length) {
      const rows = await connection("dmmarket_auth_roles").whereIn("id", ids);
      if (rows.length !== ids.length) fail(400, "Uno de los roles no está disponible.");
      validateGrants(
        await connection("dmmarket_auth_role_permissions").whereIn("role_id", ids).select("capability", "scope"),
      );
    }
    return ids;
  }

  async function administrator(sid, capability, work) {
    if (!sessions) fail(503, "La administración web no está disponible.");
    return sessions.withSession(sid, { recent: true, accessMutation: true }, async (context) => {
      if (!context.access.hasGlobal(capability)) fail(403, "Acceso no permitido.");
      return work(context.transaction, context.user.id, context.access);
    });
  }

  async function targetUser(connection, id) {
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,36}$/.test(id)) fail(400, "La cuenta no es válida.");
    const user = await connection("dmmarket_auth_users").where("id", id).forUpdate().first();
    if (!user) fail(404, "La cuenta no está disponible.");
    return user;
  }

  async function reset(connection, user, actorId, resetMfa, reason, local = false) {
    const credential = await temporaryCredential(time());
    await connection("dmmarket_auth_users")
      .where("id", user.id)
      .update({
        password_hash: credential.passwordHash,
        must_change_password: true,
        temporary_expires_ms: credential.expiresAtMs,
        temporary_consumed: false,
        ...(resetMfa ? { mfa_secret: null, mfa_last_step: null } : {}),
      });
    await invalidateUser(connection, user.id, time(), "credentials-reset");
    if (!local) await assertAdministratorRemains(connection);
    await audit(
      connection,
      actorId,
      user.id,
      local ? "auth.local_recovery" : resetMfa ? "auth.credentials_mfa_reset" : "auth.credentials_reset",
      reason,
    );
    return {
      id: user.id,
      username: user.username,
      temporaryPassword: credential.temporaryPassword,
      expiresAtMs: credential.expiresAtMs,
    };
  }

  async function recoveryRole(connection) {
    const id = randomUUID();
    await connection("dmmarket_auth_roles").insert({ id, name: `local-recovery-${id}` });
    await connection("dmmarket_auth_role_permissions").insert(
      OWNER_CAPABILITIES.map((capability) => ({ role_id: id, capability, scope: "global" })),
    );
    return id;
  }

  return Object.freeze({
    initialState(source) {
      return initialSetupState(db, source);
    },
    async createInitialUser({ username, displayName, password, confirmation }, source) {
      if (!isLocalSource(source)) fail(403, "El primer administrador se crea desde el servidor.");
      const names = accountNames(username, displayName);
      if (typeof password !== "string" || password !== confirmation) fail(400, "Las contraseñas no coinciden.");
      return db.transaction(async (connection) => {
        await lockAccessMutation(connection);
        const control = await connection("dmmarket_auth_control").where("id", 1).first("first_setup");
        const existing = Number((await connection("dmmarket_auth_users").count("* as total").first()).total);
        if (control.first_setup !== "pending" || existing) fail(409, "La creación inicial ya no está disponible.");
        const passwordHash = await hashPassword(password);
        const id = randomUUID();
        await connection("dmmarket_auth_users").insert({
          id,
          ...names,
          password_hash: passwordHash,
          must_change_password: false,
          temporary_expires_ms: null,
        });
        const roleId = await recoveryRole(connection);
        await connection("dmmarket_auth_user_roles").insert({ user_id: id, role_id: roleId });
        await connection("dmmarket_auth_control").where("id", 1).update({ first_setup: "closed" });
        await audit(connection, id, id, "auth.initial_administrator_created", "server-local-initialization");
        return { id, username: names.username };
      });
    },
    async createUser(sid, { username, displayName, roleIds = [], reason }) {
      const names = accountNames(username, displayName);
      const motive = validateReason(reason);
      return administrator(sid, "access.users", async (connection, actorId, access) => {
        const roles = await rolesExist(connection, roleIds);
        if (roles.length && !access.hasGlobal("access.roles")) fail(403, "Acceso no permitido.");
        if (await connection("dmmarket_auth_users").where("username", names.username).first())
          fail(409, "El usuario ya existe.");
        const credential = await temporaryCredential(time());
        const id = randomUUID();
        await connection("dmmarket_auth_users").insert({
          id,
          ...names,
          password_hash: credential.passwordHash,
          temporary_expires_ms: credential.expiresAtMs,
        });
        if (roles.length)
          await connection("dmmarket_auth_user_roles").insert(
            roles.map((roleId) => ({ user_id: id, role_id: roleId })),
          );
        await audit(connection, actorId, id, "auth.user_created", motive);
        return {
          id,
          username: names.username,
          temporaryPassword: credential.temporaryPassword,
          expiresAtMs: credential.expiresAtMs,
        };
      });
    },
    async setEnabled(sid, id, enabled, reason) {
      if (typeof enabled !== "boolean") fail(400, "El estado de cuenta no es válido.");
      const motive = validateReason(reason);
      return administrator(sid, "access.users", async (connection, actorId) => {
        await targetUser(connection, id);
        await connection("dmmarket_auth_users").where("id", id).update({ enabled });
        await invalidateUser(connection, id, time(), "account-status");
        if (!enabled) await assertAdministratorRemains(connection);
        await audit(connection, actorId, id, enabled ? "auth.user_enabled" : "auth.user_disabled", motive);
        return { id, enabled };
      });
    },
    async resetCredentials(sid, id, { resetMfa = false, reason }) {
      if (typeof resetMfa !== "boolean") fail(400, "La recuperación MFA no es válida.");
      const motive = validateReason(reason);
      return administrator(sid, "access.recover", async (connection, actorId) =>
        reset(connection, await targetUser(connection, id), actorId, resetMfa, motive),
      );
    },
    async recoverLocally({ mode, username, displayName, reason }) {
      if (!["bootstrap", "recover"].includes(mode)) fail(400, "El modo de recuperación no es válido.");
      const motive = validateReason(reason);
      const normalized = accountNames(username, mode === "bootstrap" ? displayName : username);
      return db.transaction(async (connection) => {
        await lockAccessMutation(connection);
        if (mode === "bootstrap") {
          const existing = await connection("dmmarket_auth_users").count("* as total").first();
          if (Number(existing.total) !== 0) fail(409, "Ya hay cuentas; usa recuperación explícita.");
          const credential = await temporaryCredential(time());
          const id = randomUUID();
          await connection("dmmarket_auth_users").insert({
            id,
            ...normalized,
            password_hash: credential.passwordHash,
            temporary_expires_ms: credential.expiresAtMs,
          });
          const roleId = await recoveryRole(connection);
          await connection("dmmarket_auth_user_roles").insert({ user_id: id, role_id: roleId });
          await connection("dmmarket_auth_control").where("id", 1).update({ first_setup: "closed" });
          await audit(connection, null, id, "auth.local_bootstrap", motive);
          return {
            id,
            username: normalized.username,
            temporaryPassword: credential.temporaryPassword,
            expiresAtMs: credential.expiresAtMs,
          };
        }
        const user = await connection("dmmarket_auth_users").where("username", normalized.username).forUpdate().first();
        if (!user) fail(404, "La cuenta no está disponible.");
        const roleId = await recoveryRole(connection);
        const link = await connection("dmmarket_auth_user_roles").where({ user_id: user.id, role_id: roleId }).first();
        if (!link) await connection("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: roleId });
        await connection("dmmarket_auth_users").where("id", user.id).update({ enabled: true });
        await connection("dmmarket_auth_control").where("id", 1).update({ first_setup: "closed" });
        return reset(connection, user, null, true, motive, true);
      });
    },
  });
}

module.exports = { createAccountService };
