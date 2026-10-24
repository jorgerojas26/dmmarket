async function seedPurchases(db) {
  if (!(await db.schema.hasTable("mastercomp"))) {
    await db.schema.createTable("mastercomp", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("IdFactura", 32).primary();
      table.date("Fecha");
      table.boolean("Anulada");
    });
    await db.schema.createTable("slavecomp", (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.string("IdFactura", 32);
      table.string("IdProducto", 32);
      table.decimal("Precio", 18, 6);
      table.decimal("Cantidad", 18, 6);
    });
  }
  if (await db("mastercomp").where("IdFactura", "purchase-august-A").first()) return;
  for (const name of ["IdProveedor", "Nombre", "Rif"])
    if (!(await db.schema.hasColumn("mastercomp", name)))
      await db.schema.alterTable("mastercomp", (table) => table.string(name, 64));
  if (!(await db.schema.hasColumn("slavecomp", "Descripcion")))
    await db.schema.alterTable("slavecomp", (table) => table.string("Descripcion", 64));
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
      IdProveedor: "PUR-A",
      Empresa: "Proveedor compras A",
      Rif: "PRIVATE-PUR-RIF-A",
      Telfs: "PRIVATE-PUR-PHONE-A",
      Email: "PRIVATE-PUR-EMAIL-A",
    },
    { IdProveedor: "PUR-B", Empresa: "Proveedor compras B", Rif: "PRIVATE-PUR-RIF-B" },
  ]);
  await db("mastercomp").insert([
    {
      IdFactura: "purchase-august-A",
      IdProveedor: "PUR-A",
      Nombre: "Histórico proveedor A",
      Rif: "PRIVATE-PUR-SNAPSHOT-A",
      Fecha: "2026-08-01",
      Anulada: false,
    },
    {
      IdFactura: "purchase-august-B",
      IdProveedor: "PUR-B",
      Nombre: "Histórico proveedor B",
      Rif: "PRIVATE-PUR-SNAPSHOT-B",
      Fecha: "2026-08-02",
      Anulada: false,
    },
    {
      IdFactura: "purchase-august-empty",
      IdProveedor: "PUR-A",
      Nombre: "Histórico proveedor A",
      Fecha: "2026-08-03",
      Anulada: false,
    },
    { IdFactura: "purchase-august-void", IdProveedor: "PUR-A", Fecha: "2026-08-04", Anulada: true },
    { IdFactura: "purchase-september", IdProveedor: "PUR-B", Fecha: "2026-09-01", Anulada: false },
  ]);
  await db("slavecomp").insert([
    { IdFactura: "purchase-august-A", IdProducto: "P", Descripcion: "Producto compra P", Precio: 10, Cantidad: 2 },
    { IdFactura: "purchase-august-A", IdProducto: "P", Descripcion: "Producto compra P", Precio: 20, Cantidad: 3 },
    {
      IdFactura: "purchase-august-B",
      IdProducto: "MISSING-PUR",
      Descripcion: "Producto histórico comprado",
      Precio: 50,
      Cantidad: 1,
    },
    { IdFactura: "purchase-august-void", IdProducto: "P", Precio: 9999, Cantidad: 1 },
    { IdFactura: "purchase-september", IdProducto: "P", Precio: 1234, Cantidad: 1 },
  ]);
}

module.exports = { seedPurchases };
