// Reemplaza idx_slavefact_ventas por idx_slavefact_ventas_cover.
//
// El desglose de proveedores agrega ventas por proveedor a través de productos:
// `productos JOIN slavefact ON IdProducto JOIN masterfact ON IdFactura`.
// Con idx_slavefact_ventas (IdFactura, Precio, Cantidad, Costo) el probe de
// slavefact necesitaba leer IdProducto de la tabla (PK lookups sobre 876K filas,
// ~5s full history). El cubriente (IdFactura, IdProducto, Precio, Cantidad, Costo)
// hace el probe index-only: ventas por proveedor 5.1s -> 1.7s, conteos 3.9s -> 2.2s.
// Al compartir el prefijo IdFactura, sigue cubriendo los agregados del desglose
// de clientes (Precio, Cantidad, Costo presentes) — el viejo queda redundante.

exports.up = async (knex) => {
  // Igual que en masterfact: relaja NO_ZERO_DATE para poder ALTER TABLE slavefact.
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

  await knex.raw("ALTER TABLE slavefact DROP INDEX idx_slavefact_ventas");
};

exports.down = async (knex) => {
  await knex.raw("ALTER TABLE slavefact ADD INDEX idx_slavefact_ventas (IdFactura, Precio, Cantidad, Costo)");
  await knex.raw("ALTER TABLE slavefact DROP INDEX idx_slavefact_ventas_cover");
};
