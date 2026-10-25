const express = require("express");
const { createReceivablesService } = require("../receivables");
const { requireReceivables } = require("./receivables-policy");

function options(input, keys) {
  if (
    Object.keys(input).some((key) => !keys.includes(key)) ||
    Object.values(input).some((value) => typeof value !== "string" || value.length > 128)
  )
    throw Object.assign(new Error("Filtro de cartera no válido."), { status: 400 });
  for (const key of ["page", "timelinePage"])
    if (input[key] !== undefined && (!/^\d+$/.test(input[key]) || Number(input[key]) < 1 || Number(input[key]) > 10000))
      throw Object.assign(new Error("Página no válida."), { status: 400 });
  if (input.documents !== undefined && !["all", "pending"].includes(input.documents))
    throw Object.assign(new Error("Filtro no válido."), { status: 400 });
  return input;
}

function clientId(value) {
  if (typeof value !== "string" || !/^[\p{L}\p{N}._-]{1,15}$/u.test(value))
    throw Object.assign(new Error("Cliente no válido."), { status: 400 });
  return value;
}

function createReceivablesReports({ sessions }) {
  const router = express.Router();
  const handle = (work, keys) => async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, {}, ({ transaction, access }) => {
          requireReceivables(access);
          const query = options(req.query, keys);
          const service = createReceivablesService({
            db: transaction,
            personal: access.hasGlobal("clients.personal"),
            referenceRate: access.hasGlobal("rates.read"),
          });
          return work(service, req, query);
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/receivables/status",
    handle((service) => service.readiness(), []),
  );
  router.get(
    "/receivables/banks",
    handle((service) => service.banks(), []),
  );
  router.get(
    "/receivables",
    handle(
      (service, _req, query) => service.list(query),
      ["search", "ruta", "state", "due", "sortBy", "sortDir", "page", "limit"],
    ),
  );
  router.get(
    "/receivables/:clientId",
    handle(
      (service, req, query) => service.detail(clientId(req.params.clientId), query),
      ["page", "timelinePage", "documents"],
    ),
  );
  return router;
}

module.exports = { createReceivablesReports };
