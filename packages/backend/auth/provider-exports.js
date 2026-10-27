const express = require("express");
const { parameters, listSales, invoiceDetail } = require("./sales-reports");
const { purchases } = require("./purchase-reports");
const { purchaseDetail } = require("./provider-reports");
const { parties } = require("./provider-aggregates");
const { sellerSalesScope } = require("./party-reports");
const { canExportSales } = require("./sales-export");
const { appendEvent } = require("./identity");

function fail(status) {
  throw Object.assign(new Error("La exportación del proveedor no está permitida."), { status });
}
function identifier(id) {
  if (!/^[-\p{L}\p{N}._]{1,32}$/u.test(id)) fail(400);
  return id;
}

async function exportProvider(tx, access, id, kind, query) {
  if (!access.hasGlobal("providers.read")) fail(403);
  const buying = ["purchases", "purchase-documents"].includes(kind);
  const documents = ["sales-documents", "purchase-documents"].includes(kind);
  const filtered = { ...query, proveedorId: id, page: 1, limit: 5001 };
  let result;
  if (buying) {
    if (!access.hasGlobal("purchases.export")) fail(403);
    result = await purchases(tx, access, filtered, false);
  } else if (["sales", "products", "sales-documents"].includes(kind)) {
    if (!canExportSales(access, filtered)) fail(403);
    result = await listSales(tx, access, filtered, kind === "products" ? "products" : "invoices");
  } else if (["clients", "sellers"].includes(kind)) {
    if (kind === "clients" && !access.hasGlobal("clients.export")) fail(403);
    if (kind === "sellers") {
      const scope = sellerSalesScope(access);
      if (
        !(
          access.hasGlobal("sellers.export") ||
          (query.employeeId
            ? access.canRecord("sellers.export", query.employeeId)
            : !scope.global && access.covers("sellers.export", scope.sellerIds))
        )
      )
        fail(403);
    }
    result = await parties(tx, access, filtered, id, kind === "sellers");
  } else fail(404);
  const total = Number(result.pagination?.total ?? result.total);
  if (total > 5000 || result.data.length > 5000) fail(413);
  if (documents) {
    let lines = 0;
    const data = [];
    for (const row of result.data) {
      const detail = buying
        ? await purchaseDetail(tx, access, query, id, row.invoiceId)
        : await invoiceDetail(tx, access, { ...query, proveedorId: id }, row.invoiceId);
      lines += detail.productos.length;
      if (lines > 5000) fail(413);
      data.push({ ...row, detail });
    }
    return { ...result, data, total };
  }
  return { ...result, total };
}

function createProviderExports({ sessions }) {
  const router = express.Router();
  router.get("/exports/providers/:providerId/purchases/:invoiceId", async (req, res, next) => {
    try {
      const id = identifier(req.params.providerId),
        document = identifier(req.params.invoiceId);
      if (Object.keys(req.query).length) fail(400);
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          if (!access.hasGlobal("providers.read") || !access.hasGlobal("purchases.export")) fail(403);
          const result = await purchaseDetail(transaction, access, {}, id, document);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: "providers:purchase-document",
            occurredMs: Date.now(),
          });
          return result;
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/exports/providers/:providerId/:kind", async (req, res, next) => {
    try {
      const id = identifier(req.params.providerId),
        kind = req.params.kind;
      const buying = ["purchases", "purchase-documents"].includes(kind);
      const query = parameters(req.query, {
        keys: buying
          ? ["from", "to", "search", "sortBy", "sortDir"]
          : ["from", "to", "showNoe", "employeeId", "clientId", "productId", "search", "sortBy", "sortDir"],
      });
      res.json(
        await sessions.withSession(req.sessionID, { readOnly: true }, async ({ transaction, access, user }) => {
          const result = await exportProvider(transaction, access, id, kind, query);
          await appendEvent(transaction, {
            actorId: user.id,
            action: "reports.export_prepared",
            reason: `providers:${kind}`,
            occurredMs: Date.now(),
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
module.exports = { createProviderExports };
