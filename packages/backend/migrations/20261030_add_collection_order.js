exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (knex) => {
  for (const name of ["dmmarket_bank_settings", "dmmarket_payment_methods"]) {
    if (!(await knex.schema.hasColumn(name, "position"))) {
      await knex.schema.alterTable(name, (table) => {
        table.integer("position").nullable();
      });
    }
  }
};

exports.down = async (knex) => {
  for (const name of ["dmmarket_bank_settings", "dmmarket_payment_methods"]) {
    if (await knex.schema.hasColumn(name, "position")) {
      await knex.schema.alterTable(name, (table) => {
        table.dropColumn("position");
      });
    }
  }
};
