const express = require("express");
const { withReportCache } = require("../middlewares/authorized-report-cache");
const { pareto, options } = require("../controllers/dashboard");

function createParetoRoutes({ sessions }) {
  const router = express.Router();
  router.get("/dashboard/pareto", async (req, res, next) => {
    try {
      res.json(
        await withReportCache(req, res, sessions, ({ transaction, access }) =>
          pareto(transaction, access, options(req.query)),
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createParetoRoutes };
