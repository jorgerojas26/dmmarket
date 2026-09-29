// Opt-in MySQL integration tests. Isolated fixture tables are removed afterwards.
// MySQL 5.7 cannot reference a TEMPORARY table twice in the same query.
const describeDatabase = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDatabase("client historical aggregations (MySQL)", () => {
  let db, buildInactiveBucketsQuery, buildClientHistoryQuery;
  const masterTable = `test_client_headers_${process.pid}`;
  const slaveTable = `test_client_lines_${process.pid}`;
  const idInvoice = "IdFactura";

  beforeAll(async () => {
    const knex = require("knex");
    db = knex({ ...require("../knexfile"), pool: { min: 1, max: 1 } });
    jest.doMock("../database", () => db);
    ({ buildInactiveBucketsQuery } = require("../controllers/clients/dashboard"));
    ({ buildClientHistoryQuery } = require("../utils/client-history"));
    await db.raw(
      `CREATE TABLE ?? (
      IdFactura INT PRIMARY KEY, IdCliente VARCHAR(20), Fecha DATE, Anulada INT,
      INDEX (IdCliente, Anulada, Fecha))`,
      [masterTable],
    );
    await db.raw(
      `CREATE TABLE ?? (
      IdFactura INT, Precio DECIMAL(10,2), Cantidad DECIMAL(10,2), INDEX (IdFactura))`,
      [slaveTable],
    );
    await db(masterTable).insert([
      { IdFactura: 1, IdCliente: "recent", Fecha: "2026-09-28", Anulada: 0 },
      { IdFactura: 2, IdCliente: "recent", Fecha: "2025-09-28", Anulada: 0 },
      { IdFactura: 3, IdCliente: "recent", Fecha: "2025-09-27", Anulada: 0 },
      { IdFactura: 4, IdCliente: "old", Fecha: "2024-01-01", Anulada: 0 },
      { IdFactura: 5, IdCliente: "old", Fecha: "2026-09-20", Anulada: 0 }, // no lines; window anchor only
      { IdFactura: 6, IdCliente: "empty", Fecha: "2026-09-25", Anulada: 0 },
      { IdFactura: 7, IdCliente: "risk", Fecha: "2026-01-01", Anulada: 0 },
      { IdFactura: 8, IdCliente: "risk", Fecha: "2026-09-28", Anulada: 1 },
      { IdFactura: 9, IdCliente: "risk", Fecha: "2026-10-01", Anulada: 0 },
    ]);
    await db(slaveTable).insert([
      { IdFactura: 1, Precio: 10, Cantidad: 2 },
      { IdFactura: 1, Precio: 5, Cantidad: 1 },
      { IdFactura: 2, Precio: 100, Cantidad: 1 },
      { IdFactura: 3, Precio: 1000, Cantidad: 1 },
      { IdFactura: 4, Precio: 900, Cantidad: 1 },
      { IdFactura: 7, Precio: 300, Cantidad: 1 },
      { IdFactura: 8, Precio: 9999, Cantidad: 1 },
      { IdFactura: 9, Precio: 9999, Cantidad: 1 },
    ]);
  });

  afterAll(async () => {
    if (db) {
      await db.raw("DROP TABLE IF EXISTS ??, ??", [slaveTable, masterTable]);
      await db.destroy();
    }
  });

  it("filters lines to 12 months without changing activity for headers without lines", async () => {
    const query = buildInactiveBucketsQuery({ masterTable, slaveTable, idInvoice, to: "2026-09-29" });
    // The lower bound must filter the join, not merely condition the SUM.
    expect(query.toSQL().sql).toMatch(/and `mf`\.`Fecha` >= DATE_SUB/);
    const rows = await query;
    const values = rows.map((r) => ({
      bucket: r.bucket,
      count: Number(r.count),
      revenue: Number(r.revenue),
      risk_amount: Number(r.risk_amount),
      risk_clients: Number(r.risk_clients),
    }));
    expect(values).toEqual([
      { bucket: "0-7d", count: 1, revenue: 125, risk_amount: 0, risk_clients: 0 },
      // 'old' remains here with zero revenue, despite its recent empty header.
      { bucket: ">90d", count: 2, revenue: 300, risk_amount: 300, risk_clients: 2 },
    ]);
  });

  it("scopes activity and revenue to the selected route clients", async () => {
    const rows = await buildInactiveBucketsQuery({
      masterTable,
      slaveTable,
      idInvoice,
      to: "2026-09-29",
      routeClients: ["old"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ bucket: ">90d", count: 1 }));
    expect(Number(rows[0].revenue)).toBe(0);
  });
  it("combines history and money without losing empty headers or multiplying revenue", async () => {
    const rows = await buildClientHistoryQuery({
      masterTable,
      slaveTable,
      idInvoice,
      to: "2026-09-29",
      clientIds: ["recent", "old", "empty"],
    });
    const byClient = new Map(rows.map((r) => [r.IdCliente, r]));
    expect(Number(byClient.get("recent").revenue_historico)).toBe(1125);
    expect(Number(byClient.get("old").dias_inactivo)).toBe(9);
    expect(Number(byClient.get("old").revenue_historico)).toBe(900);
    expect(Number(byClient.get("empty").dias_inactivo)).toBe(4);
    expect(Number(byClient.get("empty").revenue_historico)).toBe(0);
  });
});
