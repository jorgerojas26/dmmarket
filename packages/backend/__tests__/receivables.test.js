const { randomUUID } = require("node:crypto");
const { decimal, fixed, allocate } = require("../utils/receivables-money");
const { createReceivablesService, input, localDate } = require("../receivables");

it("calculates applications and excess without floating point drift", () => {
  expect(
    allocate(
      [
        { IdDocumento: 1, IdFactura: "A", SaldoActual: "0.1000" },
        { IdDocumento: 2, IdFactura: "B", SaldoActual: "0.2000" },
      ],
      "0.3000",
    ),
  ).toEqual({
    applications: [
      { id: 1, sale: "A", amount: "0.1000" },
      { id: 2, sale: "B", amount: "0.2000" },
    ],
    applied: "0.3000",
    excess: "0.0000",
  });
  expect(allocate([{ IdDocumento: 1, SaldoActual: "100.0000" }], "120.0000").excess).toBe("20.0000");
  expect(fixed(decimal("0.0001", 4, true))).toBe("0.0001");
});

it("rejects invalid financial amounts and dates", () => {
  for (const value of ["0", "-1", "1e3", "Infinity", "1.00001", "100000000000000", [10], { amount: 10 }])
    expect(() => decimal(value, 4, true)).toThrow();
  const body = { type: "payment", amount: "1", currency: "USD", method: "EFECTIVO", date: "2026-02-30" };
  expect(() => input(body, "2026-10-11")).toThrow("fecha");
  expect(() => input({ ...body, date: "2026-10-12" }, "2026-10-11")).toThrow("fecha");
  expect(localDate(new Date("2026-10-11T02:00:00Z"))).toBe("2026-10-10");
  expect(() => input({ type: "__proto__", id: 1, reason: "test" }, "2026-10-11")).toThrow("Operación");
  expect(() => decimal("1000000000000", 6, true)).toThrow();
});

const describeMysql = process.env.RUN_CXC_DB_TESTS === "1" ? describe : describe.skip;

describeMysql("receivables transactions (isolated MySQL database)", () => {
  let db, admin, service;
  const database = `test_receivables_${process.pid}`;
  const connection = {
    host: process.env.TEST_MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.TEST_MYSQL_PORT || 3307),
    user: process.env.TEST_MYSQL_USER || "root",
    password: process.env.TEST_MYSQL_PASSWORD || "root",
  };
  let clock = Date.parse("2026-10-11T12:00:00Z");
  const now = () => new Date(clock);

  beforeAll(async () => {
    const knex = require("knex");
    const client = require("knex/lib/dialects/mysql2");
    admin = knex({ client, connection });
    await admin.raw("CREATE DATABASE ??", [database]);
    db = knex({ client, connection: { ...connection, database }, pool: { min: 0, max: 5 } });
    await db.schema.createTable("clientes", (t) => {
      t.string("IdCliente", 15).primary();
      t.string("Empresa");
      t.string("Rif");
      t.string("Ruta");
    });
    await db.schema.createTable("masterfact", (t) => {
      t.string("IdFactura", 20).primary();
      t.string("IdCliente", 15);
      t.integer("Anulada");
    });
    await db.raw(
      "CREATE TABLE cxc_documentos (IdDocumento INT NOT NULL AUTO_INCREMENT PRIMARY KEY, IdFactura VARCHAR(20), IdCliente VARCHAR(15), TipoDoc VARCHAR(3), FechaEmision DATE, FechaVencimiento DATE, MonedaOriginal VARCHAR(3), MontoOriginal DECIMAL(18,4), SaldoActual DECIMAL(18,4), Estatus VARCHAR(15), INDEX (IdCliente)) ENGINE=InnoDB",
    );
    await db.schema.createTable("cxc_movimientos", (t) => {
      t.increments("IdMov");
      t.dateTime("Fecha");
      t.string("IdCliente", 15);
      t.string("MonedaPago", 3);
      t.decimal("TasaCambio", 18, 6);
      t.decimal("MontoPago", 18, 4);
      t.decimal("MontoBase", 18, 4);
      t.string("FormaPago");
      t.string("Referencia");
      t.string("Banco");
      t.text("Observaciones");
    });
    await db.schema.createTable("cxc_cruces", (t) => {
      t.increments("IdCruce");
      t.integer("IdMovimiento");
      t.integer("IdDocumento");
      t.decimal("MontoAplicado", 18, 4);
      t.dateTime("FechaCruce");
    });
    await db.schema.createTable("divisas", (t) => {
      t.string("IdDivisa");
      t.string("Simbolo");
      t.decimal("Cambio", 18, 6);
    });
    await db.schema.createTable("bancos", (t) => {
      t.string("Id_Banco", 10).primary();
      t.string("Nombre", 50);
    });
    await db("bancos").insert({ Id_Banco: "BV", Nombre: "Banco inicial" });
    await require("../migrations/20261011_add_receivables_operations").up(db);
    await require("../migrations/20261029_add_collection_catalogs").up(db);
    service = createReceivablesService({ db, now });
  });

  afterAll(async () => {
    if (db) await db.destroy();
    if (admin) {
      await admin.raw("DROP DATABASE IF EXISTS ??", [database]);
      await admin.destroy();
    }
  });

  beforeEach(async () => {
    clock = Date.parse("2026-10-11T12:00:00Z");
    for (const table of [
      "cxc_cierres",
      "cxc_operaciones",
      "cxc_cruces",
      "cxc_movimientos",
      "cxc_documentos",
      "masterfact",
      "clientes",
      "divisas",
    ])
      await db(table).del();
    await db("clientes").insert([
      { IdCliente: "C1", Empresa: "Cliente Uno", Ruta: "R1" },
      { IdCliente: "C2", Empresa: "Cliente Dos", Ruta: "R2" },
    ]);
    await db("masterfact").insert([
      { IdFactura: "A", IdCliente: "C1", Anulada: 0 },
      { IdFactura: "B", IdCliente: "C1", Anulada: 0 },
      { IdFactura: "X", IdCliente: "C1", Anulada: -1 },
      { IdFactura: "C", IdCliente: "C2", Anulada: 0 },
    ]);
    await db("cxc_documentos").insert([
      {
        IdDocumento: 1,
        IdFactura: "B",
        IdCliente: "C1",
        TipoDoc: "FAC",
        FechaEmision: "2026-09-01",
        FechaVencimiento: "2026-10-15",
        MonedaOriginal: "USD",
        MontoOriginal: "100",
        SaldoActual: "100",
        Estatus: "PENDIENTE",
      },
      {
        IdDocumento: 2,
        IdFactura: "A",
        IdCliente: "C1",
        TipoDoc: "FAC",
        FechaEmision: "2026-09-01",
        FechaVencimiento: "2026-10-01",
        MonedaOriginal: "USD",
        MontoOriginal: "50",
        SaldoActual: "50",
        Estatus: "PENDIENTE",
      },
      {
        IdDocumento: 3,
        IdFactura: "X",
        IdCliente: "C1",
        TipoDoc: "FAC",
        FechaEmision: "2026-09-01",
        FechaVencimiento: "2026-10-01",
        MonedaOriginal: "USD",
        MontoOriginal: "999",
        SaldoActual: "999",
        Estatus: "PENDIENTE",
      },
      {
        IdDocumento: 4,
        IdFactura: "C",
        IdCliente: "C2",
        TipoDoc: "FAC",
        FechaEmision: "2026-09-01",
        FechaVencimiento: "2026-10-01",
        MonedaOriginal: "USD",
        MontoOriginal: "75",
        SaldoActual: "75",
        Estatus: "PENDIENTE",
      },
    ]);
    await db("divisas").insert({ IdDivisa: "02", Simbolo: "BsS", Cambio: "100.000000" });
  });

  const payment = (amount = "30", overrides = {}) => ({
    type: "payment",
    amount,
    currency: "USD",
    date: "2026-10-11",
    method: "EFECTIVO",
    ...overrides,
  });
  const run = async (body, clientId = "C1") => {
    clock += 1000;
    const preview = await service.preview(clientId, body);
    return service.execute(clientId, { ...body, snapshot: preview.snapshot, requestId: randomUUID() });
  };

  it("administra catálogos por HTTP, conserva bancos compartidos y valida los abonos", async () => {
    const express = require("express");
    const request = require("supertest");
    const { createReceivablesRouter } = require("../routes/receivables");
    const app = express();
    app.use(express.json());
    app.use("/api/receivables", createReceivablesRouter(service));
    const api = request(app);
    const base = "/api/receivables/catalogs";

    const initial = await api.get(`${base}/banks`);
    expect(initial.status).toBe(200);
    expect(initial.headers["cache-control"]).toBe("no-store");
    expect(initial.body).toContainEqual({ id: "BV", name: "Banco inicial", active: true });
    expect((await api.get("/api/receivables/methods")).body).toContainEqual({ id: "EFECTIVO", name: "Efectivo" });
    expect((await api.post(`${base}/banks`).type("form").send({ id: "T", name: "Test" })).status).toBe(415);
    expect(
      (await api.post(`${base}/banks`).set("Sec-Fetch-Site", "cross-site").send({ id: "T", name: "Test" })).status,
    ).toBe(403);
    expect((await api.post(`${base}/banks`).send({ id: "", name: "Test" })).status).toBe(400);
    expect((await api.post(`${base}/banks`).send({ id: "TOO-LONG-ID", name: "" })).status).toBe(400);
    expect((await api.post(`${base}/banks`).send({ id: "TEST", name: "Banco de prueba" })).status).toBe(200);
    expect((await db("bancos").where("Id_Banco", "TEST").first()).Nombre).toBe("Banco de prueba");
    expect((await api.post(`${base}/banks`).send({ id: "TEST", name: "Duplicado" })).status).toBe(409);
    expect((await api.post(`${base}/banks`).send({ id: "SECOND", name: "Banco de prueba" })).status).toBe(409);
    expect((await api.put(`${base}/banks/TEST`).send({ name: "Banco editado", active: true })).status).toBe(200);
    expect((await db("bancos").where("Id_Banco", "TEST").first()).Nombre).toBe("Banco editado");
    expect((await api.put(`${base}/banks/missing`).send({ name: "No existe", active: false })).status).toBe(404);
    expect((await api.put(`${base}/banks/TEST`).send({ name: "Banco editado", active: "false" })).status).toBe(400);

    expect((await api.post(`${base}/methods`).send({ id: "ZELLE", name: "Zelle" })).status).toBe(200);
    const body = payment("10", { method: "ZELLE", bank: "Banco editado" });
    const result = await run(body);
    expect(result.method).toBe("ZELLE");
    expect((await db("cxc_movimientos").where("IdMov", result.movementId).first()).Banco).toBe("Banco editado");
    const preview = await service.preview("C1", body);
    expect((await api.put(`${base}/methods/ZELLE`).send({ name: "Zelle", active: false })).status).toBe(200);
    expect((await api.get("/api/receivables/methods")).body.some((row) => row.id === "ZELLE")).toBe(false);
    await expect(
      service.execute("C1", { ...body, snapshot: preview.snapshot, requestId: randomUUID() }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await api.put(`${base}/methods/ZELLE`).send({ name: "Zelle", active: true })).status).toBe(200);
    expect((await api.put(`${base}/banks/TEST`).send({ name: "Banco editado", active: false })).status).toBe(200);
    expect((await api.get("/api/receivables/banks")).body.some((row) => row.id === "TEST")).toBe(false);
    expect(await db("bancos").where("Id_Banco", "TEST").first()).toBeTruthy();
    await expect(service.preview("C1", body)).rejects.toMatchObject({ status: 400 });
    await expect(service.preview("C1", payment("10", { method: "INVENTADO" }))).rejects.toMatchObject({ status: 400 });
    const history = await db("cxc_movimientos").where("IdMov", result.movementId).first();
    expect(history.FormaPago).toBe("ZELLE");
    expect(history.Banco).toBe("Banco editado");
    expect((await api.put(`${base}/banks/TEST`).send({ name: "Banco editado", active: true })).status).toBe(200);
    await expect(service.preview("C1", body)).resolves.toHaveProperty("snapshot");
    await require("../migrations/20261029_add_collection_catalogs").up(db);
    expect((await api.get(`${base}/methods`)).body.filter((row) => row.id === "ZELLE")).toHaveLength(1);
  });

  it("explica la preparación pendiente de catálogos sin devolver un error genérico de cartera", async () => {
    const express = require("express");
    const request = require("supertest");
    const { createReceivablesRouter } = require("../routes/receivables");
    const app = express();
    app.use("/api/receivables", createReceivablesRouter(service));
    await db.schema.dropTable("dmmarket_payment_methods");
    await db.schema.dropTable("dmmarket_bank_settings");
    try {
      for (const type of ["banks", "methods"]) {
        const response = await request(app).get(`/api/receivables/catalogs/${type}`);
        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe("CXC_CATALOGS_UNAVAILABLE");
        expect(response.body.error.message).toContain("catálogos de cobranza");
        expect(response.body.error.message).toContain("migración");
      }
    } finally {
      await require("../migrations/20261029_add_collection_catalogs").up(db);
    }
  });

  it("lists live balances, scopes KPIs by route and paginates filtered clients", async () => {
    const result = await service.list({ ruta: "R1", search: "missing" });
    expect(result.total).toBe(0);
    expect(result.summary).toEqual({ balance: "150.0000", overdue: "50.0000", debtors: 1, received: "0.0000" });
    const list = await service.list({ limit: "1" });
    expect(list.total).toBe(2);
    expect(list.data).toHaveLength(1);
    expect(list.data[0].id).toBe("C2");
    const detail = await service.detail("C1");
    expect(detail.summary.balance).toBe("150.0000");
    expect(detail.documents.data.map((d) => d.sale)).toEqual(["A", "B"]);
  });

  it("applies by oldest due date, preserves excess and returns live history", async () => {
    const result = await run(payment("170"));
    expect(result.applications.map((a) => a.id)).toEqual([2, 1]);
    expect(result.excess).toBe("20.0000");
    expect(result.balanceAfter).toBe("0.0000");
    const detail = await service.detail("C1", { documents: "all" });
    expect(detail.timeline.data[0].excess).toBe("20.0000");
    expect(detail.timeline.data[0].applications).toHaveLength(2);
    expect((await service.list()).summary.received).toBe("170.0000");
    expect((await service.list({ state: "settled" })).data[0].id).toBe("C1");
  });

  it("converts bolivars with the saved rate and rejects stale previews", async () => {
    const body = payment("1000", { currency: "BsS" });
    const preview = await service.preview("C1", body);
    expect(preview.base).toBe("10.0000");
    await db("divisas").update({ Cambio: "200" });
    await expect(
      service.execute("C1", { ...body, snapshot: preview.snapshot, requestId: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await db("cxc_movimientos")).toHaveLength(0);
    const result = await run(body);
    expect(result.rate).toBe("200.000000");
    await db("divisas").update({ Cambio: "300" });
    expect(String((await db("cxc_movimientos").first()).TasaCambio)).toBe("200.000000");
  });

  it("previews and closes only the selected document without affecting other debt or received money", async () => {
    await run(payment("25"));
    const body = { type: "close", id: 2, reason: "Diferencia acordada" };
    const preview = await service.preview("C1", body);
    expect(preview.balanceBefore).toBe("125.0000");
    expect(preview.base).toBe("25.0000");
    expect(preview.balanceAfter).toBe("100.0000");
    expect(preview.applications).toEqual([{ id: 2, sale: "A", amount: "25.0000" }]);
    const closed = await run(body);
    expect(closed.balanceAfter).toBe(preview.balanceAfter);
    const detail = await service.detail("C1", { documents: "all" });
    expect(detail.documents.data.find((d) => d.id === 2)).toMatchObject({
      balance: "0.0000",
      applied: "25.0000",
      closed: "25.0000",
    });
    expect(detail.documents.data.find((d) => d.id === 1).balance).toBe("100.0000");
    expect((await service.list()).summary.received).toBe("25.0000");
  });

  it("closes and reopens only the remaining amount without inventing money", async () => {
    await run(payment("149.70"));
    const close = await run({ type: "close", reason: "Diferencia de redondeo" });
    expect(close.base).toBe("0.3000");
    expect(close.balanceBefore).toBe("0.3000");
    expect(close.balanceAfter).toBe("0.0000");
    expect((await service.detail("C1", { documents: "all" })).documents.data.find((d) => d.id === 1).status).toBe(
      "Cerrada manualmente",
    );
    expect((await service.list()).summary.received).toBe("149.7000");
    const reopen = await run({ type: "reopen", id: 1, reason: "Cierre equivocado" });
    expect(reopen.balanceAfter).toBe("0.3000");
    await expect(service.preview("C1", { type: "reopen", id: 1, reason: "Otra vez" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("preserves closures when reversing a payment and excludes reversed money", async () => {
    const result = await run(payment("149.70"));
    await run({ type: "close", reason: "Redondeo" });
    const reversal = await run({ type: "void", id: result.movementId, reason: "Abono duplicado" });
    expect(reversal.balanceBefore).toBe("0.0000");
    expect(reversal.restored).toBe("149.7000");
    expect(reversal.balanceAfter).toBe("149.7000");
    const detail = await service.detail("C1", { documents: "all" });
    expect(detail.timeline.data.find((e) => e.type === "payment").voidReason).toBe("Abono duplicado");
    expect(detail.documents.data.find((d) => d.id === 1).closed).toBe("0.3000");
    expect((await service.list()).summary.received).toBe("0.0000");
    expect(await db("cxc_cruces")).toHaveLength(2);
    await expect(
      service.preview("C1", { type: "void", id: result.movementId, reason: "De nuevo" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("restores only applications, not the unallocated excess of a payment", async () => {
    const result = await run(payment("170"));
    const body = { type: "void", id: result.movementId, reason: "Abono duplicado" };
    const preview = await service.preview("C1", body);
    expect(preview.base).toBe("170.0000");
    expect(preview.balanceBefore).toBe("0.0000");
    expect(preview.restored).toBe("150.0000");
    expect(preview.balanceAfter).toBe("150.0000");
    const reversal = await run(body);
    expect(reversal.restored).toBe(preview.restored);
    expect(reversal.balanceAfter).toBe(preview.balanceAfter);
  });

  it("replays identical request IDs and rejects reuse with changed data", async () => {
    const body = payment();
    const preview = await service.preview("C1", body);
    const request = { ...body, snapshot: preview.snapshot, requestId: randomUUID() };
    const result = await service.execute("C1", request);
    expect(await service.execute("C1", request)).toEqual(result);
    expect(await db("cxc_movimientos")).toHaveLength(1);
    await expect(service.execute("C1", { ...request, amount: "31" })).rejects.toMatchObject({ status: 409 });
  });

  it("serializes simultaneous payments and rejects an outdated allocation", async () => {
    const body = payment("100");
    const preview = await service.preview("C1", body);
    const results = await Promise.allSettled(
      [1, 2].map(() => service.execute("C1", { ...body, snapshot: preview.snapshot, requestId: randomUUID() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected").reason.status).toBe(409);
    expect((await service.detail("C1")).summary.balance).toBe("50.0000");
  });

  it("orders history by registration time while preserving the payment date", async () => {
    await run(payment());
    await run({ type: "close", reason: "Cierre acordado" });
    const detail = await service.detail("C1");
    expect(detail.timeline.data.map((event) => event.type)).toEqual(["CIERRE", "payment"]);
    expect(detail.timeline.data[1].date.slice(0, 10)).toBe("2026-10-11");
  });

  it("keeps non-invoice documents outside the invoice-only portfolio", async () => {
    await db("cxc_documentos").insert({
      IdDocumento: 5,
      IdFactura: "A",
      IdCliente: "C1",
      TipoDoc: "NCR",
      FechaEmision: "2026-09-01",
      MonedaOriginal: "USD",
      MontoOriginal: "10",
      SaldoActual: "10",
      Estatus: "PENDIENTE",
    });
    expect((await service.detail("C1", { documents: "all" })).documents.data).toHaveLength(3);
    await expect(service.list({ sortBy: "__proto__" })).rejects.toMatchObject({ status: 400 });
  });

  it("runs schema setup idempotently and refuses to drop financial history", async () => {
    const migration = require("../migrations/20261011_add_receivables_operations");
    await migration.up(db);
    await run(payment());
    await expect(migration.down(db)).rejects.toThrow("historial financiero");
    expect(await db("cxc_movimientos")).toHaveLength(1);
    expect(await db.schema.hasTable("cxc_cierres")).toBe(true);
  });

  it("rejects cancelled sales and cross-client targets", async () => {
    await expect(service.preview("C1", { type: "close", id: 3, reason: "Cerrar" })).rejects.toThrow("No hay deuda");
    await expect(service.preview("C1", { type: "close", id: 4, reason: "Cerrar" })).rejects.toThrow("No hay deuda");
  });
});
