const { appendEvent } = require("../auth/identity");

function fail(status) {
  throw Object.assign(new Error("La operación de preferencias no está permitida."), { status });
}

function view(row) {
  if (!row || !["invoices", "delivery-notes"].includes(row.document_type)) fail(503);
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) fail(503);
  return { documentType: row.document_type, revision };
}

async function preferences(transaction, query) {
  if (Object.keys(query).length) fail(400);
  return view(await transaction("dmmarket_preferences").where("id", 1).first());
}

async function updatePreferences(transaction, user, body, query) {
  if (
    Object.keys(query).length ||
    !body ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !["documentType", "revision"].includes(key)) ||
    !["invoices", "delivery-notes"].includes(body.documentType) ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 1
  )
    fail(400);
  const previous = view(await transaction("dmmarket_preferences").where("id", 1).forUpdate().first());
  if (previous.revision !== body.revision) fail(409);
  if (previous.documentType === body.documentType) return previous;
  const revision = previous.revision + 1;
  await transaction("dmmarket_preferences").where("id", 1).update({ document_type: body.documentType, revision });
  await appendEvent(transaction, {
    actorId: user.id,
    action: "preferences.updated",
    reason: JSON.stringify({ previous: previous.documentType, next: body.documentType }),
    occurredMs: Date.now(),
  });
  return { documentType: body.documentType, revision };
}

module.exports = { preferences, updatePreferences };
