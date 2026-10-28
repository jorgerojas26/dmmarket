const { filterIdentity } = require("../utils/report-identity");

function salesDocuments(transaction, access, query) {
  const scope = access.scopeFor("sales.read");
  if (!scope.global && !scope.sellerIds.length) {
    const error = new Error("La consulta de ventas no está permitida.");
    error.status = 403;
    throw error;
  }
  const noe = query.showNoe === "true";
  const master = noe ? "masternoe" : "masterfact";
  const slave = noe ? "slavenoe" : "slavefact";
  const invoice = noe ? "IdNoe" : "IdFactura";
  const base = transaction(`${master} as mf`).where("mf.Anulada", 0);
  if (!scope.global) base.whereIn(transaction.raw("BINARY mf.IdVend"), scope.sellerIds);
  if (query.employeeId) filterIdentity(base, transaction.raw("BINARY mf.IdVend"), query.employeeId);
  return { base, slave, invoice };
}

module.exports = { salesDocuments };
