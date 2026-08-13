const request = require("supertest");
const app = require("../index");

// Los tests corren contra la DB local real; bajo carga paralela de suites cada request
// multi-statement puede superar los 5000ms por defecto (flaky) — se amplía el margen.
jest.setTimeout(30000);

describe("GET /api/dashboard/sales", () => {
  // 1. Estructura de respuesta con datos
  it("responde 200 con la estructura completa cuando hay datos", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "false" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("kpis");
    expect(res.body.kpis).toHaveProperty("totalRawProfit");
    expect(res.body.kpis).toHaveProperty("totalNetProfit");
    expect(res.body.kpis).toHaveProperty("totalQuantity");
    expect(res.body.kpis).toHaveProperty("totalInvoices");
    expect(res.body.kpis).toHaveProperty("avgTicket");
    expect(res.body.kpis).toHaveProperty("avgMarginPercent");
    expect(res.body).toHaveProperty("bestEmployee");
    expect(res.body).toHaveProperty("topProducts");
    expect(res.body).toHaveProperty("topClients");
    expect(res.body).toHaveProperty("groupSalesChart");
  });

  // 2. Rango sin datos → 200 con ceros
  it("responde 200 con KPIs en 0 y arrays vacíos cuando no hay datos", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2000-01-01", to: "2000-01-02", showNoe: "false" });

    expect(res.status).toBe(200);
    expect(res.body.kpis.totalRawProfit).toBe(0);
    expect(res.body.topProducts).toEqual([]);
    expect(res.body.groupSalesChart).toEqual([]);
  });

  // 3. Falta from → 400
  it("responde 400 si falta 'from'", async () => {
    const res = await request(app).get("/api/dashboard/sales").query({ to: "2026-12-31", showNoe: "false" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // 4. Falta to → 400
  it("responde 400 si falta 'to'", async () => {
    const res = await request(app).get("/api/dashboard/sales").query({ from: "2026-01-01", showNoe: "false" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // 5. Intento de SQL injection → 200 sin crash (named bindings lo neutralizan)
  it("no es vulnerable a SQL injection — responde 200, no crashea", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "'; DROP TABLE usuarios;--", to: "2026-12-31", showNoe: "false" });

    // Con named bindings, knex escapa el valor. MySQL lo trata como string literal.
    // No matchea ninguna fecha → datos vacíos, no error.
    expect(res.status).toBe(200);
  });

  // 6. KPIs comparativos cuando se envían compareFrom/compareTo
  it("incluye compare* cuando se envían fechas comparativas", async () => {
    const res = await request(app).get("/api/dashboard/sales").query({
      from: "2026-07-01",
      to: "2026-07-27",
      compareFrom: "2026-06-04",
      compareTo: "2026-06-30",
      showNoe: "false",
    });

    expect(res.status).toBe(200);
    expect(res.body.kpis).toHaveProperty("compareRawProfit");
    expect(res.body.kpis).toHaveProperty("compareNetProfit");
    expect(res.body.kpis).toHaveProperty("compareQuantity");
    expect(res.body.kpis).toHaveProperty("compareInvoices");
  });

  // 7. Sin compare → campos comparativos null
  it("campos compare* son null cuando no se envían fechas comparativas", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "false" });

    expect(res.body.kpis.compareRawProfit).toBeNull();
    expect(res.body.kpis.compareNetProfit).toBeNull();
  });

  // 8. topProducts limitado a 30
  it("topProducts no excede 30 elementos", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "false" });

    expect(res.body.topProducts.length).toBeLessThanOrEqual(30);
  });

  // 9. showNoe=true alterna a tablas Noe — verifica que responde con la misma estructura
  it("showNoe=true devuelve la estructura completa usando tablas Noe", async () => {
    const res = await request(app)
      .get("/api/dashboard/sales")
      .query({ from: "2026-01-01", to: "2026-12-31", showNoe: "true" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("kpis");
    expect(res.body.kpis).toHaveProperty("totalRawProfit");
    expect(res.body.kpis).toHaveProperty("totalNetProfit");
    expect(res.body.kpis).toHaveProperty("totalQuantity");
    expect(res.body.kpis).toHaveProperty("totalInvoices");
    expect(res.body.kpis).toHaveProperty("avgTicket");
    expect(res.body.kpis).toHaveProperty("avgMarginPercent");
    expect(res.body).toHaveProperty("bestEmployee");
    expect(res.body).toHaveProperty("topProducts");
    expect(res.body).toHaveProperty("topClients");
    expect(res.body).toHaveProperty("groupSalesChart");
  });
});

// Rango amplio: las compras viven en 2021 y las ventas en 2026 (datos de la DB local).
const WIDE_RANGE = { from: "2021-01-01", to: "2026-12-31" };

describe("GET /api/dashboard/pareto", () => {
  // 1. Modo por defecto = ventas, mismo shape de siempre
  it("modo ventas (default) rankea por netProfit con profitPercent", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ ...WIDE_RANGE, showNoe: "false" });

    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.products[0]).toHaveProperty("netProfit");
    expect(res.body.products[0]).toHaveProperty("rank");
    expect(res.body.products[0]).toHaveProperty("abcClass");
    expect(res.body.summary.classA).toHaveProperty("profitPercent");
    expect(res.body.summary).toHaveProperty("totalProducts");
  });

  // 2. Modo compras-sin-vender: solo comprados sin ventas en el rango
  it("modo=compras-sin-vender devuelve productos comprados sin ventas en el rango", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ ...WIDE_RANGE, showNoe: "false", modo: "compras-sin-vender" });

    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.summary.classA).toHaveProperty("purchasedPercent");
    expect(res.body.summary).toHaveProperty("totalProducts");

    for (const p of res.body.products) {
      expect(p.totalPurchased).toBeGreaterThan(0);
      expect(p.quantity).toBeGreaterThan(0);
      expect(p).toHaveProperty("abcClass");
      expect(p).toHaveProperty("cumulativePurchased");
    }
  });

  // 2b. Orden canónico por defecto en compras-sin-vender: inversión desc + acumulado creciente
  // (regresión: el SQL no traía ORDER BY y el re-sort default se salta en el handler → gráfico desordenado)
  it("modo=compras-sin-vender devuelve productos ordenados por totalPurchased desc", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ ...WIDE_RANGE, showNoe: "false", modo: "compras-sin-vender" });

    expect(res.status).toBe(200);
    const values = res.body.products.map((p) => Number(p.totalPurchased || 0));
    const cums = res.body.products.map((p) => p.cumulativePercent);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
    expect([...cums].sort((a, b) => a - b)).toEqual(cums);
  });

  // 3. Invariante: ningún producto del modo compras-sin-vender aparece en el pareto de ventas del mismo rango
  it("ningún producto devuelto en compras-sin-vender tiene ventas en el rango", async () => {
    const [unsold, sales] = await Promise.all([
      request(app)
        .get("/api/dashboard/pareto")
        .query({ ...WIDE_RANGE, showNoe: "false", modo: "compras-sin-vender" }),
      request(app)
        .get("/api/dashboard/pareto")
        .query({ ...WIDE_RANGE, showNoe: "false" }),
    ]);

    const soldNames = new Set(sales.body.products.map((p) => p.product));
    const leaked = unsold.body.products.filter((p) => soldNames.has(p.product));
    expect(leaked).toEqual([]);
  });

  // 4. Modo compras-sin-vender funciona con showNoe=true (exclusión contra tablas Noe)
  it("modo=compras-sin-vender funciona con showNoe=true", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ ...WIDE_RANGE, showNoe: "true", modo: "compras-sin-vender" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("products");
    expect(res.body.summary.classA).toHaveProperty("purchasedPercent");
  });

  // 5. Rango sin datos → arrays vacíos y summary en 0
  it("rango sin datos devuelve products vacío y totalProducts 0", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ from: "2000-01-01", to: "2000-01-02", showNoe: "false", modo: "compras-sin-vender" });

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.summary.totalProducts).toBe(0);
  });

  // 6. Modo ventas solo incluye productos con compras en el rango (SKUs legacy fuera)
  it("modo ventas excluye productos sin compras en el rango", async () => {
    const [sales, purchased] = await Promise.all([
      request(app)
        .get("/api/dashboard/pareto")
        .query({ ...WIDE_RANGE, showNoe: "false" }),
      request(app)
        .get("/api/purchases/pareto")
        .query({ ...WIDE_RANGE }),
    ]);

    const boughtNames = new Set(purchased.body.products.map((p) => p.product));
    const missing = sales.body.products.filter((p) => !boughtNames.has(p.product));
    expect(missing).toEqual([]);
    expect(sales.body.products.length).toBeGreaterThan(0);
  });

  // 7. Server-side sorting — % acumulado ascendente
  it("ordena por % acumulado ascendente sin romper el ABC", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ ...WIDE_RANGE, showNoe: "false", sortBy: "cumulativePercent", sortDir: "asc" });

    expect(res.status).toBe(200);
    const pcts = res.body.products.map((p) => Number(p.cumulativePercent));
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
    expect(res.body.products[0]).toHaveProperty("abcClass");
    expect(res.body.products[0]).toHaveProperty("netProfit");
  });

  // 8. Server-side sorting — por cantidad ascendente (numérico)
  it("ordena por cantidad ascendente", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ ...WIDE_RANGE, showNoe: "false", sortBy: "quantity", sortDir: "asc" });

    const qs = res.body.products.map((p) => Number(p.quantity));
    expect([...qs].sort((a, b) => a - b)).toEqual(qs);
  });

  // 9. sortBy inválido cae al default del modo (netProfit desc)
  it("sortBy inválido cae al orden canónico por ganancia", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({ ...WIDE_RANGE, showNoe: "false", sortBy: "hack", sortDir: "desc" });

    const profits = res.body.products.map((p) => Number(p.netProfit));
    expect([...profits].sort((a, b) => b - a)).toEqual(profits);
  });

  // 10. Modo compras-sin-vender también ordena (% acumulado)
  it("modo compras-sin-vender ordena por % acumulado ascendente", async () => {
    const res = await request(app)
      .get("/api/dashboard/pareto")
      .query({
        ...WIDE_RANGE,
        showNoe: "false",
        modo: "compras-sin-vender",
        sortBy: "cumulativePercent",
        sortDir: "asc",
      });

    const pcts = res.body.products.map((p) => Number(p.cumulativePercent));
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
    expect(res.body.products[0]).toHaveProperty("totalPurchased");
  });
});

// Cierra el pool de knex al terminar: si no, las conexiones idle de mysql2 mantienen
// el event loop vivo y jest fuerza el exit del worker ("failed to exit gracefully").
afterAll(async () => {
  await require("../database").destroy();
});
