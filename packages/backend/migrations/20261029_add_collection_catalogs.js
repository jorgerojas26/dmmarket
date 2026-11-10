exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (knex) => {
  if (!(await knex.schema.hasTable("dmmarket_bank_settings"))) {
    await knex.schema.createTable("dmmarket_bank_settings", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_general_ci");
      table.string("id", 10).primary();
      table.boolean("active").notNullable().defaultTo(true);
    });
  }
  if (!(await knex.schema.hasTable("dmmarket_payment_methods"))) {
    await knex.schema.createTable("dmmarket_payment_methods", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_general_ci");
      table.string("id", 50).primary();
      table.string("name", 50).notNullable().unique();
      table.boolean("active").notNullable().defaultTo(true);
    });
    await knex("dmmarket_payment_methods").insert([
      { id: "TRANSFERENCIA", name: "Transferencia" },
      { id: "PAGO MOVIL", name: "Pago móvil" },
      { id: "EFECTIVO", name: "Efectivo" },
      { id: "TARJETA", name: "Tarjeta" },
      { id: "OTRO", name: "Otro" },
    ]);
  }
};

exports.down = async () => {
  throw new Error(
    "Los catálogos de cobranza se conservan para no perder su configuración ni reactivar registros retirados.",
  );
};
