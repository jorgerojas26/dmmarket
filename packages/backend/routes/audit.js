const express = require("express");
const { audit, options, fail } = require("../controllers/audit");

function createAuditRoutes({ sessions }) {
  const router = express.Router();
  router.get("/auth/audit", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (!access.hasGlobal("audit.read")) fail(403);
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
