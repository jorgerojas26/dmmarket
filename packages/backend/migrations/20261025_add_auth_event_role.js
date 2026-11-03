exports.config = { transaction: false };

exports.up = async (db) => {
  if (!(await db.schema.hasTable("dmmarket_auth_events")))
    throw new Error("Prepara primero el esquema de acceso en mantenimiento.");
  if (!(await db.schema.hasColumn("dmmarket_auth_events", "target_role_id"))) {
    await db.schema.alterTable("dmmarket_auth_events", (table) => table.string("target_role_id", 36).nullable());
  }
};

exports.down = async (db) => {
  if (!(await db.schema.hasColumn("dmmarket_auth_events", "target_role_id"))) return;
  if (await db("dmmarket_auth_events").whereNotNull("target_role_id").first())
    throw new Error("No se elimina el objetivo de roles con historial registrado.");
  await db.schema.alterTable("dmmarket_auth_events", (table) => table.dropColumn("target_role_id"));
};
