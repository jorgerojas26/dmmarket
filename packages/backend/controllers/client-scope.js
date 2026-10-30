function filterClientScope(transaction, query, scope, column) {
  if (scope.global) return query;
  return query.where(function () {
    for (const [index, table] of ["masterfact", "masternoe"].entries()) {
      const source = transaction(`${table} as authorized_client`)
        .select(transaction.raw("1"))
        .where("authorized_client.Anulada", 0)
        .whereIn("authorized_client.IdVend", scope.sellerIds)
        .whereIn(transaction.raw("BINARY authorized_client.IdVend"), scope.sellerIds)
        .whereRaw("authorized_client.IdCliente = ??", [column])
        .whereRaw("BINARY authorized_client.IdCliente = BINARY ??", [column]);
      if (index === 0) this.whereExists(source);
      else this.orWhereExists(source);
    }
  });
}

module.exports = { filterClientScope };

async function projectClientPersonal(transaction, access, rows) {
  if (access.hasGlobal("personal")) return rows;
  const scope = access.scopeFor("personal");
  const allowed = new Set(
    scope.sellerIds.length
      ? (
          await filterClientScope(transaction, transaction("clientes as c"), scope, "c.IdCliente").pluck("c.IdCliente")
        ).map(String)
      : [],
  );
  return rows.map((row) => {
    const authorized = allowed.has(String(row.IdCliente));
    if (!authorized) delete row.rif;
    Object.defineProperty(row, "authorizedPersonal", { value: authorized });
    return row;
  });
}

module.exports.projectClientPersonal = projectClientPersonal;
