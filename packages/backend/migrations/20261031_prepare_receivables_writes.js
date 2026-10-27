exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (db) => {
  const core = await Promise.all(
    ["cxc_documentos", "cxc_movimientos", "cxc_cruces"].map((table) => db.schema.hasTable(table)),
  );
  if (!core.every(Boolean)) return;
  await require("./20261011_add_receivables_operations").up(db);
  const tables = ["cxc_operaciones", "cxc_cierres"];
  const rows = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .whereIn("TABLE_NAME", tables)
    .select({ name: "TABLE_NAME", engine: "ENGINE" });
  if (
    rows.length !== tables.length ||
    rows.some((row) => !["innodb", "myisam"].includes(String(row.engine).toLowerCase()))
  )
    throw new Error("Las tablas propias de cobranza requieren revisión antes de preparar las transacciones.");
  for (const table of tables)
    if (String(rows.find((row) => row.name === table).engine).toLowerCase() === "myisam")
      await db.raw("ALTER TABLE ?? ENGINE=InnoDB", [table]);
  await require("./20261026_add_receivables_actor").up(db);
};

exports.down = async () => {
  throw new Error("La preparación transaccional de cobranza no se revierte automáticamente.");
};
