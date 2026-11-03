const { requestSession } = require("../auth/resource-policy");
const express = require("express");
const { commissionStatus, updateCommission } = require("../controllers/commission-updates");

function createCommissionUpdateRoutes({ sessions, security }) {
  const router = express.Router();
  router.get("/employees/commissionInfo/:employeeId/status", async (req, res, next) => {
    try {
      res.json(
        await requestSession(sessions, req, { readOnly: true }, ({ transaction, access }) =>
          commissionStatus(transaction, access, req.params.employeeId, req.query),
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  router.use("/employees/commissionInfo", security.csrfProtection);
  for (const [method, path, commit] of [
    ["post", "/employees/commissionInfo/:employeeId/preview", false],
    ["put", "/employees/commissionInfo/:employeeId", true],
  ])
    router[method](path, async (req, res, next) => {
      try {
        if (!req.is("application/json")) throw Object.assign(new Error("Envía JSON."), { status: 415 });
        res.json(
          await requestSession(sessions, req, { recent: commit }, ({ transaction, access, user }) =>
            updateCommission(transaction, access, user, req.params.employeeId, req.body, req.query, commit),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  return router;
}

module.exports = { createCommissionUpdateRoutes };
