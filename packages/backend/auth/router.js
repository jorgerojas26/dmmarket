const express = require("express");
const { CAPABILITIES } = require("./capabilities");
const { newSessionId, replaceSession } = require("./http-security");
const { requestSource } = require("./attempts");
const { createAccessDirectory } = require("./access-directory");

function forbidden() {
  const error = new Error("Acceso no permitido.");
  error.status = 403;
  throw error;
}

function sessionView(context) {
  return {
    user: context.user,
    stage: context.stage,
    revision: context.revision,
    mfaEnabled: context.mfaEnabled,
    permissions: Object.keys(CAPABILITIES).flatMap((capability) => {
      const scope = context.access.scopeFor(capability);
      if (scope.global) return [{ capability, scope: "global" }];
      if (scope.sellerIds.length) return [{ capability, scope: "assigned" }];
      return [];
    }),
  };
}

function createAuthRouter({ sessions, accounts, administration, security }) {
  const router = express.Router();
  const directory = createAccessDirectory(sessions);
  const handler = (work) => (req, res, next) =>
    Promise.resolve()
      .then(() => work(req, res))
      .catch(next);
  const source = (req) => requestSource(req);
  const save = (req) =>
    new Promise((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));

  async function respond(req, res, context, sid = null) {
    if (sid) {
      await replaceSession(req, sid);
      req.session.authenticated = true;
    }
    const csrfToken = security.issueCsrfToken(req);
    await save(req);
    res.json({ ...sessionView(context), csrfToken });
  }

  router.get(
    "/session",
    handler(async (req, res) => {
      let context;
      try {
        context = await sessions.status(req.sessionID);
      } catch (error) {
        if (error.status !== 401) throw error;
      }
      if (context) return respond(req, res, context);
      if (req.session.authenticated) await replaceSession(req, newSessionId());
      const csrfToken = security.issueCsrfToken(req);
      await save(req);
      const stage = await accounts.initialState(req.get("x-dmmarket-client-ip"));
      res.json({ user: null, stage, csrfToken });
    }),
  );
  router.use(security.csrfProtection);
  router.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.is("application/json")) {
      return res.status(415).json({ error: { message: "Envía la operación como JSON." } });
    }
    next();
  });
  router.post(
    "/first-user",
    handler(async (req, res) => {
      const user = await accounts.createInitialUser(req.body, req.get("x-dmmarket-client-ip"));
      const sid = newSessionId();
      const context = await sessions.login({ sid, username: user.username, password: req.body.password }, source(req));
      await respond(req, res, context, sid);
    }),
  );
  router.post(
    "/login",
    handler(async (req, res) => {
      let present;
      try {
        present = await sessions.status(req.sessionID);
      } catch (error) {
        if (error.status !== 401) throw error;
      }
      if (present) {
        const error = new Error("Ya hay una sesión activa.");
        error.status = 409;
        throw error;
      }
      const sid = newSessionId();
      const context = await sessions.login(
        { sid, username: req.body.username, password: req.body.password },
        source(req),
      );
      await respond(req, res, context, sid);
    }),
  );
  router.post(
    "/password",
    handler(async (req, res) => {
      const sid = newSessionId();
      const context = await sessions.changePassword(
        req.sessionID,
        {
          currentPassword: req.body.currentPassword,
          newPassword: req.body.newPassword,
          token: req.body.token,
          newSid: sid,
        },
        source(req),
      );
      await respond(req, res, context, sid);
    }),
  );
  router.post(
    "/mfa/enrollment",
    handler(async (req, res) =>
      res.json(await sessions.beginMfaEnrollment(req.sessionID, req.body.password, source(req))),
    ),
  );
  router.post(
    "/mfa/enrollment/confirm",
    handler(async (req, res) => {
      const sid = newSessionId();
      const context = await sessions.finishMfaEnrollment(
        req.sessionID,
        { token: req.body.token, newSid: sid },
        source(req),
      );
      await respond(req, res, context, sid);
    }),
  );
  router.post(
    "/mfa",
    handler(async (req, res) => {
      await sessions.verifyMfa(req.sessionID, req.body.token, source(req));
      await respond(req, res, await sessions.status(req.sessionID));
    }),
  );
  router.post(
    "/reauthenticate",
    handler(async (req, res) => {
      await sessions.reauthenticate(req.sessionID, { password: req.body.password, token: req.body.token }, source(req));
      await respond(req, res, await sessions.status(req.sessionID));
    }),
  );
  router.post(
    "/activity",
    handler(async (req, res) => {
      await sessions.withSession(req.sessionID, { activity: true }, async () => null);
      res.json({ ok: true });
    }),
  );
  router.post(
    "/logout",
    handler(async (req, res) => {
      await sessions.logout(req.sessionID);
      await new Promise((resolve, reject) => req.session.destroy((error) => (error ? reject(error) : resolve())));
      res.clearCookie("__Host-dmmarket.sid", { path: "/", secure: true, httpOnly: true, sameSite: "lax" });
      res.json({ ok: true });
    }),
  );
  router.get(
    "/directory",
    handler(async (req, res) => res.json(await directory.users(req.sessionID, req.query))),
  );
  router.get(
    "/seller-options",
    handler(async (req, res) => res.json(await directory.sellers(req.sessionID, req.query))),
  );
  router.get(
    "/users",
    handler(async (req, res) => {
      const page = req.query.page === undefined ? 1 : Number(req.query.page);
      if (!Number.isInteger(page) || page < 1 || page > 10000) {
        const error = new Error("La página no es válida.");
        error.status = 400;
        throw error;
      }
      const result = await sessions.withSession(req.sessionID, {}, async ({ access, transaction }) => {
        if (!access.hasGlobal("access.users")) forbidden();
        const rows = await transaction("dmmarket_auth_users")
          .select("id", "username", "display_name", "enabled", "must_change_password")
          .orderBy("username")
          .limit(100)
          .offset((page - 1) * 100);
        const total = await transaction("dmmarket_auth_users").count("* as total").first();
        return { data: rows, page, total: Number(total.total) };
      });
      res.json(result);
    }),
  );
  router.get(
    "/roles",
    handler(async (req, res) => {
      const roles = await sessions.withSession(req.sessionID, {}, async ({ access, transaction }) => {
        if (!access.hasGlobal("access.roles")) forbidden();
        return transaction("dmmarket_auth_roles").select("id", "name").orderBy("name").limit(200);
      });
      res.json({ data: roles });
    }),
  );
  router.get(
    "/roles/catalog",
    handler(async (req, res) => res.json({ data: await administration.catalog(req.sessionID) })),
  );
  router.get(
    "/roles/:id",
    handler(async (req, res) => res.json(await administration.role(req.sessionID, req.params.id))),
  );
  router.post(
    "/roles",
    handler(async (req, res) => res.status(201).json(await administration.createRole(req.sessionID, req.body))),
  );
  router.put(
    "/roles/:id",
    handler(async (req, res) => res.json(await administration.updateRole(req.sessionID, req.params.id, req.body))),
  );
  router.get(
    "/users/:id/roles",
    handler(async (req, res) =>
      res.json({ data: await administration.assignments(req.sessionID, req.params.id, "roles") }),
    ),
  );
  router.put(
    "/users/:id/roles",
    handler(async (req, res) => res.json(await administration.setRoles(req.sessionID, req.params.id, req.body))),
  );
  router.get(
    "/users/:id/sellers",
    handler(async (req, res) =>
      res.json({ data: await administration.assignments(req.sessionID, req.params.id, "sellers") }),
    ),
  );
  router.put(
    "/users/:id/sellers",
    handler(async (req, res) => res.json(await administration.setSellers(req.sessionID, req.params.id, req.body))),
  );
  router.post(
    "/users",
    handler(async (req, res) =>
      res.status(201).json(
        await accounts.createUser(req.sessionID, {
          username: req.body.username,
          displayName: req.body.displayName,
          roleIds: req.body.roleIds,
          reason: req.body.reason,
        }),
      ),
    ),
  );
  router.post(
    "/users/:id/enabled",
    handler(async (req, res) =>
      res.json(await accounts.setEnabled(req.sessionID, req.params.id, req.body.enabled, req.body.reason)),
    ),
  );
  router.post(
    "/users/:id/reset",
    handler(async (req, res) =>
      res.json(
        await accounts.resetCredentials(req.sessionID, req.params.id, {
          resetMfa: req.body.resetMfa,
          reason: req.body.reason,
        }),
      ),
    ),
  );
  return router;
}

module.exports = { createAuthRouter, sessionView, forbidden };
