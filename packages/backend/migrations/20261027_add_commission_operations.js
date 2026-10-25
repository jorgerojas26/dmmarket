exports.config = { transaction: false };
exports.up = async (db) => {
  if (!(await db.schema.hasTable("vendedor_comisiones")))
    throw new Error("Prepara primero los porcentajes actuales de comisiones en mantenimiento.");
  if (!(await db.schema.hasTable("dmmarket_commission_operations")))
    await db.schema.createTable("dmmarket_commission_operations", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("id", 36).primary();
      table.string("actor_id", 36).notNullable();
      table.string("vendor_id", 32).notNullable();
      table.string("fingerprint", 64).notNullable();
      table.text("data", "longtext").notNullable();
      table.bigInteger("occurred_ms").notNullable();
      table.index(["vendor_id", "occurred_ms"]);
    });
  if (!(await db.schema.hasTable("dmmarket_commission_locks")))
    await db.schema.createTable("dmmarket_commission_locks", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("vendor_hash", 64).primary();
    });
};
exports.down = async (db) => {
  if (await db.schema.hasTable("dmmarket_commission_operations")) {
    if (await db("dmmarket_commission_operations").first())
      throw new Error("No se elimina el historial de cambios de porcentajes.");
  }
  await db.schema.dropTableIfExists("dmmarket_commission_locks");
  await db.schema.dropTableIfExists("dmmarket_commission_operations");
};
