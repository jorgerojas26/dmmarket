const express = require("express");
const { parameters, invoiceDetail, salesBase } = require("../controllers/sales");
const { dispatchExport } = require("../controllers/dispatch-export");
const { createReceivablesService } = require("../receivables");
const { appendEvent } = require("../auth/identity");
const { dataset, fail } = require("../controllers/exports");

function createExportRoutes({ sessions, security }) {
  const router = express.Router();
  router.use(require("./provider-exports").createProviderExportRoutes({ sessions }));
  router.get("/exports/receivables/:clientId", async (req, res, next) => {
    try {
      if (
        Object.keys(req.query).some((key) => key !== "documents") ||
        !/^[-\p{L}\p{N}._]{1,15}$/u.test(req.params.clientId)
      )
        fail(400);
      if (req.query.documents !== undefined && !["all", "pending"].includes(req.query.documents)) fail(400);
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          if (!access.hasGlobal("receivables.read") || !access.hasGlobal("receivables.export")) fail(403);
          const service = createReceivablesService({
            db: transaction,
            personal: access.hasGlobal("clients.personal"),
            referenceRate: access.hasGlobal("rates.read"),
          });
          const result = await service.detail(
            req.params.clientId,
            { documents: req.query.documents || "pending" },
            5001,
          );
          if (result.documents.total > 5000 || result.timeline.total > 5000) fail(413);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: "receivables:client",
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post("/exports/sales/dispatch", security.csrfProtection, async (req, res, next) => {
    try {
      if (!req.is("application/json")) fail(415);
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          const result = await dispatchExport(transaction, access, req.body);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: `sales:dispatch:${result.invoices.length}`,
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/exports/sales/:invoiceId", async (req, res, next) => {
    try {
      const query = parameters(req.query, { range: false, keys: ["showNoe", "proveedorId"] });
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          const scope = access.scopeFor("sales.export");
          if (!scope.global && !scope.sellerIds.length) fail(403);
          const { base, invoice } = salesBase(transaction, access, query);
          const headers = await base
            .whereRaw("BINARY ?? = ?", [`mf.${invoice}`, req.params.invoiceId])
            .select({ sellerId: "mf.IdVend" })
            .groupByRaw("BINARY mf.IdVend");
          if (!headers.length) fail(404);
          if (!headers.every((header) => access.canRecord("sales.export", header.sellerId))) fail(403);
          const result = await invoiceDetail(transaction, access, query, req.params.invoiceId);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: "sales:document",
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/exports/:resource", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          const result = await dataset(req.params.resource, transaction, access, req.query);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: `${req.params.resource}:${result.total}`,
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

module.exports = { createExportRoutes };
