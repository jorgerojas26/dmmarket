async function seedInventory(db) {
  if (await db("productos").where("IdProducto", "I-A").first()) return;
  for (const name of ["PrecioA", "Existencia"])
    if (!(await db.schema.hasColumn("productos", name)))
      await db.schema.alterTable("productos", (table) => table.decimal(name, 18, 6));
  if (!(await db.schema.hasTable("proveedores")))
    await db.schema.createTable("proveedores", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("IdProveedor", 32).primary();
      table.string("Empresa", 64);
      table.string("Rif", 64);
      table.string("Telfs", 64);
      table.string("Email", 64);
    });
  await db("proveedores").insert([
    {
      IdProveedor: "I-PROV-A",
      Empresa: "Proveedor inventario A",
      Rif: "PRIVATE-PROVIDER-RIF-A",
      Telfs: "PRIVATE-PROVIDER-PHONE-A",
      Email: "PRIVATE-PROVIDER-EMAIL-A",
    },
    {
      IdProveedor: "I-PROV-B",
      Empresa: "Proveedor inventario B",
      Rif: "PRIVATE-PROVIDER-RIF-B",
      Telfs: "PRIVATE-PROVIDER-PHONE-B",
      Email: "PRIVATE-PROVIDER-EMAIL-B",
    },
  ]);
  await db("grupos").insert({ IdGrupo: "I-H", Descripcion: "Grupo de inventario" });
  await db("productos").insert([
    {
      IdProducto: "I-A",
      Descripcion: "Inventario sintético A",
      Grupo: "G",
      Proveedor: "I-PROV-A",
      PrecioA: 123.45,
      Existencia: 2,
      Peso: 3,
    },
    {
      IdProducto: "I-B",
      Descripcion: "Inventario sintético B",
      Grupo: "G",
      Proveedor: "I-PROV-B",
      PrecioA: 50,
      Existencia: 0,
      Peso: 1,
    },
    {
      IdProducto: "I-C",
      Descripcion: "Inventario sintético C",
      Grupo: "MISSING",
      Proveedor: "MISSING",
      PrecioA: null,
      Existencia: null,
      Peso: null,
    },
    {
      IdProducto: "I-D",
      Descripcion: "Inventario sintético D",
      Grupo: "I-H",
      Proveedor: "I-PROV-A",
      PrecioA: 10,
      Existencia: -1,
      Peso: 2,
    },
  ]);
}

module.exports = { seedInventory };
