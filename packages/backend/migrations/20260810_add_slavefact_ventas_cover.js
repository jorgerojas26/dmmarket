exports.up = async (knex) => {
  await knex.raw("SET SESSION sql_mode = ''");

  const [{ c }] = await knex("information_schema.statistics").count("* as c").where({
    table_schema: process.env.DATABASE_NAME,
    table_name: "slavefact",
    index_name: "idx_slavefact_ventas_cover",
  });

  if (Number(c) === 0) {
    await knex.raw(
      "ALTER TABLE slavefact ADD INDEX idx_slavefact_ventas_cover (IdFactura, IdProducto, Precio, Cantidad, Costo)",
    );
  }
};

exports.down = async (knex) => {
  const [previous] = await knex.raw("SHOW INDEX FROM slavefact WHERE Key_name = ?", ["idx_slavefact_ventas"]);
  if (previous.length === 0) {
    await knex.raw("ALTER TABLE slavefact ADD INDEX idx_slavefact_ventas (IdFactura, Precio, Cantidad, Costo)");
  }
  const [cover] = await knex.raw("SHOW INDEX FROM slavefact WHERE Key_name = ?", ["idx_slavefact_ventas_cover"]);
  if (cover.length > 0) await knex.raw("ALTER TABLE slavefact DROP INDEX idx_slavefact_ventas_cover");
};
