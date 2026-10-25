const OPERATION_CAPABILITIES = Object.freeze({
  payment: "receivables.payment",
  void: "receivables.void",
  close: "receivables.close",
  reopen: "receivables.reopen",
});

function requireReceivables(access, operation) {
  if (
    !access.hasGlobal("receivables.read") ||
    (operation &&
      (!Object.hasOwn(OPERATION_CAPABILITIES, operation) || !access.hasGlobal(OPERATION_CAPABILITIES[operation])))
  ) {
    const error = new Error("Acceso de cobranza no permitido.");
    error.status = 403;
    throw error;
  }
}

module.exports = { requireReceivables, OPERATION_CAPABILITIES };
