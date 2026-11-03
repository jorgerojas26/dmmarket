exports.config = { transaction: false };

exports.up = async (db) => {
  if (!(await db.schema.hasTable("dmmarket_auth_control")))
    throw new Error("Prepara primero el esquema propio de acceso.");
  const table = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .where("TABLE_NAME", "dmmarket_auth_control")
    .select("ENGINE", "TABLE_COLLATION")
    .first();
  if (table?.ENGINE !== "InnoDB" || table?.TABLE_COLLATION !== "utf8_bin")
    throw new Error("El control de acceso requiere InnoDB/utf8_bin.");
  if (!(await db.schema.hasColumn("dmmarket_auth_control", "first_setup")))
    await db.schema.alterTable("dmmarket_auth_control", (table) =>
      table.string("first_setup", 16).notNullable().defaultTo("closed"),
    );
};

exports.down = async () => {
  throw new Error(
    "El estado de inicialización no se elimina automáticamente. Usa un respaldo revisado en mantenimiento.",
  );
};
