// Índice compuesto (Anulada, Fecha) en masterfact.
//
// Los reportes filtran con `Anulada = 0 AND Fecha BETWEEN ...`. El índice
// anterior idx_masterfact_fecha (Fecha sola) dejaba al optimizador eligiendo
// full scan de las 213K filas en varias queries del dashboard; el compuesto
// permite range scan directo. Mejora el count del despacho ~4.5x; en el
// dashboard el cuello real estaba en los escaneos repetidos de slavefact
// (refactor en controllers/dashboard.js), no en este índice.

exports.up = async (knex) => {
  const [{ c }] = await knex("information_schema.statistics").count("* as c").where({
    table_schema: process.env.DATABASE_NAME,
    table_name: "masterfact",
    index_name: "idx_masterfact_anulada_fecha",
  });

  if (Number(c) === 0) {
    await knex.raw("ALTER TABLE masterfact ADD INDEX idx_masterfact_anulada_fecha (Anulada, Fecha)");
  }
};

exports.down = async (knex) => {
  await knex.raw("ALTER TABLE masterfact DROP INDEX idx_masterfact_anulada_fecha");
};
