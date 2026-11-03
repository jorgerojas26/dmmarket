async function seedPareto(db) {
  if (await db.schema.hasTable("mastercomp")) {
    if (!(await db("mastercomp").where("IdFactura", "pareto-june").first()))
      throw new Error("El esquema no pertenece al fixture Pareto.");
    return;
  }
  await db.schema.alterTable("productos", (table) => {
    table.decimal("PrecioA", 18, 6);
    table.decimal("Existencia", 18, 6);
  });
  await db("productos").where("IdProducto", "P").update({ PrecioA: 100, Existencia: 3 });
  await db("productos").insert([
    { IdProducto: "Q", Descripcion: "Producto maduro", Grupo: "G", Proveedor: "PROV", PrecioA: 50, Existencia: 10 },
    { IdProducto: "R", Descripcion: "Producto reciente", Grupo: "G", Proveedor: "PROV", PrecioA: 25, Existencia: 4 },
    { IdProducto: "S", Descripcion: "Producto sin vender", Grupo: "G", Proveedor: "PROV", PrecioA: 60, Existencia: 5 },
  ]);
  for (const [name, define] of [
    [
      "mastercomp",
      (table) => {
        table.string("IdFactura", 32).primary();
        table.date("Fecha");
        table.boolean("Anulada");
      },
    ],
    [
      "slavecomp",
      (table) => {
        table.string("IdFactura", 32);
        table.string("IdProducto", 32);
        table.decimal("Precio", 18, 6);
        table.decimal("Cantidad", 18, 6);
      },
    ],
  ])
    await db.schema.createTable(name, (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      define(table);
    });
  await db("mastercomp").insert([
    { IdFactura: "pareto-old", Fecha: "2010-01-01", Anulada: false },
    { IdFactura: "pareto-june", Fecha: "2026-06-15", Anulada: false },
    { IdFactura: "pareto-boundary", Fecha: "2026-06-01", Anulada: false },
    { IdFactura: "pareto-recent", Fecha: "2026-06-02", Anulada: false },
    { IdFactura: "pareto-void", Fecha: "2009-01-01", Anulada: true },
    { IdFactura: "pareto-future", Fecha: "2027-01-01", Anulada: false },
  ]);
  await db("slavecomp").insert([
    { IdFactura: "pareto-old", IdProducto: "P", Precio: 10, Cantidad: 1 },
    { IdFactura: "pareto-old", IdProducto: "S", Precio: 10, Cantidad: 1 },
    { IdFactura: "pareto-june", IdProducto: "P", Precio: 61, Cantidad: 2 },
    { IdFactura: "pareto-june", IdProducto: "S", Precio: 50, Cantidad: 4 },
    { IdFactura: "pareto-boundary", IdProducto: "Q", Precio: 10, Cantidad: 5 },
    { IdFactura: "pareto-recent", IdProducto: "R", Precio: 1, Cantidad: 5 },
    { IdFactura: "pareto-void", IdProducto: "R", Precio: 1, Cantidad: 1 },
    { IdFactura: "pareto-future", IdProducto: "R", Precio: 1, Cantidad: 1 },
  ]);
  for (const [master, slave, key] of [
    ["masterfact", "slavefact", "IdFactura"],
    ["masternoe", "slavenoe", "IdNoe"],
  ]) {
    await db(master).insert([
      { [key]: "pareto-A", IdVend: "A", IdCliente: "C", Fecha: "2026-06-20", Anulada: false },
      { [key]: "pareto-B", IdVend: "B", IdCliente: "C", Fecha: "2026-06-20", Anulada: false },
    ]);
    await db(slave).insert([
      { [key]: "pareto-A", IdProducto: "P", Descripcion: "Producto P", Precio: 100, Costo: 61, Cantidad: 1 },
      { [key]: "pareto-A", IdProducto: "Q", Descripcion: "Producto Q", Precio: 40, Costo: 10, Cantidad: 2 },
      { [key]: "pareto-A", IdProducto: "R", Descripcion: "Producto R", Precio: 20, Costo: 1, Cantidad: 1 },
      { [key]: "pareto-B", IdProducto: "Q", Descripcion: "Producto privado B", Precio: 1000, Costo: 1, Cantidad: 1 },
    ]);
  }
}

module.exports = { seedPareto };
