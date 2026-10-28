const express = require("express");
const { rates, sales } = require("../../controllers/commissions");

function createCommissionRoutes({ sessions }) {
  const router = express.Router();
  for (const [path, work] of [
    ["/employees/commissionInfo/:employeeId", rates],
    ["/employees/sales/:employeeId", sales],
  ])
    router.get(path, async (req, res, next) => {
      try {
        res.json(
          await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) =>
            work(transaction, access, req.params.employeeId, req.query),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  return router;
}

module.exports = { createCommissionRoutes };
