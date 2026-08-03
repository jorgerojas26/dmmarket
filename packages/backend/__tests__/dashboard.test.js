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
