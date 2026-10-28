const express = require("express");
const { withReportCache } = require("../middlewares/authorized-report-cache");
const { parameters, listSales, salesBase } = require("../controllers/sales");
const {
  directory,
  partyList,
  clientSummary,
  sellerSummary,
  sellerDashboard,
  requireCapability,
  identifier,
  fail,
} = require("../controllers/parties");

function createPartyRoutes({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      const result = await withReportCache(req, res, sessions, async ({ transaction, access }) =>
        work(transaction, access, parameters(req.query, options), req.params),
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
  const catalog = (clients) => async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) =>
          directory(transaction, access, req.query, clients),
        ),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get("/clients", catalog(true));
  router.get("/employees", catalog(false));
  const listKeys = ["from", "to", "showNoe", "page", "limit", "sortBy", "sortDir", "search", "ruta", "employeeId"];
  router.get(
    "/clients/list",
    handle((transaction, access, query) => partyList(transaction, access, query, true), { keys: listKeys }),
  );
  router.get(
    "/sellers/list",
    handle((transaction, access, query) => partyList(transaction, access, query, false), {
      keys: listKeys.filter((key) => key !== "ruta"),
    }),
  );
  const summaryKeys = ["from", "to", "showNoe"];
  router.get("/sellers/dashboard", handle(sellerDashboard, { keys: [...summaryKeys, "employeeId"] }));
  router.get(
    "/clients/:clientId/summary",
    handle((transaction, access, query, params) => clientSummary(transaction, access, query, params.clientId), {
      keys: summaryKeys,
    }),
  );
  router.get(
    "/sellers/:sellerId/summary",
    handle((transaction, access, query, params) => sellerSummary(transaction, access, query, params.sellerId), {
      keys: summaryKeys,
    }),
  );
  router.get(
    "/clients/:clientId/sales",
    handle(async (transaction, access, query, params) => {
      requireCapability(access, "clients.read");
      const result = await listSales(
        transaction,
        access,
        {
          ...query,
          clientId: identifier(params.clientId),
          sortBy: query.sortBy === "idFactura" ? "invoiceId" : query.sortBy,
        },
        "invoices",
      );
      return {
        data: result.data.map(({ invoiceId, ...row }) => ({ idFactura: invoiceId, ...row })),
        total: result.pagination.total,
        exportAllowed: result.exportAllowed,
        page: query.page,
        limit: query.limit,
        totals: result.totals,
      };
    }),
  );
  router.get(
    "/sellers/:sellerId/sales",
    handle(async (transaction, access, query, params) => {
      const id = identifier(params.sellerId);
      if (
        ["__none__", "__empty__"].includes(id)
          ? !access.hasGlobal("sellers.read")
          : !access.canRecord("sellers.read", id)
      )
        fail(403);
      const result = await listSales(transaction, access, { ...query, employeeId: id }, "invoices");
      return {
        data: result.data.map(({ cliente, ...row }) => ({ ...row, client: cliente })),
        total: result.pagination.total,
        exportAllowed: result.exportAllowed,
        page: query.page,
        limit: query.limit,
        totals: { ...result.totals, invoiceCount: result.pagination.total },
      };
    }),
  );
  router.get(
    "/clients/best",
    handle(
      async (transaction, access, query) => {
        requireCapability(access, "clients.read");
        const { base } = salesBase(transaction, access, query);
        const rows = await base
          .select({
            client: transaction.raw(
              "COALESCE(c.Empresa, CONCAT('Cliente no registrado (', COALESCE(mf.IdCliente, 'sin ID'), ')'))",
            ),
            total_USD: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
          })
          .groupBy("mf.IdCliente", "c.Empresa")
          .orderBy("total_USD", "desc")
          .limit(5001);
        if (rows.length > 5000) fail(413);
        return rows;
      },
      { keys: ["from", "to", "showNoe", "ruta", "employeeId"] },
    ),
  );
  return router;
}

module.exports = { createPartyRoutes };
