const express = require("express");
const { withReportCache } = require("../middlewares/authorized-report-cache");
const { purchases, options, pareto, dashboard } = require("../controllers/purchases");

function createPurchaseRoutes({ sessions }) {
  const router = express.Router();
  for (const [path, work, compare] of [
    ["/purchases/dashboard", dashboard, true],
    ["/purchases/pareto", pareto, false],
  ])
    router.get(path, async (req, res, next) => {
      try {
        res.json(
          await withReportCache(req, res, sessions, ({ transaction, access }) =>
            work(transaction, access, options(req.query, { listing: false, compare })),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  for (const [path, products] of [
    ["/purchases/invoices", false],
    ["/purchases/products", true],
  ])
    router.get(path, async (req, res, next) => {
      try {
        res.json(
          await withReportCache(req, res, sessions, ({ transaction, access }) =>
            purchases(transaction, access, options(req.query), products),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  return router;
}

module.exports = { createPurchaseRoutes };
