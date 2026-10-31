const OPERATION_CAPABILITIES = Object.freeze({
  payment: "payment",
  void: "void",
  close: "close",
  reopen: "reopen",
});

function denied() {
  const error = new Error("Acceso de cobranza no permitido.");
  error.status = 403;
  throw error;
}

function requireReceivables(access) {
  if (!access.hasGlobal("read")) denied();
}

function requireReceivablesOperation(access, operation) {
  if (
    !access.hasGlobal("read") ||
    !Object.hasOwn(OPERATION_CAPABILITIES, operation) ||
    !access.hasGlobal(OPERATION_CAPABILITIES[operation])
  )
    denied();
}

module.exports = { requireReceivables, requireReceivablesOperation, OPERATION_CAPABILITIES };
