const express = require("express");
const { withReportCache } = require("../middlewares/authorized-report-cache");
const { parameters } = require("../controllers/sales");
const { clientDashboard } = require("../controllers/clients/dashboard");
const { inactiveClients, monthly, bestProduct, fail } = require("../controllers/clients");

function createClientRoutes({ sessions }) {
  const router = express.Router();
  const handle = (work, options) => async (req, res, next) => {
    try {
      res.json(
        await withReportCache(req, res, sessions, ({ transaction, access }) => {
          if (!access.hasGlobal("clients.read")) fail(403);
          return work(transaction, access, parameters(req.query, options), req.params);
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/clients/average/month/:clientId",
    handle((transaction, access, query, params) => monthly(transaction, access, query, params.clientId), {
      keys: ["from", "to", "showNoe"],
    }),
  );
  router.get(
    "/clients/best/product/:productId",
    handle((transaction, access, query, params) => bestProduct(transaction, access, query, params.productId), {
      keys: ["from", "to", "showNoe", "employeeId", "ruta"],
    }),
  );
  router.get(
    "/clients/sin-facturar",
    handle(inactiveClients, {
      keys: ["from", "to", "showNoe", "search", "ruta", "employeeId", "sortBy", "sortDir", "page", "limit"],
    }),
  );
  router.get("/clients/dashboard", handle(clientDashboard, { keys: ["from", "to", "showNoe", "ruta", "employeeId"] }));
  router.get(
    "/clients/routes",
    handle(
      async (transaction) => {
        const rows = await transaction("clientes as c")
          .join("rutas as r", "r.Id_Ruta", "c.Ruta")
          .select({ Id_Ruta: "c.Ruta", Nombre: "r.Nombre", clientes: transaction.raw("COUNT(*)") })
          .groupBy("c.Ruta", "r.Nombre")
          .orderBy("c.Ruta")
          .limit(501);
        if (rows.length > 500) fail(413);
        return rows;
      },
      { range: false, keys: [] },
    ),
  );
  return router;
}

module.exports = { createClientRoutes };
