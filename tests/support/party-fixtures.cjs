async function seedParties(db) {
  if (await db.schema.hasColumn("vendedores", "Telfs")) {
    if (!(await db("clientes").where("IdCliente", "CB").where("Empresa", "Cliente exclusivo de B").first()))
      throw new Error("El esquema no pertenece al fixture de directorios.");
    return;
  }
  await db.schema.createTable("rutas", (table) => {
    table.engine("InnoDB");
    table.charset("utf8");
    table.collate("utf8_bin");
    table.string("Id_Ruta", 32).primary();
    table.string("Nombre", 64);
  });
  await db("rutas").insert({ Id_Ruta: "R", Nombre: "Ruta sintética" });
  await db.schema.alterTable("vendedores", (table) => {
    table.string("Rif", 64);
    table.string("Ci", 64);
    table.string("Telfs", 64);
    table.string("Email", 64);
  });
  for (const id of ["A", "B"])
    await db("vendedores")
      .where("idVend", id)
      .update({
        Rif: `PRIVATE-RIF-${id}`,
        Ci: `PRIVATE-CI-${id}`,
        Telfs: `PRIVATE-PHONE-${id}`,
        Email: `PRIVATE-EMAIL-${id}`,
      });
  await db("clientes").insert([
    { IdCliente: "CB", Empresa: "Cliente exclusivo de B", Ruta: "R", Rif: "PRIVATE-CLIENT-B" },
    { IdCliente: "NEVER", Empresa: "Cliente sin ventas", Ruta: "R", Rif: "PRIVATE-CLIENT-N" },
  ]);
  for (const [master, slave, key] of [
    ["masterfact", "slavefact", "IdFactura"],
    ["masternoe", "slavenoe", "IdNoe"],
  ]) {
    await db(master).insert({
      [key]: "B-exclusive",
      IdVend: "B",
      IdCliente: "CB",
      Fecha: "2026-01-05",
      Anulada: false,
    });
    await db(slave).insert({
      [key]: "B-exclusive",
      IdProducto: "P",
      Descripcion: "Venta solo B",
      Precio: 250,
      Costo: 150,
      Cantidad: 1,
    });
  }
}

module.exports = { seedParties };
