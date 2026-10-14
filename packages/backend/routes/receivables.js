const express = require("express");
const { createReceivablesService } = require("../receivables");

function createReceivablesRouter(service) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const handler = (action) => async (req, res) => {
    try {
      res.json(await action(req));
    } catch (error) {
      if (!error.status) console.error("Cuentas por cobrar:", error.message);
      res.status(error.status || 500).json({
        error: {
          message: error.status
            ? error.message
            : "No se pudo consultar o actualizar la cartera. Revisa la conexión y la migración de cuentas por cobrar.",
        },
      });
    }
  };
  router.get(
    "/status",
    handler(() => service.readiness()),
  );
  router.get(
    "/",
    handler((req) => service.list(req.query)),
  );
  router.get(
    "/banks",
    handler(() => service.banks()),
  );
  router.get(
    "/:clientId",
    handler((req) => service.detail(req.params.clientId, req.query)),
  );
  router.use((req, res, next) => {
    if (!req.is("application/json"))
      return res.status(415).json({ error: { message: "Envía la operación como JSON." } });
    if (req.get("Sec-Fetch-Site") === "cross-site")
      return res.status(403).json({ error: { message: "La operación debe iniciarse desde DMMarket." } });
    next();
  });
  router.post(
    "/:clientId/preview",
    handler((req) => service.preview(req.params.clientId, req.body || {})),
  );
  router.post(
    "/:clientId/operations",
    handler((req) => service.execute(req.params.clientId, req.body || {})),
  );
  return router;
}

module.exports = createReceivablesRouter(createReceivablesService({ db: require("../database") }));
module.exports.createReceivablesRouter = createReceivablesRouter;
