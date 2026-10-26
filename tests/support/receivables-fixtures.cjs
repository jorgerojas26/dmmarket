async function seedReceivables(db) {
  if (await db.schema.hasTable("cxc_documentos")) return;
  for (const [name, define] of [
    [
      "cxc_documentos",
      (table) => {
        table.specificType("IdDocumento", "INT NOT NULL AUTO_INCREMENT PRIMARY KEY");
        table.string("IdFactura", 32);
        table.string("IdCliente", 15);
        table.string("TipoDoc", 3);
        table.date("FechaEmision");
        table.date("FechaVencimiento");
        table.string("MonedaOriginal", 3);
        table.decimal("MontoOriginal", 18, 4);
        table.decimal("SaldoActual", 18, 4);
        table.string("Estatus", 15);
        table.index("IdCliente");
      },
    ],
    [
      "cxc_movimientos",
      (table) => {
        table.increments("IdMov");
        table.dateTime("Fecha");
        table.string("IdCliente", 15);
        table.string("MonedaPago", 3);
        table.decimal("TasaCambio", 18, 6);
        table.decimal("MontoPago", 18, 4);
        table.decimal("MontoBase", 18, 4);
        table.string("FormaPago", 50);
        table.string("Referencia", 50);
        table.string("Banco", 50);
        table.text("Observaciones");
      },
    ],
    [
      "cxc_cruces",
      (table) => {
        table.increments("IdCruce");
        table.integer("IdMovimiento");
        table.integer("IdDocumento");
        table.decimal("MontoAplicado", 18, 4);
        table.dateTime("FechaCruce");
      },
    ],
    [
      "bancos",
      (table) => {
        table.string("Id_Banco", 10).primary();
        table.string("Nombre", 64);
      },
    ],
  ])
    await db.schema.createTable(name, (table) => {
      table.engine("InnoDB");
      table.charset("utf8");
      table.collate("utf8_bin");
      define(table);
    });
  await require("../../packages/backend/migrations/20261011_add_receivables_operations").up(db);
  if (!(await db.schema.hasColumn("divisas", "IdDivisa")))
    await db.schema.alterTable("divisas", (table) => table.string("IdDivisa", 8));
  await db("divisas").where("Simbolo", "BsS").update({ IdDivisa: "REF" });
  await db("bancos").insert({ Id_Banco: "B1", Nombre: "Banco sintético" });
  await db("clientes").insert({
    IdCliente: "CXC-C2",
    Empresa: "Cliente cobranza dos",
    Rif: "PRIVATE-CXC-RIF",
    Ruta: "R2",
  });
  await db("masterfact").insert([
    { IdFactura: "CXC-C2", IdCliente: "CXC-C2", IdVend: "B", Fecha: "2026-01-01", Anulada: false },
    { IdFactura: "CXC-HIST", IdCliente: "CXC-HIST", IdVend: "A", Fecha: "2026-01-01", Anulada: false },
  ]);
  await db("cxc_documentos").insert([
    {
      IdDocumento: 1,
      IdFactura: "1",
      IdCliente: "C",
      TipoDoc: "FAC",
      FechaEmision: "2026-01-01",
      FechaVencimiento: "2026-01-05",
      MonedaOriginal: "USD",
      MontoOriginal: 100,
      SaldoActual: 100,
      Estatus: "PENDIENTE",
    },
    {
      IdDocumento: 2,
      IdFactura: "2",
      IdCliente: "C",
      TipoDoc: "FAC",
      FechaEmision: "2026-01-02",
      FechaVencimiento: "2026-02-01",
      MonedaOriginal: "USD",
      MontoOriginal: 200,
      SaldoActual: 200,
      Estatus: "PENDIENTE",
    },
    {
      IdDocumento: 3,
      IdFactura: "CXC-C2",
      IdCliente: "CXC-C2",
      TipoDoc: "FAC",
      FechaEmision: "2026-01-01",
      FechaVencimiento: "2026-01-05",
      MonedaOriginal: "USD",
      MontoOriginal: 75,
      SaldoActual: 75,
      Estatus: "PENDIENTE",
    },
    {
      IdDocumento: 4,
      IdFactura: "CXC-HIST",
      IdCliente: "CXC-HIST",
      TipoDoc: "FAC",
      FechaEmision: "2026-01-01",
      FechaVencimiento: "2026-01-05",
      MonedaOriginal: "USD",
      MontoOriginal: 25,
      SaldoActual: 25,
      Estatus: "PENDIENTE",
    },
    {
      IdDocumento: 5,
      IdFactura: "void",
      IdCliente: "C",
      TipoDoc: "FAC",
      FechaEmision: "2026-01-01",
      FechaVencimiento: "2026-01-05",
      MonedaOriginal: "USD",
      MontoOriginal: 999,
      SaldoActual: 999,
      Estatus: "PENDIENTE",
    },
    {
      IdDocumento: 6,
      IdFactura: "1",
      IdCliente: "CXC-C2",
      TipoDoc: "FAC",
      FechaEmision: "2026-01-01",
      FechaVencimiento: "2026-01-05",
      MonedaOriginal: "USD",
      MontoOriginal: 888,
      SaldoActual: 888,
      Estatus: "PENDIENTE",
    },
  ]);
}

module.exports = { seedReceivables };

async function prepareReceivablesWrites(db) {
  await require("../../packages/backend/migrations/20261026_add_receivables_actor").up(db);
  for (const table of ["cxc_operaciones", "cxc_cierres"]) await db.raw("ALTER TABLE ?? ENGINE=InnoDB", [table]);
}

module.exports.prepareReceivablesWrites = prepareReceivablesWrites;
