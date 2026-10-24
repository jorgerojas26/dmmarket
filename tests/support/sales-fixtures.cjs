async function seedSales(db) {
  for (const [name, define] of [
    [
      "vendedores",
      (table) => {
        table.string("idVend", 32).primary();
        table.string("Empresa", 64);
      },
    ],
    [
      "clientes",
      (table) => {
        table.string("IdCliente", 32).primary();
        table.string("Empresa", 64);
        table.string("Ruta", 32);
        table.string("Rif", 32);
      },
    ],
    [
      "productos",
      (table) => {
        table.string("IdProducto", 32).primary();
        table.string("Descripcion", 64);
        table.string("Grupo", 32);
        table.string("Proveedor", 32);
        table.decimal("Peso", 12, 3);
      },
    ],
    ...["masterfact", "masternoe"].map((name) => [
      name,
      (table) => {
        table.string(name === "masterfact" ? "IdFactura" : "IdNoe", 32).primary();
        table.string("IdVend", 32);
        table.string("IdCliente", 32);
        table.date("Fecha");
        table.boolean("Anulada");
      },
    ]),
    ...["slavefact", "slavenoe"].map((name) => [
      name,
      (table) => {
        table.string(name === "slavefact" ? "IdFactura" : "IdNoe", 32);
        table.string("IdProducto", 32);
        table.decimal("Precio", 18, 6);
        table.decimal("Costo", 18, 6);
        table.decimal("Cantidad", 18, 6);
      },
    ]),
  ]) {
    if (name === "vendedores" && (await db.schema.hasTable(name))) {
      if (!(await db.schema.hasColumn(name, "Empresa")))
        await db.schema.alterTable(name, (table) => table.string("Empresa", 64));
      continue;
    }
    await db.schema.createTable(name, (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      define(table);
    });
  }
  for (const seller of [
    { idVend: "A", Empresa: "Vendedor A" },
    { idVend: "B", Empresa: "Vendedor B" },
  ]) {
    if (await db("vendedores").where("idVend", seller.idVend).first())
      await db("vendedores").where("idVend", seller.idVend).update(seller);
    else await db("vendedores").insert(seller);
  }
  await db("clientes").insert({
    IdCliente: "C",
    Empresa: "Cliente sintético",
    Ruta: "R",
    Rif: "PRIVATE-IDENTIFICATION",
  });
  await db("productos").insert({
    IdProducto: "P",
    Descripcion: "Producto sintético",
    Grupo: "G",
    Proveedor: "PROV",
    Peso: 2,
  });
  for (const [master, slave, key, reversed] of [
    ["masterfact", "slavefact", "IdFactura", false],
    ["masternoe", "slavenoe", "IdNoe", true],
  ]) {
    await db(master).insert([
      { [key]: "1", IdVend: reversed ? "B" : "A", IdCliente: "C", Fecha: "2026-01-01", Anulada: false },
      { [key]: "2", IdVend: reversed ? "A" : "B", IdCliente: "C", Fecha: "2026-01-02", Anulada: false },
      { [key]: "void", IdVend: "A", IdCliente: "C", Fecha: "2026-01-03", Anulada: true },
    ]);
    await db(slave).insert([
      { [key]: "1", IdProducto: "P", Precio: 100, Costo: 61, Cantidad: 1 },
      { [key]: "2", IdProducto: "P", Precio: 200, Costo: 93, Cantidad: 1 },
      { [key]: "void", IdProducto: "P", Precio: 999, Costo: 1, Cantidad: 1 },
    ]);
  }
}

module.exports = { seedSales };
