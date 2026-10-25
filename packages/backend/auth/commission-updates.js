const express = require("express");
const { createHash } = require("node:crypto");
const { Money } = require("../utils/receivables-money");
const { assertWritableCommissions } = require("../commission-storage");
const { appendEvent } = require("./identity");

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail(status) {
  throw Object.assign(new Error("La actualización de comisiones no está permitida."), { status });
}
function authorize(access, id, write) {
  if (typeof id !== "string" || !/^[\p{L}\p{N}._-]{1,8}$/u.test(id)) fail(400);
  if (!access.canRecord("commissions.read", id) || (write && !access.hasGlobal("commissions.update"))) fail(403);
}
function payload(body, commit) {
  const keys = ["commissionInfo", "reason", ...(commit ? ["requestId", "snapshot"] : [])];
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) fail(400);
  if (
    typeof body.reason !== "string" ||
    body.reason.trim().length < 5 ||
    body.reason.trim().length > 250 ||
    /[\p{Cs}\u{10000}-\u{10FFFF}]/u.test(body.reason)
  )
    fail(400);
  const input = body.commissionInfo;
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !Object.keys(input).length ||
    Object.keys(input).length > 100
  )
    fail(400);
  const rates = Object.entries(input)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupId, value]) => {
      if (
        !/^[\p{L}\p{N}._-]{1,10}$/u.test(groupId) ||
        !["string", "number"].includes(typeof value) ||
        !/^\d{1,3}(?:\.\d{1,4})?$/.test(String(value))
      )
        fail(400);
      const rate = new Money(value);
      if (rate.lt(0) || rate.gt(100)) fail(400);
      return { groupId, after: rate.toFixed(4) };
    });
  if (
    commit &&
    (typeof body.requestId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId) ||
      typeof body.snapshot !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.snapshot))
  )
    fail(400);
  return { rates, reason: body.reason.trim() };
}
async function plan(tx, id, input, actorId, lock) {
  const vendor = tx("vendedores").whereRaw("BINARY idVend = ?", [id]).first("idVend");
  if (!(await (lock ? vendor.forUpdate() : vendor))) fail(404);
  const groups = tx("grupos")
    .whereIn(
      tx.raw("BINARY IdGrupo"),
      input.rates.map((row) => row.groupId),
    )
    .select("IdGrupo");
  if ((await (lock ? groups.forUpdate() : groups)).length !== input.rates.length) fail(400);
  const current = tx("vendedor_comisiones")
    .whereRaw("BINARY vendedorId = ?", [id])
    .whereIn(
      tx.raw("BINARY grupoId"),
      input.rates.map((row) => row.groupId),
    )
    .select("grupoId", "comision")
    .orderBy("grupoId");
  const rows = await (lock ? current.forUpdate() : current);
  const result = {
    actorId,
    vendorId: id,
    reason: input.reason,
    changes: input.rates.map((row) => ({
      ...row,
      before: rows.find((old) => old.grupoId === row.groupId)?.comision ?? null,
    })),
  };
  return { ...result, snapshot: hash(result) };
}
function createCommissionUpdates({ sessions, security }) {
  const router = express.Router();
  router.get("/employees/commissionInfo/:employeeId/status", async (req, res, next) => {
    try {
      res.json(
        await sessions.withSession(req.sessionID, {}, async ({ transaction, access }) => {
          authorize(access, req.params.employeeId, false);
          if (Object.keys(req.query).length) fail(400);
          let writesAvailable = false;
          try {
            await assertWritableCommissions(transaction);
            writesAvailable = true;
          } catch (error) {
            if (error.status !== 503) throw error;
          }
          return { writesAvailable };
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.use("/employees/commissionInfo", security.csrfProtection);
  for (const [method, path, commit] of [
    ["post", "/employees/commissionInfo/:employeeId/preview", false],
    ["put", "/employees/commissionInfo/:employeeId", true],
  ])
    router[method](path, async (req, res, next) => {
      try {
        if (!req.is("application/json")) fail(415);
        res.json(
          await sessions.withSession(req.sessionID, { recent: commit }, async ({ transaction: tx, access, user }) => {
            const id = req.params.employeeId;
            authorize(access, id, true);
            await assertWritableCommissions(tx);
            if (Object.keys(req.query).length) fail(400);
            const input = payload(req.body, commit);
            if (!commit) return plan(tx, id, input, user.id, false);
            const fingerprint = hash({ id, input, actorId: user.id, snapshot: req.body.snapshot });
            const vendorHash = hash(id);
            await tx.raw(
              "INSERT INTO dmmarket_commission_locks (vendor_hash) VALUES (?) ON DUPLICATE KEY UPDATE vendor_hash = VALUES(vendor_hash)",
              [vendorHash],
            );
            await tx("dmmarket_commission_locks").where("vendor_hash", vendorHash).forUpdate().first();
            const previous = await tx("dmmarket_commission_operations").where("id", req.body.requestId).first();
            if (previous) {
              if (previous.fingerprint !== fingerprint || previous.vendor_id !== id || previous.actor_id !== user.id)
                fail(409);
              return JSON.parse(previous.data);
            }
            const result = await plan(tx, id, input, user.id, true);
            if (result.snapshot !== req.body.snapshot) fail(409);
            for (const row of result.changes) {
              if (row.before === null)
                await tx("vendedor_comisiones").insert({ vendedorId: id, grupoId: row.groupId, comision: row.after });
              else
                await tx("vendedor_comisiones")
                  .whereRaw("BINARY vendedorId = ? AND BINARY grupoId = ?", [id, row.groupId])
                  .update({ comision: row.after });
            }
            result.operationId = req.body.requestId;
            result.occurredMs = Date.now();
            await tx("dmmarket_commission_operations").insert({
              id: result.operationId,
              actor_id: user.id,
              vendor_id: id,
              fingerprint,
              data: JSON.stringify(result),
              occurred_ms: result.occurredMs,
            });
            await appendEvent(tx, {
              actorId: user.id,
              action: "commissions.updated",
              reason: result.operationId,
              occurredMs: result.occurredMs,
            });
            return result;
          }),
        );
      } catch (error) {
        next(error);
      }
    });
  return router;
}
module.exports = { createCommissionUpdates };
