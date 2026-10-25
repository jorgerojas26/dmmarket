const express = require("express");
const { randomUUID } = require("node:crypto");
const { parameters } = require("./sales-reports");
const { appendEvent } = require("./identity");
const { fechaEnCaracas, bcvRateService } = require("../bcv");
const { backupService } = require("../backups");
const updates = require("../controllers/update");
const { allowedReleaseAssets } = require("../utils/update-assets");
const { reportCache } = require("../middlewares/report-cache");

function fail(status) {
  throw Object.assign(new Error("Operación no permitida."), { status });
}
function empty(input) {
  if (Object.keys(input).length) fail(400);
}
function asRate(row) {
  if (!row) return null;
  if (!Number.isFinite(Number(row.Venta)) || Number(row.Venta) <= 0) fail(503);
  return { fecha: row.Fecha, tasa: Number(row.Venta) };
}
const dateColumn = (tx) => tx.raw("CAST(DATE_FORMAT(Fecha, '%Y-%m-%d') AS CHAR)");

function createOperationReports({ sessions, security, db, services = {} }) {
  const rateService = services.rates || bcvRateService;
  const updateReader = services.updateReader || updates;
  let lastBackup = null;
  let lastSync = null;
  const router = express.Router();
  const handle = (capability, work) => async (req, res, next) => {
    try {
      const value = await sessions.withSession(req.sessionID, {}, async ({ transaction, access }) => {
        if (!access.hasGlobal(capability)) fail(403);
        return work(transaction, req);
      });
      res.json(value);
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/currency_rates/bcv",
    handle("rates.read", async (tx, req) => {
      const end = req.query.to || fechaEnCaracas();
      const from =
        req.query.from ||
        (Number.isFinite(Date.parse(end))
          ? new Date(Date.parse(end) - 89 * 86400000).toISOString().slice(0, 10)
          : "invalid");
      const query = parameters({ ...req.query, from, to: end }, { keys: ["from", "to"] });
      const rows = await tx("bcv_tasas")
        .whereBetween("Fecha", [query.from, query.to])
        .select({ Fecha: dateColumn(tx), Venta: "Venta" })
        .orderBy("Fecha")
        .limit(368);
      if (rows.length > 367) fail(413);
      return rows.map(asRate);
    }),
  );
  router.get(
    "/currency_rates/bcv/latest",
    handle("rates.read", async (tx, req) => {
      empty(req.query);
      const row = await tx("bcv_tasas")
        .where("Fecha", "<=", fechaEnCaracas())
        .select({ Fecha: dateColumn(tx), Venta: "Venta" })
        .orderBy("Fecha", "desc")
        .first();
      if (!row) fail(404);
      return asRate(row);
    }),
  );
  router.get(
    "/currency_rates/bcv/status",
    handle("rates.read", async (tx, req) => {
      empty(req.query);
      const disponible = await tx.schema.hasTable("bcv_tasas");
      if (!disponible) return { disponible: false, ultimaTasa: null, ultimaPublicada: null, publicadaHasta: null };
      const current = await tx("bcv_tasas")
        .where("Fecha", "<=", fechaEnCaracas())
        .select({ Fecha: dateColumn(tx), Venta: "Venta" })
        .orderBy("Fecha", "desc")
        .first();
      const newest = await tx("bcv_tasas")
        .select({ Fecha: dateColumn(tx), Venta: "Venta" })
        .orderBy("Fecha", "desc")
        .first();
      return {
        disponible: true,
        lastRequest: lastSync,
        ultimaTasa: asRate(current),
        ultimaPublicada: asRate(newest),
        publicadaHasta: newest?.Fecha || null,
      };
    }),
  );
  router.get(
    "/currency_rates/bcv/:date",
    handle("rates.read", async (tx, req) => {
      empty(req.query);
      const date = req.params.date;
      parameters({ from: date, to: date });
      if (date > fechaEnCaracas()) fail(400);
      const row = await tx("bcv_tasas")
        .where("Fecha", "<=", date)
        .select({ Fecha: dateColumn(tx), Venta: "Venta" })
        .orderBy("Fecha", "desc")
        .first();
      if (!row) fail(404);
      return { ...asRate(row), solicitada: date, exacta: row.Fecha === date };
    }),
  );
  router.get(
    "/backups",
    handle("backups.read", async (_tx, req) => {
      empty(req.query);
      const value = await backupService.status();
      return {
        backups: value.backups.slice(0, 30),
        lastRequest: lastBackup,
        running: value.running,
        nextRunAt: value.nextRunAt,
        retention: value.retention,
        lastError: value.lastError
          ? { message: "No se pudo completar el último respaldo.", occurredAt: value.lastError.occurredAt }
          : null,
        retentionError: value.retentionError
          ? { message: "No se pudo completar la retención de respaldos.", occurredAt: value.retentionError.occurredAt }
          : null,
      };
    }),
  );
  for (const [path, controller] of [
    ["/update/status", updates.GET_STATUS],
    ["/update/progress", updates.GET_PROGRESS],
  ])
    router.get(path, async (req, res, next) => {
      try {
        await sessions.withSession(req.sessionID, {}, ({ access }) => {
          if (!access.hasGlobal("updates.read")) fail(403);
          empty(req.query);
        });
        controller(req, res);
      } catch (error) {
        next(error);
      }
    });
  for (const [method, path, controller] of [
    ["post", "/update/check", updateReader.POST_CHECK],
    ["get", "/update/history", updateReader.GET_HISTORY],
  ])
    router[method](path, ...(method === "post" ? [security.csrfProtection] : []), async (req, res, next) => {
      try {
        await sessions.withSession(req.sessionID, {}, ({ access }) => {
          if (!access.hasGlobal("updates.read")) fail(403);
          empty(req.query);
          if (method === "post") {
            if (!req.is("application/json")) fail(415);
            empty(req.body || {});
          }
        });
        await controller(req, res);
      } catch (error) {
        next(error);
      }
    });
  for (const [path, action, controller] of [
    ["/update/download", "download", updates.POST_DOWNLOAD],
    ["/update/apply", "apply", updates.POST_APPLY],
  ])
    router.post(path, security.csrfProtection, async (req, res, next) => {
      try {
        if (!req.is("application/json")) fail(415);
        const operationId = randomUUID();
        const actorId = await sessions.withSession(
          req.sessionID,
          { recent: true },
          async ({ transaction, access, user }) => {
            if (!access.hasGlobal("updates.read") || !access.hasGlobal("updates.execute")) fail(403);
            empty(req.query);
            const keys = action === "download" ? ["confirmed", "assetUrl", "sha256AssetUrl"] : ["confirmed"];
            if (req.body?.confirmed !== true || Object.keys(req.body).some((key) => !keys.includes(key))) fail(400);
            if (action === "download" && !allowedReleaseAssets(req.body.assetUrl, req.body.sha256AssetUrl)) fail(400);
            await appendEvent(transaction, {
              actorId: user.id,
              action: `updates.${action}_requested`,
              reason: operationId,
              occurredMs: Date.now(),
            });
            return user.id;
          },
        );
        res.once("finish", () => {
          void db
            .transaction((transaction) =>
              appendEvent(transaction, {
                actorId,
                action: `updates.${action}_completed`,
                outcome: res.statusCode >= 200 && res.statusCode < 300 ? "success" : "failure",
                reason: operationId,
                occurredMs: Date.now(),
              }),
            )
            .catch(() => console.error("No se pudo registrar el resultado de la actualización autorizada."));
        });
        await controller(req, res);
      } catch (error) {
        next(error);
      }
    });
  for (const [path, capability, service] of [
    ["/backups", "backups.create", "backup"],
    ["/currency_rates/bcv/sync", "rates.sync", "rates"],
  ])
    router.post(path, security.csrfProtection, async (req, res, next) => {
      try {
        if (!req.is("application/json")) fail(415);
        const operationId = randomUUID();
        const actorId = await sessions.withSession(
          req.sessionID,
          { recent: true },
          async ({ transaction, access, user }) => {
            if (!access.hasGlobal(capability)) fail(403);
            empty(req.query);
            if (req.body?.confirmed !== true || Object.keys(req.body).some((key) => key !== "confirmed")) fail(400);
            await appendEvent(transaction, {
              actorId: user.id,
              action: `${capability}_requested`,
              reason: operationId,
              occurredMs: Date.now(),
            });
            return user.id;
          },
        );
        if (
          (service === "backup" && (await backupService.status()).running) ||
          (service === "rates" && lastSync?.outcome === "running")
        )
          fail(409);
        const request = { operationId, actorId, startedAt: new Date().toISOString(), outcome: "running" };
        if (service === "backup") lastBackup = request;
        else lastSync = request;
        const work = service === "backup" ? backupService.createManual({ operationId }) : rateService.sincronizar();
        void Promise.resolve(work)
          .then(async (result) => {
            const ok = service === "backup" ? result?.ok === true : true;
            const outcome = ok ? "success" : "failure";
            if (service === "backup" && result?.name) request.filename = result.name;
            if (service === "rates") request.written = result.escritas;
            await db.transaction((connection) =>
              appendEvent(connection, {
                actorId,
                action: `${capability}_completed`,
                outcome,
                reason: operationId,
                occurredMs: Date.now(),
              }),
            );
            request.outcome = outcome;
            request.completedAt = new Date().toISOString();
          })
          .catch(async () => {
            request.outcome = "failure";
            request.completedAt = new Date().toISOString();
            try {
              await db.transaction((connection) =>
                appendEvent(connection, {
                  actorId,
                  action: `${capability}_failed`,
                  outcome: "failure",
                  reason: operationId,
                  occurredMs: Date.now(),
                }),
              );
            } catch {
              console.error("No se pudo registrar el resultado de la operación autorizada.");
            }
          });
        res.status(202).json({ accepted: true, operationId });
      } catch (error) {
        if (error.code === "BACKUP_RUNNING") error.status = 409;
        next(error);
      }
    });
  router.post("/cache/clear", security.csrfProtection, async (req, res, next) => {
    try {
      if (!req.is("application/json")) fail(415);
      const operationId = randomUUID();
      const actorId = await sessions.withSession(
        req.sessionID,
        { recent: true },
        async ({ transaction, access, user }) => {
          if (!access.hasGlobal("cache.clear")) fail(403);
          empty(req.query);
          if (req.body?.confirmed !== true || Object.keys(req.body).some((key) => key !== "confirmed")) fail(400);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "cache.clear_requested",
            reason: operationId,
            occurredMs: Date.now(),
          });
          return user.id;
        },
      );
      reportCache.clear();
      await db.transaction((transaction) =>
        appendEvent(transaction, {
          actorId,
          action: "cache.clear_completed",
          reason: operationId,
          occurredMs: Date.now(),
        }),
      );
      res.json({ cleared: true, operationId });
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createOperationReports };
