const express = require("express");
const { audit, event, options, fail } = require("../controllers/audit");

function createAuditRoutes({ sessions }) {
  const router = express.Router();
  router.get("/auth/audit/:id", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (!access.hasGlobal("audit.events.read")) fail(403);
          if (!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(req.params.id))
            fail(404);
          return event(transaction, req.params.id);
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/auth/audit", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (!access.hasGlobal("audit.events.read")) fail(403);
          return audit(transaction, options(req.query));
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createAuditRoutes };
