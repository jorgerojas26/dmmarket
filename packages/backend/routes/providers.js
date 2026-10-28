const express = require("express");
const { parameters, listSales, invoiceDetail } = require("../controllers/sales");
const { purchases } = require("../controllers/purchases");
const { providerList } = require("../controllers/provider-list");
const { parties, best } = require("../controllers/provider-aggregates");
const { directory, purchaseDetail, summary, identifier, fail } = require("../controllers/providers");

function createProviderRoutes({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (!access.hasGlobal("providers.read")) fail(403);
          const query = parameters(req.query, options);
          const id = req.params.providerId ? identifier(req.params.providerId) : null;
          return work(transaction, access, query, id, req.params);
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/providers/options",
    handle((tx, _access, query) => directory(tx, query, true), { range: false, keys: ["search"] }),
  );
  router.get(
    "/providers/list",
    handle((tx, access, query) => providerList(tx, access, query), {
      range: false,
      keys: ["from", "to", "showNoe", "search", "page", "limit", "sortBy", "sortDir"],
    }),
  );
  router.get("/providers/best", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          if (!access.hasGlobal("providers.read")) fail(403);
          const { mode = "ventas", ...input } = req.query;
          const query = parameters(input, { keys: ["from", "to", "showNoe", "employeeId", "categoryId"] });
          if (mode === "compras" && (query.showNoe !== undefined || query.employeeId)) fail(400);
          return best(transaction, access, query, mode);
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  for (const [path, sellers] of [
    ["clients", false],
    ["sellers", true],
  ])
    router.get(
      `/providers/:providerId/${path}`,
      handle((tx, access, query, id) => parties(tx, access, query, id, sellers), {
        keys: ["from", "to", "showNoe", "employeeId", "productId", "page", "limit", "search", "sortBy", "sortDir"],
      }),
    );
  router.get("/providers/:providerId/summary", handle(summary, { keys: ["from", "to", "showNoe", "employeeId"] }));
  for (const [path, kind] of [
    ["sales", "invoices"],
    ["products", "products"],
  ])
    router.get(
      `/providers/:providerId/${path}`,
      handle((tx, access, query, id) => listSales(tx, access, { ...query, proveedorId: id }, kind), {
        keys: [
          "from",
          "to",
          "showNoe",
          "employeeId",
          "clientId",
          "productId",
          "page",
          "limit",
          "search",
          "sortBy",
          "sortDir",
        ],
      }),
    );
  router.get(
    "/providers/:providerId/purchases",
    handle(
      async (tx, access, query, id) => ({
        ...(await purchases(tx, access, { ...query, proveedorId: id }, false)),
        exportAllowed: access.hasGlobal("purchases.export"),
      }),
      {
        keys: ["from", "to", "page", "limit", "search", "sortBy", "sortDir"],
      },
    ),
  );
  router.get(
    "/providers/:providerId/purchases/:invoiceId",
    handle((tx, access, query, id, params) => purchaseDetail(tx, access, query, id, identifier(params.invoiceId)), {
      range: false,
      keys: ["from", "to"],
    }),
  );
  router.get(
    "/providers/:providerId/sales/:invoiceId",
    handle(
      (tx, access, query, id, params) =>
        invoiceDetail(tx, access, { ...query, proveedorId: id }, identifier(params.invoiceId)),
      { range: false, keys: ["from", "to", "showNoe", "employeeId"] },
    ),
  );
  return router;
}

module.exports = { createProviderRoutes };
