const reportId = (value) => (value == null ? "__none__" : String(value) === "" ? "__empty__" : value);
const identityKey = (value) => String(reportId(value)).trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const missingName = (kind, value) => `${kind} no registrado (${value == null || value === "" ? "sin ID" : value})`;
const filterIdentity = (query, column, value) => {
  if (value === "__none__") return query.whereNull(column);
  return query.andWhere(column, value === "__empty__" ? "" : value);
};
const searchText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

module.exports = { reportId, identityKey, missingName, filterIdentity, searchText };
