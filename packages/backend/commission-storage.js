function unavailable() {
  throw Object.assign(
    new Error("Comisiones requiere preparación transaccional, porcentajes decimales y unicidad por vendedor y grupo."),
    { status: 503 },
  );
}

async function assertWritableCommissions(db) {
  const names = [
    "vendedor_comisiones",
    "vendedores",
    "grupos",
    "dmmarket_commission_operations",
    "dmmarket_commission_locks",
  ];
  const rows = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", names)
    .select({ name: "TABLE_NAME", engine: "ENGINE" });
  if (rows.length !== names.length || rows.some((row) => String(row.engine).toLowerCase() !== "innodb")) unavailable();
  const [columns] = await db.raw("SHOW COLUMNS FROM vendedor_comisiones");
  const type = String(columns.find((row) => String(row.Field).toLowerCase() === "comision")?.Type || "");
  const decimal = /^decimal\((\d+),(\d+)\)$/i.exec(type);
  if (!decimal || Number(decimal[2]) < 4 || Number(decimal[1]) - Number(decimal[2]) < 3) unavailable();
  const [indexes] = await db.raw("SHOW INDEX FROM vendedor_comisiones");
  const unique = new Map();
  for (const row of indexes)
    if (!Number(row.Non_unique) && row.Sub_part == null) {
      const fields = unique.get(String(row.Key_name)) || [];
      fields.push(String(row.Column_name));
      unique.set(String(row.Key_name), fields);
    }
  if (
    ![...unique.values()].some(
      (fields) => fields.length === 2 && fields.includes("vendedorId") && fields.includes("grupoId"),
    )
  )
    unavailable();
  for (const [table, column] of [
    ["dmmarket_commission_operations", "id"],
    ["dmmarket_commission_locks", "vendor_hash"],
    ["vendedores", "idVend"],
    ["grupos", "IdGrupo"],
  ]) {
    const [keys] = await db.raw("SHOW INDEX FROM ??", [table]);
    const primary = keys.filter((row) => String(row.Key_name) === "PRIMARY");
    if (primary.length !== 1 || String(primary[0].Column_name).toLowerCase() !== column.toLowerCase()) unavailable();
  }
}

module.exports = { assertWritableCommissions };
