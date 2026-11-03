exports.config = { transaction: false };

exports.up = async (db) => {
  if (!(await db.schema.hasTable("cxc_operaciones")))
    throw new Error("Prepara primero el registro de operaciones de cobranza en mantenimiento.");
  if (!(await db.schema.hasColumn("cxc_operaciones", "ActorId")))
    await db.schema.alterTable("cxc_operaciones", (table) => table.string("ActorId", 36).nullable());
  if (!(await db.schema.hasTable("dmmarket_receivables_locks")))
    await db.schema.createTable("dmmarket_receivables_locks", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("ClientKey", 64).primary();
    });
};

exports.down = async (db) => {
  if (await db.schema.hasColumn("cxc_operaciones", "ActorId")) {
    if (await db("cxc_operaciones").whereNotNull("ActorId").first())
      throw new Error("No se elimina la atribución de operaciones financieras registradas.");
    await db.schema.alterTable("cxc_operaciones", (table) => table.dropColumn("ActorId"));
  }
  await db.schema.dropTableIfExists("dmmarket_receivables_locks");
};
