const express = require("express");
const { preferences, updatePreferences } = require("../controllers/preferences");
const { forbidden } = require("../auth/router");
const { reportCache } = require("../middlewares/report-cache");

function createPreferenceRoutes({ sessions, security }) {
  const router = express.Router();
  for (const [path, restricted] of [
    ["/preferences/effective", false],
    ["/preferences", true],
  ]) {
    router.get(path, async (req, res, next) => {
      try {
        const value = await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (restricted && !access.hasGlobal("preferences.read")) forbidden();
          return preferences(transaction, req.query);
        });
        res.json(value);
      } catch (error) {
        next(error);
      }
    });
  }
  router.put("/preferences", security.csrfProtection, async (req, res, next) => {
    try {
      if (!req.is("application/json")) throw Object.assign(new Error("Envía JSON."), { status: 415 });
      const value = await sessions.withSession(req.sessionID, { recent: true }, ({ transaction, access, user }) => {
        if (!access.hasGlobal("preferences.read") || !access.hasGlobal("preferences.update")) forbidden();
        return updatePreferences(transaction, user, req.body, req.query);
      });
      reportCache.clear();
      res.json(value);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createPreferenceRoutes };
