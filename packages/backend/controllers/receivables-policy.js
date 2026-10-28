const OPERATION_CAPABILITIES = Object.freeze({
  payment: "receivables.payment",
  void: "receivables.void",
  close: "receivables.close",
  reopen: "receivables.reopen",
});

function denied() {
  const error = new Error("Acceso de cobranza no permitido.");
  error.status = 403;
  throw error;
}

function requireReceivables(access) {
  if (!access.hasGlobal("receivables.read")) denied();
}

function requireReceivablesOperation(access, operation) {
  if (
    !access.hasGlobal("receivables.read") ||
    !Object.hasOwn(OPERATION_CAPABILITIES, operation) ||
    !access.hasGlobal(OPERATION_CAPABILITIES[operation])
  )
    denied();
}

module.exports = { requireReceivables, requireReceivablesOperation, OPERATION_CAPABILITIES };
