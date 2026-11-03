exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (db) => {
  const table = await db("information_schema.TABLES")
    .whereRaw("TABLE_SCHEMA = DATABASE()")
    .where("TABLE_NAME", "dmmarket_auth_users")
    .select("ENGINE", "TABLE_COLLATION")
    .first();
  if (table?.ENGINE !== "InnoDB" || table?.TABLE_COLLATION !== "utf8_bin")
    throw new Error("Prepara primero las cuentas de acceso InnoDB/utf8_bin.");
  if (!(await db.schema.hasColumn("dmmarket_auth_users", "mfa_required")))
    await db.schema.alterTable("dmmarket_auth_users", (table) =>
      table.boolean("mfa_required").notNullable().defaultTo(false),
    );
};

exports.down = async () => {
  throw new Error("La política MFA no se elimina automáticamente. Usa un respaldo revisado en mantenimiento.");
};
