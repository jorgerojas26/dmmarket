exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (knex) => {
  if (await knex.schema.hasTable("bcv_tasas")) return;
  await knex.schema.createTable("bcv_tasas", (table) => {
    table.charset("utf8");
    table.collate("utf8_general_ci");
    table.date("Fecha").primary();
    table.decimal("Compra", 18, 8).notNullable();
    table.decimal("Venta", 18, 8).notNullable();
    table.dateTime("Actualizado").notNullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("bcv_tasas");
};
