exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (db) => {
  if (!(await db.schema.hasTable("dmmarket_auth_role_capabilities")))
    throw new Error("Prepara primero la identidad comercial individual.");
  if (!(await db.schema.hasTable("dmmarket_auth_user_capabilities")))
    await db.schema.createTable("dmmarket_auth_user_capabilities", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("user_id", 36).notNullable().references("id").inTable("dmmarket_auth_users");
      table.string("capability", 64).notNullable();
      table.primary(["user_id", "capability"]);
    });
  const table = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .where("TABLE_NAME", "dmmarket_auth_user_capabilities")
    .first("ENGINE", "TABLE_COLLATION");
  if (table.ENGINE !== "InnoDB" || table.TABLE_COLLATION !== "utf8_bin")
    throw new Error("Los permisos individuales requieren InnoDB/utf8_bin.");
  if (!(await db.schema.hasColumn("dmmarket_auth_events", "details")))
    await db.schema.alterTable("dmmarket_auth_events", (table) => table.text("details").nullable());
};

exports.down = async (db) => {
  if (await db("dmmarket_auth_user_capabilities").first())
    throw new Error("No se eliminan permisos individuales asignados.");
  if (await db("dmmarket_auth_events").whereNotNull("details").first())
    throw new Error("No se elimina el detalle de auditoría registrado.");
  await db.schema.alterTable("dmmarket_auth_events", (table) => table.dropColumn("details"));
  await db.schema.dropTable("dmmarket_auth_user_capabilities");
};
