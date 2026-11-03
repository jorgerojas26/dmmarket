async function seedProviders(db) {
  if (await db("mastercomp").where("IdFactura", "provider-purchase-A").first()) return;
  await db("productos").insert([
    { IdProducto: "PROV-P", Descripcion: "Producto del proveedor A", Grupo: "G", Proveedor: "PUR-A", Peso: 1 },
    { IdProducto: "PROV-Q", Descripcion: "Producto del proveedor B", Grupo: "G", Proveedor: "PUR-B", Peso: 1 },
  ]);
  await db("mastercomp").insert([
    {
      IdFactura: "provider-purchase-A",
      IdProveedor: "PUR-A",
      Nombre: "Histórico A",
      Rif: "PRIVATE-HEADER-RIF",
      Fecha: "2026-11-01",
      Anulada: false,
    },
    {
      IdFactura: "provider-purchase-B",
      IdProveedor: "PUR-B",
      Nombre: "Histórico B",
      Fecha: "2026-11-02",
      Anulada: false,
    },
    {
      IdFactura: "provider-purchase-missing",
      IdProveedor: "PROV-MISSING",
      Nombre: "Histórico sin ficha",
      Fecha: "2026-11-03",
      Anulada: false,
    },
    { IdFactura: "provider-purchase-void", IdProveedor: "PUR-A", Fecha: "2026-11-04", Anulada: true },
  ]);
  await db("slavecomp").insert([
    { IdFactura: "provider-purchase-A", IdProducto: "PROV-P", Descripcion: "Línea compra A", Precio: 7, Cantidad: 2 },
    { IdFactura: "provider-purchase-B", IdProducto: "PROV-Q", Descripcion: "Línea compra B", Precio: 99, Cantidad: 1 },
    { IdFactura: "provider-purchase-missing", IdProducto: "PROV-P", Precio: 33, Cantidad: 1 },
    { IdFactura: "provider-purchase-void", IdProducto: "PROV-P", Precio: 9999, Cantidad: 1 },
  ]);
  for (const [master, slave, key] of [
    ["masterfact", "slavefact", "IdFactura"],
    ["masternoe", "slavenoe", "IdNoe"],
  ]) {
    await db(master).insert([
      {
        [key]: "provider-sale-A",
        IdVend: "A",
        IdCliente: "C",
        Rif: "PRIVATE-SALE-RIF",
        Fecha: "2026-11-01",
        Anulada: false,
      },
      {
        [key]: "provider-sale-B",
        IdVend: "B",
        IdCliente: "C",
        Rif: "PRIVATE-SALE-RIF",
        Fecha: "2026-11-02",
        Anulada: false,
      },
    ]);
    await db(slave).insert([
      {
        [key]: "provider-sale-A",
        IdProducto: "PROV-P",
        Descripcion: "Venta proveedor A",
        Precio: 100,
        Costo: 60,
        Cantidad: 1,
      },
      {
        [key]: "provider-sale-A",
        IdProducto: "PROV-Q",
        Descripcion: "Venta proveedor B",
        Precio: 90,
        Costo: 10,
        Cantidad: 1,
      },
      {
        [key]: "provider-sale-B",
        IdProducto: "PROV-P",
        Descripcion: "Venta ajena proveedor A",
        Precio: 200,
        Costo: 90,
        Cantidad: 1,
      },
    ]);
  }
}

module.exports = { seedProviders };
