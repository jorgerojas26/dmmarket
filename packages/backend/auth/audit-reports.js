const express = require("express");
const { parameters } = require("./sales-reports");

function fail(status) {
  const error = new Error("La consulta de auditoría no está permitida.");
  error.status = status;
  throw error;
}

function options(input) {
  const filters = ["actorId", "targetId", "roleId", "action", "outcome"];
  if (Object.keys(input).some((key) => !["from", "to", "page", "limit", ...filters].includes(key))) fail(400);
  for (const key of filters) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string") fail(400);
    if (["actorId", "targetId", "roleId"].includes(key)) {
      if (!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(value)) fail(400);
    } else if (key === "action" ? !/^[a-z][a-z0-9_.:-]{0,63}$/.test(value) : !["success", "failure"].includes(value))
      fail(400);
  }
  return {
    ...parameters(Object.fromEntries(Object.entries(input).filter(([key]) => !filters.includes(key))), {
      keys: ["from", "to", "page", "limit"],
    }),
    ...Object.fromEntries(filters.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])),
  };
}

async function audit(transaction, query) {
  const source = transaction("dmmarket_auth_events")
    .where("occurred_ms", ">=", Date.parse(query.from))
    .where("occurred_ms", "<", Date.parse(query.to) + 86400000);
  for (const [key, column] of Object.entries({
    actorId: "actor_id",
    targetId: "target_user_id",
    roleId: "target_role_id",
    action: "action",
    outcome: "outcome",
  }))
    if (query[key]) source.whereRaw("BINARY ?? = ?", [column, query[key]]);
  const [{ total }] = await source.clone().count("* as total");
  const data = await source
    .clone()
    .select({
      id: "id",
      actorId: "actor_id",
      targetId: "target_user_id",
      roleId: "target_role_id",
      action: "action",
      outcome: "outcome",
      reason: "reason",
      occurredMs: "occurred_ms",
    })
    .orderBy("occurred_ms", "desc")
    .orderBy("id", "desc")
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  return { data, total: Number(total), page: query.page, limit: query.limit };
}

function createAuditReports({ sessions }) {
  const router = express.Router();
  router.get("/auth/audit", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, {}, ({ transaction, access }) => {
          if (!access.hasGlobal("audit.read")) fail(403);
          return audit(transaction, options(req.query));
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createAuditReports };
