const request = require("supertest");
const app = require("../index");

describe("GET /api/purchases/dashboard", () => {
  // 1. Estructura de respuesta con datos
  it("responde 200 con la estructura completa cuando hay datos", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({
      from: "2021-01-01",
      to: "2021-09-30",
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("kpis");
    expect(res.body.kpis).toHaveProperty("totalPurchased");
    expect(res.body.kpis).toHaveProperty("totalQuantity");
    expect(res.body.kpis).toHaveProperty("totalInvoices");
    expect(res.body.kpis).toHaveProperty("avgTicket");
    expect(res.body.kpis).toHaveProperty("avgUnitCost");
    expect(res.body).toHaveProperty("bestProvider");
    expect(res.body.bestProvider).toHaveProperty("name");
    expect(res.body.bestProvider).toHaveProperty("totalPurchased");
    expect(res.body).toHaveProperty("topProducts");
    expect(res.body).toHaveProperty("topProviders");
    expect(res.body).toHaveProperty("groupPurchasesChart");
  });

  // 2. Rango sin datos → 200 con ceros
  it("responde 200 con KPIs en 0 y arrays vacíos cuando no hay datos", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({ from: "2000-01-01", to: "2000-01-02" });

    expect(res.status).toBe(200);
    expect(res.body.kpis.totalPurchased).toBe(0);
    expect(res.body.kpis.totalQuantity).toBe(0);
    expect(res.body.kpis.totalInvoices).toBe(0);
    expect(res.body.kpis.avgTicket).toBe(0);
    expect(res.body.kpis.avgUnitCost).toBe(0);
    expect(res.body.bestProvider).toBeNull();
    expect(res.body.topProducts).toEqual([]);
    expect(res.body.topProviders).toEqual([]);
    expect(res.body.groupPurchasesChart).toEqual([]);
  });

  // 3. Falta from → 400
  it("responde 400 si falta 'from'", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({ to: "2021-09-30" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // 4. Falta to → 400
  it("responde 400 si falta 'to'", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({ from: "2021-01-01" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // 5. Intento de SQL injection → 200 sin crash (named bindings lo neutralizan)
  it("no es vulnerable a SQL injection — responde 200, no crashea", async () => {
    const res = await request(app)
      .get("/api/purchases/dashboard")
      .query({ from: "'; DROP TABLE usuarios;--", to: "2021-09-30" });

    expect(res.status).toBe(200);
  });

  // 6. Sin compare → campos comparativos null
  it("campos compare* son null cuando no se envían fechas comparativas", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({ from: "2021-01-01", to: "2021-09-30" });

    expect(res.body.kpis.comparePurchased).toBeNull();
    expect(res.body.kpis.compareQuantity).toBeNull();
    expect(res.body.kpis.compareInvoices).toBeNull();
  });

  // 7. Con compare → campos comparativos poblados
  it("incluye compare* cuando se envían fechas comparativas", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({
      from: "2021-07-01",
      to: "2021-09-30",
      compareFrom: "2021-04-01",
      compareTo: "2021-06-30",
    });

    expect(res.status).toBe(200);
    expect(res.body.kpis.comparePurchased).toBeGreaterThan(0);
    expect(res.body.kpis.compareQuantity).toBeGreaterThan(0);
    expect(res.body.kpis.compareInvoices).toBeGreaterThan(0);
  });

  // 8. topProducts limitado a 30
  it("topProducts no excede 30 elementos", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({ from: "2021-01-01", to: "2021-09-30" });

    expect(res.body.topProducts.length).toBeLessThanOrEqual(30);
    expect(res.body.topProviders.length).toBeLessThanOrEqual(30);
  });

  // 9. Datos reales agregados correctamente
  it("agrega datos reales: totalPurchased > 0 y avgUnitCost consistente", async () => {
    const res = await request(app).get("/api/purchases/dashboard").query({ from: "2021-01-01", to: "2021-09-30" });

    expect(res.status).toBe(200);
    expect(res.body.kpis.totalPurchased).toBeGreaterThan(0);
    expect(res.body.kpis.totalInvoices).toBeGreaterThan(0);
    expect(res.body.kpis.totalQuantity).toBeGreaterThan(0);
    expect(res.body.kpis.avgUnitCost).toBeCloseTo(res.body.kpis.totalPurchased / res.body.kpis.totalQuantity, 1);
    expect(res.body.kpis.avgTicket).toBeCloseTo(res.body.kpis.totalPurchased / res.body.kpis.totalInvoices, 1);
    expect(res.body.bestProvider.name).toBeTruthy();
    expect(res.body.topProducts[0]).toHaveProperty("totalPurchased");
  });

  // 10. showNoe no aplica a compras — el parámetro extra no rompe ni cambia tablas
  it("ignora el parámetro showNoe (compras usa siempre mastercomp/slavecomp)", async () => {
    const res = await request(app)
      .get("/api/purchases/dashboard")
      .query({ from: "2021-01-01", to: "2021-09-30", showNoe: "true" });

    expect(res.status).toBe(200);
    expect(res.body.kpis.totalPurchased).toBeGreaterThan(0);
  });
});

describe("GET /api/purchases/pareto", () => {
  // 11. Estructura de respuesta con datos
  it("responde 200 con productos rankeados y resumen ABC", async () => {
    const res = await request(app).get("/api/purchases/pareto").query({ from: "2021-01-01", to: "2021-09-30" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("products");
    expect(res.body.products.length).toBeGreaterThan(0);
    const first = res.body.products[0];
    expect(first).toHaveProperty("rank", 1);
    expect(first).toHaveProperty("product");
    expect(first).toHaveProperty("quantity");
    expect(first).toHaveProperty("totalPurchased");
    expect(first).toHaveProperty("cumulativePercent");
    expect(["A", "B", "C"]).toContain(first.abcClass);
    expect(res.body.summary).toHaveProperty("classA");
    expect(res.body.summary).toHaveProperty("classB");
    expect(res.body.summary).toHaveProperty("classC");
    expect(res.body.summary).toHaveProperty("totalProducts");
    expect(res.body.summary.classA.count + res.body.summary.classB.count + res.body.summary.classC.count).toBe(
      res.body.summary.totalProducts,
    );
  });

  // 12. Rango sin datos → 200 con arrays vacíos
  it("responde 200 con products vacío y summary en 0 cuando no hay datos", async () => {
    const res = await request(app).get("/api/purchases/pareto").query({ from: "2000-01-01", to: "2000-01-02" });

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.summary.totalProducts).toBe(0);
    expect(res.body.summary.classA.count).toBe(0);
  });

  // 13. Falta from → 400
  it("responde 400 si falta 'from'", async () => {
    const res = await request(app).get("/api/purchases/pareto").query({ to: "2021-09-30" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // 14. Falta to → 400
  it("responde 400 si falta 'to'", async () => {
    const res = await request(app).get("/api/purchases/pareto").query({ from: "2021-01-01" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  // 15. Intento de SQL injection → 200 sin crash (knex builder lo neutraliza)
  it("no es vulnerable a SQL injection — responde 200, no crashea", async () => {
    const res = await request(app)
      .get("/api/purchases/pareto")
      .query({ from: "'; DROP TABLE usuarios;--", to: "2021-09-30" });

    expect(res.status).toBe(200);
  });
});

describe("GET /api/purchases — exclusión de facturas anuladas", () => {
  const knex = require("../database");

  // Red de seguridad: si un test aborta por timeout, el finally no corre — limpia cualquier semilla residual
  afterAll(async () => {
    await knex("slavecomp").where("IdFactura", "like", "TESTAN%").del();
    await knex("mastercomp").where("IdFactura", "like", "TESTAN%").del();
  });

  it("las facturas anuladas no aportan al dashboard ni al pareto", async () => {
    const anuladaId = `TESTAN${Date.now().toString().slice(-5)}`;
    const range = { from: "2021-05-01", to: "2021-05-31" };

    // Baseline con la DB limpia
    const before = await request(app).get("/api/purchases/dashboard").query(range);
    const paretoBefore = await request(app).get("/api/purchases/pareto").query(range);
    const sumPareto = (body) => body.products.reduce((s, p) => s + Number(p.totalPurchased || 0), 0);
    const paretoBaselineTotal = sumPareto(paretoBefore.body);

    // Sembrar una factura anulada con monto alto (Anulada explícito: el default es 0)
    await knex("mastercomp").insert({
      IdFactura: anuladaId,
      Fecha: "2021-05-15",
      IdProveedor: "65656",
      Nombre: "TEST ANULADA",
      Rif: "V-00000000",
      Condicion: "Contado",
      Direccion: "TEST",
      Anulada: 1,
    });
    await knex("slavecomp").insert({
      IdFactura: anuladaId,
      IdProducto: "000127",
      Descripcion: "TEST",
      Precio: 500000,
      Cantidad: 1,
      Gravado: 0,
      MontoImp: 0,
    });

    try {
      // Mientras está anulada: nada cambia
      const anulled = await request(app).get("/api/purchases/dashboard").query(range);
      expect(anulled.body.kpis.totalPurchased).toBe(before.body.kpis.totalPurchased);
      expect(anulled.body.kpis.totalInvoices).toBe(before.body.kpis.totalInvoices);
      const paretoAnulled = await request(app).get("/api/purchases/pareto").query(range);
      expect(sumPareto(paretoAnulled.body)).toBeCloseTo(paretoBaselineTotal, 1);

      // Al des-anular la misma factura, sí suma — la semilla es visible y el filtro es real
      await knex("mastercomp").where("IdFactura", anuladaId).update({ Anulada: 0 });
      const unAnulled = await request(app).get("/api/purchases/dashboard").query(range);
      expect(unAnulled.body.kpis.totalPurchased).toBe(before.body.kpis.totalPurchased + 500000);
      expect(unAnulled.body.kpis.totalInvoices).toBe(before.body.kpis.totalInvoices + 1);
      const paretoUnAnulled = await request(app).get("/api/purchases/pareto").query(range);
      expect(sumPareto(paretoUnAnulled.body)).toBeCloseTo(paretoBaselineTotal + 500000, 1);
    } finally {
      await knex("slavecomp").where("IdFactura", anuladaId).del();
      await knex("mastercomp").where("IdFactura", anuladaId).del();
    }
  }, 30000);
});

// Cierra el pool de knex al terminar: si no, las conexiones idle de mysql2 mantienen
// el event loop vivo y jest fuerza el exit del worker ("failed to exit gracefully").
afterAll(async () => {
  await require("../database").destroy();
});
