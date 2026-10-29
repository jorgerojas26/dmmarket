const express = require("express");
const { forbidden } = require("../auth/router");
const { appendEvent } = require("../auth/identity");
const { reportCache } = require("../middlewares/report-cache");

function createSettingsRoutes({ sessions, security }) {
  const router = express.Router();
  const read = async (transaction) => {
    const row = await transaction("dmmarket_settings").where("name", "reportCurrency").first();
    if (!["USD", "Bs"].includes(row?.value))
      throw Object.assign(new Error("La moneda no está disponible."), { status: 503 });
    return { reportCurrency: row.value };
  };
  router.get("/settings", async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) throw Object.assign(new Error("La consulta no es válida."), { status: 400 });
      res.json(await sessions.withSession(req.sessionID, { readOnly: true }, ({ transaction }) => read(transaction)));
    } catch (error) {
      next(error);
    }
  });
  router.put("/settings", security.csrfProtection, async (req, res, next) => {
    try {
      if (!req.is("application/json")) throw Object.assign(new Error("Envía JSON."), { status: 415 });
      const result = await sessions.withSession(
        req.sessionID,
        { recent: true },
        async ({ transaction, access, user }) => {
          if (!access.hasGlobal("preferences.read") || !access.hasGlobal("preferences.update")) forbidden();
          if (
            Object.keys(req.query).length ||
            !req.body ||
            Array.isArray(req.body) ||
            Object.keys(req.body).some((key) => key !== "reportCurrency") ||
            !["USD", "Bs"].includes(req.body.reportCurrency)
          )
            throw Object.assign(new Error("Selecciona USD o Bs."), { status: 400 });
          await transaction("dmmarket_settings").where("name", "reportCurrency").forUpdate().first();
          const previous = await read(transaction);
          if (previous.reportCurrency !== req.body.reportCurrency) {
            await transaction("dmmarket_settings")
              .where("name", "reportCurrency")
              .update({ value: req.body.reportCurrency });
            await appendEvent(transaction, {
              actorId: user.id,
              action: "preferences.currency_changed",
              reason: JSON.stringify({ previous: previous.reportCurrency, next: req.body.reportCurrency }),
              occurredMs: Date.now(),
            });
          }
          return { reportCurrency: req.body.reportCurrency };
        },
      );
      reportCache.clear();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createSettingsRoutes };
