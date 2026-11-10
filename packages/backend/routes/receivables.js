const { requestSession } = require("../auth/resource-policy");
const { forbidden } = require("../auth/router");
const express = require("express");
const { createReceivablesService } = require("../receivables");
const { requireReceivables, requireReceivablesOperation } = require("../controllers/receivables-policy");
const { assertWritableReceivables } = require("../receivables-storage");
const { appendEvent } = require("../auth/identity");
const { invoiceDetail } = require("../controllers/sales");

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
        await requestSession(sessions, req, { readOnly: true }, ({ transaction, access }) => {
          requireReceivables(access);
          const query = options(req.query, keys);
          if (keys.includes("sortBy") && !access.hasGlobal("amounts") && !query.sortBy) query.sortBy = "name";
          const service = createReceivablesService({
            db: transaction,
            personal: access.hasGlobal("personal"),
            referenceRate: access.hasGlobal("settings.rates.read"),
            canReadSale: () => true,
          });
          return work(service, req, query, transaction, access);
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  const catalog =
    (work, write = false) =>
    async (req, res, next) => {
      try {
        if (write && !req.is("application/json")) throw Object.assign(new Error("Envía JSON."), { status: 415 });
        options(req.query, []);
        res.json(
          await sessions.withSession(
            req.sessionID,
            { readOnly: !write, recent: write },
            async ({ transaction, access, user }) => {
              if (
                !access.hasGlobal("settings.collections.read") ||
                (write && !access.hasGlobal("settings.collections.update"))
              )
                forbidden();
              const service = createReceivablesService({ db: transaction });
              const result = await work(service, req);
              if (write)
                await appendEvent(transaction, {
                  actorId: user.id,
                  action: "collections.updated",
                  reason: JSON.stringify({ type: req.params.type, id: req.params.id ?? null }),
                  occurredMs: Date.now(),
                });
              return result;
            },
          ),
        );
      } catch (error) {
        if (
          (error.code === "ER_NO_SUCH_TABLE" && /dmmarket_(payment_methods|bank_settings)/.test(error.message)) ||
          (error.code === "ER_BAD_FIELD_ERROR" && /\bposition\b/.test(error.message))
        ) {
          error.status = 503;
          error.code = "CXC_CATALOGS_UNAVAILABLE";
          error.message =
            "Falta preparar los catálogos de cobranza. Aplica la migración pendiente de DMMarket y vuelve a intentar.";
        }
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
    "/receivables/methods",
    handle((service) => service.methods(), []),
  );
  router.get(
    "/receivables/catalogs/:type",
    catalog((service, req) => service.catalog(req.params.type)),
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
  router.get(
    "/receivables/:clientId/invoices/:invoiceId",
    handle(async (_service, req, _query, transaction, access) => {
      const id = clientId(req.params.clientId);
      const invoiceId = req.params.invoiceId;
      if (typeof invoiceId !== "string" || !invoiceId || invoiceId.length > 128)
        throw Object.assign(new Error("Factura no válida."), { status: 400 });
      const document = await transaction("cxc_documentos")
        .whereRaw("BINARY IdCliente = ?", [id])
        .whereRaw("BINARY IdFactura = ?", [invoiceId])
        .first("IdDocumento");
      if (!document) throw Object.assign(new Error("Factura no disponible en esta cuenta."), { status: 404 });
      const result = await invoiceDetail(transaction, access, { showNoe: "false", clientId: id }, invoiceId);
      return result;
    }, []),
  );
  router.use("/receivables", security.csrfProtection);
  router.post(
    "/receivables/catalogs/:type/reorder",
    catalog((service, req) => service.reorderCatalog(req.params.type, req.body?.ids), true),
  );
  router.post(
    "/receivables/catalogs/:type",
    catalog((service, req) => service.saveCatalog(req.params.type, null, req.body || {}), true),
  );
  router.put(
    "/receivables/catalogs/:type/:id",
    catalog((service, req) => service.saveCatalog(req.params.type, req.params.id, req.body || {}), true),
  );
  for (const [endpoint, commit] of [
    ["preview", false],
    ["operations", true],
  ])
    router.post(`/receivables/:clientId/${endpoint}`, async (req, res, next) => {
      try {
        if (!req.is("application/json")) throw Object.assign(new Error("Envía JSON."), { status: 415 });
        res.json(
          await requestSession(sessions, req, { recent: commit }, async ({ transaction, access, user }) => {
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
              personal: access.hasGlobal("personal"),
              referenceRate: access.hasGlobal("settings.rates.read"),
              onOperation: async (connection, result) => {
                await appendEvent(connection, {
                  actorId: user.id,
                  action: `receivables.${type}`,
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
