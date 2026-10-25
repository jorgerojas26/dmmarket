const { createHash, randomBytes } = require("node:crypto");
const { assertAuthSchema, lockAccessMutation, accessFor, appendEvent, invalidateUser } = require("./identity");
const { hashPassword, verifyPassword } = require("./passwords");
const { normalizeSource } = require("./attempts");
const { ABSOLUTE_SESSION_MS, IDLE_SESSION_MS, RECENT_AUTH_MS } = require("./http-security");

const MAX_CREDENTIAL_REQUESTS = 8;
let activeCredentialRequests = 0;

function sessionHash(sid) {
  if (typeof sid !== "string" || !/^[a-zA-Z0-9_-]{32,128}$/.test(sid)) return null;
  return createHash("sha256").update(sid).digest("hex");
}

function denied(status = 401, code) {
  return {
    error: {
      status,
      ...(code ? { code } : {}),
      message: status === 401 ? "La sesión o las credenciales no son válidas." : "Acceso no permitido.",
    },
  };
}

function unwrap(result) {
  if (result.error) {
    const error = new Error(result.error.message);
    error.status = result.error.status;
    if (result.error.code) error.code = result.error.code;
    throw error;
  }
  return result.value;
}

async function createSessionService({ db, mfa, attempts, now = Date.now }) {
  if (!mfa || typeof mfa.verifyToken !== "function") throw new TypeError("Se requiere el verificador MFA.");
  if (!attempts || typeof attempts.consume !== "function")
    throw new TypeError("Se requieren límites persistentes de acceso.");
  await assertAuthSchema(db);
  const dummyHash = await hashPassword(randomBytes(32).toString("base64url"));

  function time() {
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("El reloj del servidor no es válido.");
    return value;
  }

  async function event(connection, { actorId = null, targetId = null, action, outcome = "success", reason = null }) {
    await appendEvent(connection, { actorId, targetId, action, outcome, reason, occurredMs: time() });
  }

  function stageFor(user, state, access) {
    if (Number(user.must_change_password) === 1) return "password";
    if (access.privileged && !user.mfa_secret) return "mfa-enrollment";
    if ((access.privileged || user.mfa_secret) && state.mfa_ms === null) return "mfa";
    return "ready";
  }

  async function revoke(connection, state, reason, actorId = null) {
    const changed = await connection("dmmarket_auth_session_state")
      .where("sid_hash", state.sid_hash)
      .whereNull("revoked_ms")
      .update({
        revoked_ms: time(),
        revocation_reason: reason,
        pending_mfa_secret: null,
        pending_mfa_expires_ms: null,
      });
    if (changed) {
      await event(connection, { actorId, targetId: state.user_id, action: "auth.session_revoked", reason });
    }
  }

  async function lockSession(connection, hash, userId, includeAccess = true) {
    const user = await connection("dmmarket_auth_users").where("id", userId).forUpdate().first();
    const state = await connection("dmmarket_auth_session_state").where("sid_hash", hash).forUpdate().first();
    if (!user || !state || state.user_id !== user.id || state.revoked_ms !== null) return null;
    const current = time();
    const timestamps = [state.authenticated_ms, state.activity_ms, state.password_ms, state.mfa_ms]
      .filter((value) => value !== null)
      .map(Number);
    let reason;
    if (Number(user.enabled) !== 1 || Number(user.session_version) !== Number(state.session_version)) {
      reason = "account-changed";
    } else if (timestamps.some((value) => !Number.isSafeInteger(value) || value <= 0 || value > current)) {
      reason = "invalid-clock";
    } else if (current - Number(state.authenticated_ms) >= ABSOLUTE_SESSION_MS) {
      reason = "absolute-expiry";
    } else if (current - Number(state.activity_ms) >= IDLE_SESSION_MS) {
      reason = "idle-expiry";
    } else if (
      Number(user.must_change_password) === 1 &&
      user.temporary_expires_ms !== null &&
      current >= Number(user.temporary_expires_ms)
    ) {
      reason = "temporary-expiry";
    }
    if (reason) {
      await revoke(connection, state, reason);
      return null;
    }
    if (!includeAccess) return { user, state };
    const access = await accessFor(connection, user.id);
    return { user, state, access, stage: stageFor(user, state, access) };
  }

  async function useSession(sid, work, accessMutation = false, source = null) {
    const hash = sessionHash(sid);
    const reference = hash
      ? await db("dmmarket_auth_session_state").where("sid_hash", hash).select("user_id").first()
      : null;
    if (source !== null)
      await attempts.consume({
        source,
        account: reference ? `user:${reference.user_id}` : null,
        targetUserId: reference?.user_id || null,
      });
    if (!reference) return unwrap(denied());
    const result = await db.transaction(async (connection) => {
      if (accessMutation) await lockAccessMutation(connection);
      const context = await lockSession(connection, hash, reference.user_id);
      if (!context) return denied();
      const result = await work(connection, context);
      if (!result.error) {
        const current = time();
        const state = context.state;
        const future = [state.authenticated_ms, state.activity_ms, state.password_ms, state.mfa_ms]
          .filter((value) => value !== null)
          .some((value) => Number(value) > current);
        if (
          future ||
          current - Number(state.authenticated_ms) >= ABSOLUTE_SESSION_MS ||
          current - Number(state.activity_ms) >= IDLE_SESSION_MS ||
          (Number(context.user.must_change_password) === 1 &&
            context.user.temporary_expires_ms !== null &&
            current >= Number(context.user.temporary_expires_ms))
        )
          return unwrap(denied());
      }
      return result;
    });
    return unwrap(result);
  }

  async function consumeMfa(connection, context, token) {
    const result = await mfa.verifyToken({
      userId: context.user.id,
      encryptedSecret: context.user.mfa_secret,
      token,
      lastUsedTimeStep: context.user.mfa_last_step === null ? null : Number(context.user.mfa_last_step),
    });
    if (!result.valid) return false;
    await connection("dmmarket_auth_users").where("id", context.user.id).update({ mfa_last_step: result.timeStep });
    await connection("dmmarket_auth_session_state")
      .where("sid_hash", context.state.sid_hash)
      .update({ mfa_ms: time() });
    context.state.mfa_ms = time();
    return true;
  }

  async function rotateSession(connection, context, newSid, reason, passwordMs, mfaMs) {
    const hash = sessionHash(newSid);
    if (!hash || hash === context.state.sid_hash) return unwrap(denied(400));
    const current = time();
    const version = await invalidateUser(connection, context.user.id, current, reason);
    const state = {
      sid_hash: hash,
      user_id: context.user.id,
      session_version: version,
      authenticated_ms: context.state.authenticated_ms,
      activity_ms: current,
      password_ms: passwordMs,
      mfa_ms: mfaMs,
      revoked_ms: null,
    };
    await connection("dmmarket_auth_session_state").insert(state);
    const user = await connection("dmmarket_auth_users").where("id", context.user.id).first();
    context.user = user;
    context.state = state;
    await event(connection, { actorId: user.id, targetId: user.id, action: reason });
    return { value: publicContext({ user, access: context.access, stage: stageFor(user, state, context.access) }) };
  }

  function publicContext(context) {
    return {
      user: { id: context.user.id, username: context.user.username, displayName: context.user.display_name },
      revision: Number(context.user.session_version),
      mfaEnabled: Boolean(context.user.mfa_secret),
      stage: context.stage,
      access: context.access,
    };
  }

  const service = {
    async login({ sid, username, password }, source) {
      const address = normalizeSource(source);
      const hash = sessionHash(sid);
      if (!hash) return unwrap(denied());
      const normalized =
        typeof username === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(username) ? username.toLowerCase() : null;
      const before = normalized ? await db("dmmarket_auth_users").where("username", normalized).first() : null;
      await attempts.consume({
        source: address,
        account: before ? `user:${before.id}` : `login:${normalized || "invalid"}`,
        targetUserId: before?.id || null,
      });
      const matches = await verifyPassword(password, before?.password_hash || dummyHash);
      return unwrap(
        await db.transaction(async (connection) => {
          const user = before
            ? await connection("dmmarket_auth_users").where("id", before.id).forUpdate().first()
            : null;
          const current = time();
          if (
            !matches ||
            !user ||
            Number(user.enabled) !== 1 ||
            user.password_hash !== before.password_hash ||
            user.session_version !== before.session_version ||
            (user.temporary_expires_ms !== null &&
              (Number(user.temporary_consumed) === 1 || current >= Number(user.temporary_expires_ms)))
          ) {
            await event(connection, { targetId: user?.id || null, action: "auth.login_failed", outcome: "failure" });
            return denied();
          }
          const state = {
            sid_hash: hash,
            user_id: user.id,
            session_version: user.session_version,
            authenticated_ms: current,
            activity_ms: current,
            password_ms: current,
            mfa_ms: null,
            revoked_ms: null,
          };
          await connection("dmmarket_auth_session_state").insert(state);
          if (user.temporary_expires_ms !== null) {
            await connection("dmmarket_auth_users").where("id", user.id).update({ temporary_consumed: true });
          }
          const access = await accessFor(connection, user.id);
          const stage = stageFor(user, state, access);
          await event(connection, {
            actorId: user.id,
            targetId: user.id,
            action: "auth.login_succeeded",
            reason: stage,
          });
          return { value: publicContext({ user, access, stage }) };
        }),
      );
    },
    async status(sid) {
      return useSession(sid, async (_connection, context) => ({ value: publicContext(context) }));
    },
    async withSession(
      sid,
      { activity = false, recent = false, accessMutation = false } = {},
      work = async ({ user, stage, access }) => ({ user, stage, access }),
    ) {
      return useSession(
        sid,
        async (connection, context) => {
          if (context.stage !== "ready") return denied(403);
          const current = time();
          if (
            recent &&
            (current - Number(context.state.password_ms) >= RECENT_AUTH_MS ||
              ((context.access.privileged || context.user.mfa_secret) &&
                (context.state.mfa_ms === null || current - Number(context.state.mfa_ms) >= RECENT_AUTH_MS)))
          )
            return denied(403, "RECENT_AUTH_REQUIRED");
          if (activity) {
            await connection("dmmarket_auth_session_state")
              .where("sid_hash", context.state.sid_hash)
              .update({ activity_ms: current });
          }
          if (activity) context.state.activity_ms = current;
          const value = await work({ ...publicContext(context), transaction: connection });
          if (
            recent &&
            (time() - Number(context.state.password_ms) >= RECENT_AUTH_MS ||
              ((context.access.privileged || context.user.mfa_secret) &&
                (context.state.mfa_ms === null || time() - Number(context.state.mfa_ms) >= RECENT_AUTH_MS)))
          )
            return unwrap(denied(403, "RECENT_AUTH_REQUIRED"));
          return { value };
        },
        accessMutation,
      );
    },
    async changePassword(sid, { currentPassword, newPassword, token, newSid } = {}, source) {
      if (!sessionHash(newSid) || newSid === sid) return unwrap(denied(400));
      return useSession(
        sid,
        async (connection, context) => {
          if (!["password", "ready"].includes(context.stage)) return denied(403);
          if (!(await verifyPassword(currentPassword, context.user.password_hash))) {
            await event(connection, {
              targetId: context.user.id,
              action: "auth.password_change_failed",
              outcome: "failure",
            });
            return denied();
          }
          if (await verifyPassword(newPassword, context.user.password_hash)) return denied(400);
          if (context.stage === "ready" && context.user.mfa_secret && !(await consumeMfa(connection, context, token))) {
            await event(connection, {
              targetId: context.user.id,
              action: "auth.password_change_failed",
              outcome: "failure",
            });
            return denied();
          }
          const encoded = await hashPassword(newPassword);
          await connection("dmmarket_auth_users").where("id", context.user.id).update({
            password_hash: encoded,
            must_change_password: false,
            temporary_expires_ms: null,
            temporary_consumed: false,
          });
          return rotateSession(
            connection,
            context,
            newSid,
            "auth.password_changed",
            time(),
            context.stage === "ready" && context.user.mfa_secret ? time() : null,
          );
        },
        true,
        normalizeSource(source),
      );
    },
    async beginMfaEnrollment(sid, password, source) {
      return useSession(
        sid,
        async (connection, context) => {
          if (context.stage !== "mfa-enrollment" || context.user.mfa_secret) return denied(403);
          if (!(await verifyPassword(password, context.user.password_hash))) {
            await event(connection, {
              targetId: context.user.id,
              action: "auth.enrollment_failed",
              outcome: "failure",
            });
            return denied();
          }
          const enrollment = await mfa.createEnrollment(context.user.id, context.user.username);
          const current = time();
          await connection("dmmarket_auth_session_state")
            .where("sid_hash", context.state.sid_hash)
            .update({
              pending_mfa_secret: enrollment.encryptedSecret,
              pending_mfa_expires_ms: current + RECENT_AUTH_MS,
              password_ms: current,
              activity_ms: current,
            });
          await event(connection, {
            actorId: context.user.id,
            targetId: context.user.id,
            action: "auth.enrollment_started",
          });
          context.state.activity_ms = current;
          context.state.password_ms = current;
          return { value: { uri: enrollment.uri, expiresAtMs: current + RECENT_AUTH_MS } };
        },
        true,
        normalizeSource(source),
      );
    },
    async finishMfaEnrollment(sid, { token, newSid } = {}, source) {
      if (!sessionHash(newSid) || newSid === sid) return unwrap(denied(400));
      return useSession(
        sid,
        async (connection, context) => {
          const current = time();
          if (
            context.stage !== "mfa-enrollment" ||
            context.user.mfa_secret ||
            !context.state.pending_mfa_secret ||
            !Number.isSafeInteger(Number(context.state.pending_mfa_expires_ms)) ||
            Number(context.state.pending_mfa_expires_ms) <= current ||
            current - Number(context.state.password_ms) >= RECENT_AUTH_MS
          )
            return denied(403);
          const checked = await mfa.verifyToken({
            userId: context.user.id,
            encryptedSecret: context.state.pending_mfa_secret,
            token,
            lastUsedTimeStep: null,
          });
          if (!checked.valid) {
            await event(connection, {
              targetId: context.user.id,
              action: "auth.enrollment_failed",
              outcome: "failure",
            });
            return denied();
          }
          await connection("dmmarket_auth_users").where("id", context.user.id).update({
            mfa_secret: context.state.pending_mfa_secret,
            mfa_last_step: checked.timeStep,
          });
          return rotateSession(connection, context, newSid, "auth.mfa_enrolled", context.state.password_ms, current);
        },
        true,
        normalizeSource(source),
      );
    },
    async verifyMfa(sid, token, source) {
      return useSession(
        sid,
        async (connection, context) => {
          if (!["mfa", "ready"].includes(context.stage) || !context.user.mfa_secret) return denied(403);
          if (!(await consumeMfa(connection, context, token))) {
            await event(connection, { targetId: context.user.id, action: "auth.mfa_failed", outcome: "failure" });
            return denied();
          }
          const current = time();
          await connection("dmmarket_auth_session_state")
            .where("sid_hash", context.state.sid_hash)
            .update({ mfa_ms: current, activity_ms: current });
          await event(connection, { actorId: context.user.id, targetId: context.user.id, action: "auth.mfa_verified" });
          context.state.activity_ms = current;
          context.state.mfa_ms = current;
          return { value: { stage: "ready" } };
        },
        false,
        normalizeSource(source),
      );
    },
    async reauthenticate(sid, { password, token }, source) {
      return useSession(
        sid,
        async (connection, context) => {
          if (context.stage !== "ready") return denied(403);
          const passwordValid = await verifyPassword(password, context.user.password_hash);
          const mfaRequired = context.access.privileged || Boolean(context.user.mfa_secret);
          if (!passwordValid || (mfaRequired && !(await consumeMfa(connection, context, token)))) {
            await event(connection, {
              targetId: context.user.id,
              action: "auth.reauthentication_failed",
              outcome: "failure",
            });
            return denied();
          }
          const current = time();
          await connection("dmmarket_auth_session_state")
            .where("sid_hash", context.state.sid_hash)
            .update({ password_ms: current, activity_ms: current });
          await event(connection, {
            actorId: context.user.id,
            targetId: context.user.id,
            action: "auth.reauthenticated",
          });
          context.state.activity_ms = current;
          context.state.password_ms = current;
          return { value: { stage: "ready" } };
        },
        false,
        normalizeSource(source),
      );
    },
    async logout(sid) {
      const hash = sessionHash(sid);
      if (!hash) return;
      const reference = await db("dmmarket_auth_session_state").where("sid_hash", hash).select("user_id").first();
      if (!reference) return;
      await db.transaction(async (connection) => {
        const context = await lockSession(connection, hash, reference.user_id, false);
        if (context) await revoke(connection, context.state, "logout", context.user.id);
      });
    },
  };
  for (const name of [
    "login",
    "changePassword",
    "beginMfaEnrollment",
    "finishMfaEnrollment",
    "verifyMfa",
    "reauthenticate",
  ]) {
    const work = service[name];
    service[name] = async (...args) => {
      if (activeCredentialRequests >= MAX_CREDENTIAL_REQUESTS) {
        const error = new Error("El servicio de acceso está ocupado. Vuelve a intentarlo.");
        error.status = 503;
        error.retryAfterSeconds = 1;
        throw error;
      }
      activeCredentialRequests += 1;
      try {
        return await work(...args);
      } finally {
        activeCredentialRequests -= 1;
      }
    };
  }
  return Object.freeze(service);
}

module.exports = { createSessionService, MAX_CREDENTIAL_REQUESTS };
