function unavailable() {
  const error = new Error("La cartera no está preparada para escrituras transaccionales con atribución de usuario.");
  error.status = 503;
  throw error;
}

async function assertWritableReceivables(db) {
  const keys = {
    cxc_documentos: "IdDocumento",
    cxc_movimientos: "IdMov",
    cxc_cruces: "IdCruce",
    cxc_operaciones: "IdOperacion",
    cxc_cierres: "IdCierre",
    clientes: "IdCliente",
    masterfact: "IdFactura",
    dmmarket_receivables_locks: "ClientKey",
  };
  const tables = [...Object.keys(keys), "divisas"];
  const rows = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", tables)
    .select({ name: "TABLE_NAME", engine: "ENGINE" });
  if (rows.length !== tables.length || rows.some((row) => String(row.engine).toLowerCase() !== "innodb")) unavailable();
  for (const [table, column] of Object.entries(keys)) {
    const [indexes] = await db.raw("SHOW INDEX FROM ??", [table]);
    const primary = indexes.filter((row) => String(row.Key_name) === "PRIMARY");
    if (primary.length !== 1 || String(primary[0].Column_name) !== column || Number(primary[0].Non_unique) !== 0)
      unavailable();
  }
  if (!(await db.schema.hasColumn("cxc_operaciones", "ActorId"))) unavailable();
  let fractional = true;
  for (const [table, field] of [
    ["cxc_operaciones", "FechaRegistro"],
    ["cxc_movimientos", "Fecha"],
    ["cxc_cruces", "FechaCruce"],
  ]) {
    const [columns] = await db.raw("SHOW COLUMNS FROM ?? LIKE ?", [table, field]);
    if (!columns.length) unavailable();
    if (!/^datetime\([1-6]\)$/i.test(String(columns[0].Type))) fractional = false;
  }
  return { fractional };
}

module.exports = { assertWritableReceivables };
