const express = require("express");
const { createSalesRoutes } = require("./sales");
const { createPartyRoutes } = require("./parties");
const { createClientRoutes } = require("./clients");
const { createParetoRoutes } = require("./dashboard");
const { createInventoryRoutes } = require("./products");
const { createPurchaseRoutes } = require("./purchases");
const { createProviderRoutes } = require("./providers");
const { createAuditRoutes } = require("./audit");
const { createExportRoutes } = require("./exports");
const { createOperationRoutes } = require("./operations");
const { createCommissionRoutes } = require("./employees");
const { createCommissionUpdateRoutes } = require("./commission-updates");
const { createReceivablesRoutes } = require("./receivables");
const { forbidden } = require("../auth/router");
const { createPreferenceRoutes } = require("./preferences");

function createBusinessRouter({ sessions, security, db, services }) {
  const router = express.Router();
  router.use(createPreferenceRoutes({ sessions, security }));
  router.use(createSalesRoutes({ sessions }));
  router.use(createPartyRoutes({ sessions }));
  router.use(createClientRoutes({ sessions }));
  router.use(createParetoRoutes({ sessions }));
  router.use(createInventoryRoutes({ sessions }));
  router.use(createPurchaseRoutes({ sessions }));
  router.use(createProviderRoutes({ sessions }));
  router.use(createAuditRoutes({ sessions }));
  router.use(createExportRoutes({ sessions, security }));
  router.use(createOperationRoutes({ sessions, security, db, services }));
  router.use(createCommissionRoutes({ sessions }));
  router.use(createCommissionUpdateRoutes({ sessions, security }));
  router.use(createReceivablesRoutes({ sessions, security }));
  router.use((req, _res, next) => {
    sessions.withSession(req.sessionID, { readOnly: true }, async () => forbidden()).catch(next);
  });
  return router;
}

module.exports = { createBusinessRouter };
