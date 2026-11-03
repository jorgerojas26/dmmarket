exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (db) => {
  if (!(await db.schema.hasTable("dmmarket_preferences"))) {
    await db.schema.createTable("dmmarket_preferences", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.integer("id").primary();
      table.string("document_type", 16).notNullable();
      table.integer("revision").unsigned().notNullable();
    });
  }
  if (!(await db("dmmarket_preferences").where("id", 1).first())) {
    await db("dmmarket_preferences").insert({ id: 1, document_type: "invoices", revision: 1 });
  }
};

exports.down = async (db) => {
  await db.schema.dropTableIfExists("dmmarket_preferences");
};
