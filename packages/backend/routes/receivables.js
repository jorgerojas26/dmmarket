const express = require("express");
const { createReceivablesService } = require("../receivables");
const {
  requireReceivables,
  requireReceivablesOperation,
  OPERATION_CAPABILITIES,
} = require("../controllers/receivables-policy");
const { assertWritableReceivables } = require("../receivables-storage");
const { appendEvent } = require("../auth/identity");

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

function createReceivablesRoutes({ sessions, security }) {
  const router = express.Router();
  const handle = (work, keys) => async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction, access }) => {
          requireReceivables(access);
          const query = options(req.query, keys);
          const service = createReceivablesService({
            db: transaction,
            personal: access.hasGlobal("clients.personal"),
            referenceRate: access.hasGlobal("rates.read"),
            canReadSale: (sellerId) => access.canRecord("sales.read", sellerId),
          });
          return work(service, req, query, transaction);
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/receivables/status",
    handle(async (service, _req, _query, transaction) => {
      let writesAvailable = false;
      try {
        await assertWritableReceivables(transaction);
        writesAvailable = true;
      } catch (error) {
        if (error.status !== 503) throw error;
      }
      return { ...(await service.readiness()), writesAvailable };
    }, []),
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
  router.use("/receivables", security.csrfProtection);
  for (const [endpoint, commit] of [
    ["preview", false],
    ["operations", true],
  ])
    router.post(`/receivables/:clientId/${endpoint}`, async (req, res, next) => {
      try {
        if (!req.is("application/json")) throw Object.assign(new Error("Envía JSON."), { status: 415 });
        res.json(
          await sessions.withSession(req.sessionID, { recent: commit }, async ({ transaction, access, user }) => {
            const body = req.body;
            const type = body?.type;
            requireReceivablesOperation(access, type);
            await assertWritableReceivables(transaction);
            const fields =
              type === "payment"
                ? ["type", "amount", "currency", "date", "method", "reference", "bank", "notes", "rate"]
                : ["type", "id", "reason"];
            if (commit) fields.push("requestId", "snapshot");
            if (
              !body ||
              Array.isArray(body) ||
              Object.keys(body).some((key) => !fields.includes(key)) ||
              Object.keys(req.query).length
            )
              throw Object.assign(new Error("Operación no válida."), { status: 400 });
            const service = createReceivablesService({
              db: transaction,
              actorId: user.id,
              personal: access.hasGlobal("clients.personal"),
              referenceRate: access.hasGlobal("rates.read"),
              onOperation: async (connection, result) => {
                await appendEvent(connection, {
                  actorId: user.id,
                  action: OPERATION_CAPABILITIES[type],
                  reason: result.operationId,
                  occurredMs: Date.now(),
                });
              },
            });
            const id = clientId(req.params.clientId);
            return commit ? service.execute(id, body) : service.preview(id, body);
          }),
        );
      } catch (error) {
        next(error);
      }
    });
  return router;
}

module.exports = { createReceivablesRoutes };
