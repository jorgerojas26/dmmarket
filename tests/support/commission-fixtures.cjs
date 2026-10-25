async function seedCommissions(db) {
  if (await db.schema.hasTable("vendedor_comisiones")) return;
  for (const [name, define] of [
    [
      "vendedor_comisiones",
      (table) => {
        table.string("vendedorId", 8);
        table.string("grupoId", 10);
        table.float("comision");
      },
    ],
    [
      "fact_vendedor_comisiones",
      (table) => {
        table.string("masterfactId", 12);
        table.string("grupoId", 10);
        table.float("comision");
      },
    ],
  ])
    await db.schema.createTable(name, (table) => {
      table.engine("MyISAM");
      table.charset("utf8");
      table.collate("utf8_bin");
      table.increments("id");
      define(table);
    });
  await db("grupos").insert([
    { IdGrupo: "COM-G2", Descripcion: "Grupo comisión secundario" },
    { IdGrupo: "COM-G3", Descripcion: "Grupo comisión inválida" },
  ]);
  await db("vendedor_comisiones").insert([
    { vendedorId: "A", grupoId: "G", comision: 10 },
    { vendedorId: "B", grupoId: "G", comision: 80 },
    { vendedorId: "A", grupoId: "COM-G2", comision: 2 },
    { vendedorId: "A", grupoId: "COM-G2", comision: 3 },
    { vendedorId: "A", grupoId: "COM-G3", comision: -5 },
  ]);
  for (const [master, slave, key, vendor] of [
    ["masterfact", "slavefact", "IdFactura", "A"],
    ["masternoe", "slavenoe", "IdNoe", "B"],
  ]) {
    await db(master).insert([
      {
        [key]: "COM-A",
        IdVend: vendor,
        IdCliente: "C",
        Rif: "PRIVATE-COMMISSION-RIF",
        Fecha: "2026-12-01",
        Anulada: false,
      },
      { [key]: "COM-B", IdVend: "B", IdCliente: "C", Fecha: "2026-12-02", Anulada: false },
      { [key]: "COM-MISS", IdVend: "A", IdCliente: "C", Fecha: "2026-12-03", Anulada: false },
      { [key]: "COM-DUP", IdVend: "A", IdCliente: "C", Fecha: "2026-12-04", Anulada: false },
      { [key]: "COM-ZERO", IdVend: "A", IdCliente: "C", Fecha: "2026-12-05", Anulada: false },
      { [key]: "COM-ORPHAN", IdVend: "A", IdCliente: "C", Fecha: "2026-12-06", Anulada: false },
      { [key]: "COM-VOID", IdVend: "A", IdCliente: "C", Fecha: "2026-12-07", Anulada: true },
    ]);
    await db(slave).insert([
      { [key]: "COM-A", IdProducto: "P", Descripcion: "Línea comisión A", Precio: 20, Costo: 10, Cantidad: 2 },
      { [key]: "COM-A", IdProducto: "P", Descripcion: "Línea comisión A", Precio: 30, Costo: 10, Cantidad: 2 },
      { [key]: "COM-B", IdProducto: "P", Precio: 1000, Costo: 1, Cantidad: 1 },
      { [key]: "COM-MISS", IdProducto: "P", Precio: 50, Costo: 10, Cantidad: 1 },
      { [key]: "COM-DUP", IdProducto: "P", Precio: 100, Costo: 10, Cantidad: 1 },
      { [key]: "COM-ZERO", IdProducto: "P", Precio: 100, Costo: 10, Cantidad: 1 },
      { [key]: "COM-ORPHAN", IdProducto: "COM-MISSING", Precio: 20, Costo: 10, Cantidad: 1 },
      { [key]: "COM-VOID", IdProducto: "P", Precio: 9999, Costo: 1, Cantidad: 1 },
    ]);
  }
  await db("fact_vendedor_comisiones").insert([
    { masterfactId: "COM-A", grupoId: "G", comision: 10 },
    { masterfactId: "COM-B", grupoId: "G", comision: 80 },
    { masterfactId: "COM-DUP", grupoId: "G", comision: 10 },
    { masterfactId: "COM-DUP", grupoId: "G", comision: 20 },
    { masterfactId: "COM-ZERO", grupoId: "G", comision: 0 },
  ]);
}

module.exports = { seedCommissions };
