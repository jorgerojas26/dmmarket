const express = require("express");
const { parameters } = require("../controllers/sales");
const { purchaseDetail } = require("../controllers/providers");
const { appendEvent } = require("../auth/identity");
const { exportProvider, identifier, fail } = require("../controllers/provider-exports");

function createProviderExportRoutes({ sessions }) {
  const router = express.Router();
  router.get("/exports/providers/:providerId/purchases/:invoiceId", async (req, res, next) => {
    try {
      const id = identifier(req.params.providerId),
        document = identifier(req.params.invoiceId);
      if (Object.keys(req.query).length) fail(400);
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          if (!access.hasGlobal("providers.read") || !access.hasGlobal("purchases.export")) fail(403);
          const result = await purchaseDetail(transaction, access, {}, id, document);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: "providers:purchase-document",
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/exports/providers/:providerId/:kind", async (req, res, next) => {
    try {
      const id = identifier(req.params.providerId),
        kind = req.params.kind;
      const buying = ["purchases", "purchase-documents"].includes(kind);
      const query = parameters(req.query, {
        keys: buying
          ? ["from", "to", "search", "sortBy", "sortDir"]
          : ["from", "to", "showNoe", "employeeId", "clientId", "productId", "search", "sortBy", "sortDir"],
      });
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          const result = await exportProvider(transaction, access, id, kind, query);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: `providers:${kind}`,
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}
module.exports = { createProviderExportRoutes };
