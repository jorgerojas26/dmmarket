exports.config = { transaction: false, scope: "dmmarket" };

exports.up = async (knex) => {
  const core = await Promise.all(
    ["cxc_documentos", "cxc_movimientos", "cxc_cruces"].map((table) => knex.schema.hasTable(table)),
  );
  if (!core.every(Boolean)) return;
  const [[server]] = await knex.raw("SELECT VERSION() AS version");
  const parts = server.version.match(/(\d+)\.(\d+)\.(\d+)(?=-MariaDB)/i) || server.version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!parts) throw new Error("No se pudo identificar la versión de MySQL para preparar cuentas por cobrar.");
  const version = Number(parts[1]) * 10000 + Number(parts[2]) * 100 + Number(parts[3]);
  const maria = /MariaDB/i.test(server.version);
  const json = version >= (maria ? 100207 : 50708);
  const fractional = version >= (maria ? 50300 : 50604);
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
      if (json) table.json("Datos").notNullable();
      else table.text("Datos", "longtext").notNullable();
      table.dateTime("FechaRegistro", fractional ? { precision: 3 } : {}).notNullable();
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
