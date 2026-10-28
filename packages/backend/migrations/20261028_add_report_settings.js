exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (knex) => {
  if (await knex.schema.hasTable("dmmarket_settings")) return;
  await knex.schema.createTable("dmmarket_settings", (table) => {
    table.string("name", 50).primary();
    table.string("value", 50).notNullable();
  });
  await knex("dmmarket_settings").insert({ name: "reportCurrency", value: "USD" });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists("dmmarket_settings");
};
