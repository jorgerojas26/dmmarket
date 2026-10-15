exports.config = { transaction: false };

exports.up = async (knex) => {
  const core = await Promise.all(
    ["cxc_documentos", "cxc_movimientos", "cxc_cruces"].map((table) => knex.schema.hasTable(table)),
  );
  if (!core.every(Boolean)) return;
  if (!(await knex.schema.hasTable("cxc_operaciones"))) {
    await knex.schema.createTable("cxc_operaciones", (table) => {
      table.charset("utf8");
      table.collate("utf8_general_ci");
      table.string("IdOperacion", 36).primary();
      table.string("IdCliente", 15).notNullable().index();
      table.string("Tipo", 15).notNullable();
      table.integer("Referencia").nullable().index();
      table.string("Huella", 64).notNullable();
      table.text("Motivo").nullable();
      table.json("Datos").notNullable();
      table.dateTime("FechaRegistro", { precision: 3 }).notNullable();
      table.index(["IdCliente", "FechaRegistro"]);
      table.index(["Tipo", "Referencia"]);
    });
  }
  if (!(await knex.schema.hasTable("cxc_cierres"))) {
    await knex.schema.createTable("cxc_cierres", (table) => {
      table.charset("utf8");
      table.collate("utf8_general_ci");
      table.increments("IdCierre").primary();
      table.string("IdOperacion", 36).notNullable().references("IdOperacion").inTable("cxc_operaciones");
      table.integer("IdDocumento").notNullable().references("IdDocumento").inTable("cxc_documentos");
      table.decimal("Monto", 18, 4).notNullable();
      table.string("Reapertura", 36).nullable().references("IdOperacion").inTable("cxc_operaciones");
      table.index(["IdDocumento", "Reapertura"]);
    });
  }
};

exports.down = async (knex) => {
  if (await knex.schema.hasTable("cxc_operaciones")) {
    const row = await knex("cxc_operaciones").count("* as count").first();
    if (Number(row.count) > 0)
      throw new Error(
        "No se puede revertir la migración con operaciones de cobranza registradas. Conserva el historial financiero.",
      );
  }
  await knex.schema.dropTableIfExists("cxc_cierres");
  await knex.schema.dropTableIfExists("cxc_operaciones");
};
