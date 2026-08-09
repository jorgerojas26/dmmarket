// Índice cubriente (IdFactura, Precio, Cantidad, Costo) en slavefact.
//
// El desglose de clientes agrega SUM(Precio*Cantidad) / SUM((Precio-Costo)*Cantidad)
// por cliente: `FROM slavefact JOIN masterfact ... GROUP BY IdCliente`. Con solo
// idx_slavefact_factura (IdFactura) cada fila del join exigía un PK lookup a la
// tabla (876K filas) para leer Precio/Cantidad/Costo. El índice cubriente hace el
// scan index-only: full history 4.3s -> 1.3s en la réplica local. Como arranca con
// IdFactura, también cubre los joins existentes por factura.

exports.up = async (knex) => {
  const [{ c }] = await knex("information_schema.statistics").count("* as c").where({
    table_schema: process.env.DATABASE_NAME,
    table_name: "slavefact",
    index_name: "idx_slavefact_ventas",
  });

  if (Number(c) === 0) {
    await knex.raw("ALTER TABLE slavefact ADD INDEX idx_slavefact_ventas (IdFactura, Precio, Cantidad, Costo)");
  }
};

exports.down = async (knex) => {
  await knex.raw("ALTER TABLE slavefact DROP INDEX idx_slavefact_ventas");
};
