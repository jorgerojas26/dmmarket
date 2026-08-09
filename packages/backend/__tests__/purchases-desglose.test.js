const request = require("supertest");
const app = require("../index");
const knex = require("../database");

// Los tests corren contra la DB local real; cada request puede superar los 5000ms por defecto
jest.setTimeout(30000);

// Rango excluye mayo: purchases.test.js siembra su factura TESTAN en 2021-05 y los workers corren en paralelo
const RANGE = { from: "2021-01-01", to: "2021-04-30" };

// Helpers: proveedor y grupo con compras reales en el rango (los filtros deben restringir a datos existentes)
const pickProviderId = async () => {
  const [row] = await knex("mastercomp").whereBetween("Fecha", [RANGE.from, RANGE.to]).andWhere("Anulada", 0).limit(1);
  return row.IdProveedor;
};

const pickGroupId = async () => {
  const [row] = await knex
    .select("productos.Grupo as groupId")
    .from("slavecomp as sc")
    .innerJoin("mastercomp as mc", function () {
      this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
    })
    .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
    .whereBetween("mc.Fecha", [RANGE.from, RANGE.to])
    .limit(1);
  return row.groupId;
};

describe("GET /api/purchases/invoices", () => {
  // 1. Estructura paginada con datos
  it("responde 200 con data paginada y estructura de factura", async () => {
    const res = await request(app).get("/api/purchases/invoices").query(RANGE);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination).toHaveProperty("page", 1);
    expect(res.body.pagination).toHaveProperty("limit", 20);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    expect(res.body.data.length).toBeLessThanOrEqual(20);

    const first = res.body.data[0];
    expect(first).toHaveProperty("invoiceId");
    expect(first).toHaveProperty("proveedor");
    expect(first).toHaveProperty("fecha");
    expect(first).toHaveProperty("monto");
    expect(first).toHaveProperty("unidades");
    expect(Number(first.monto)).toBeGreaterThan(0);
  });

  // 2. Paginación explícita: page/limit y total consistente
  it("respeta page/limit y mantiene total consistente entre páginas", async () => {
    const res = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, page: 2, limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.data.length).toBeLessThanOrEqual(5);

    const page1 = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, page: 1, limit: 5 });
    expect(page1.body.pagination.total).toBe(res.body.pagination.total);
  });

  // 3. Filtro proveedorId restringe a ese proveedor
  it("filtra por proveedorId: total coincide con el conteo directo de ese proveedor", async () => {
    const proveedorId = await pickProviderId();

    const res = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, proveedorId });

    const [{ total }] = await knex
      .countDistinct("mc.IdFactura as total")
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .where("mc.IdProveedor", proveedorId)
      .andWhereBetween("mc.Fecha", [RANGE.from, RANGE.to]);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(Number(total));
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  // 4. Filtro groupId restringe a facturas con productos de ese grupo
  it("filtra por groupId: total coincide con el conteo directo por grupo", async () => {
    const groupId = await pickGroupId();

    const res = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, groupId });

    const [{ total }] = await knex
      .countDistinct("mc.IdFactura as total")
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
      .where("productos.Grupo", groupId)
      .andWhereBetween("mc.Fecha", [RANGE.from, RANGE.to]);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(Number(total));
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  // 5. Ordenamiento por monto y por fecha
  it("ordena por monto desc y por fecha asc", async () => {
    const byMonto = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, sortBy: "monto", sortDir: "desc", limit: 50 });
    const montos = byMonto.body.data.map((r) => Number(r.monto));
    expect([...montos].sort((a, b) => b - a)).toEqual(montos);

    const byFecha = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, sortBy: "fecha", sortDir: "asc", limit: 50 });
    const fechas = byFecha.body.data.map((r) => r.fecha);
    expect([...fechas].sort()).toEqual(fechas);
  });

  // 6. Búsqueda por texto en número de factura
  it("busca por texto en el número de factura", async () => {
    const full = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, limit: 1 });
    const term = String(full.body.data[0].invoiceId).slice(0, 4);

    const res = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, search: term });

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(String(row.invoiceId)).toContain(term);
    }
  });

  // 7. Rango vacío → 200 con data [] y total 0
  it("responde 200 con data [] y total 0 en rango sin datos", async () => {
    const res = await request(app).get("/api/purchases/invoices").query({ from: "2000-01-01", to: "2000-01-02" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  // 8. Falta from o to → 400
  it("responde 400 si falta from o to", async () => {
    const noFrom = await request(app).get("/api/purchases/invoices").query({ to: RANGE.to });
    const noTo = await request(app).get("/api/purchases/invoices").query({ from: RANGE.from });

    expect(noFrom.status).toBe(400);
    expect(noTo.status).toBe(400);
  });

  // 9. SQL injection en search/proveedorId → 200 sin crash (knex builder lo neutraliza)
  it("no es vulnerable a SQL injection", async () => {
    const res = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, search: "'; DROP TABLE usuarios;--", proveedorId: "'; DROP TABLE usuarios;--" });

    expect(res.status).toBe(200);
  });

  // 10. page/limit vacíos → 200 con defaults, no 500 (OFFSET nunca negativo)
  it("responde 200 con defaults si page o limit vienen vacíos", async () => {
    const res = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, page: "", limit: "" });

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(20);
  });

  // 11. Ordenamiento por número, proveedor y unidades
  it("ordena por numero, proveedor y unidades", async () => {
    const byNumero = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, sortBy: "numero", sortDir: "asc", limit: 50 });
    const nums = byNumero.body.data.map((r) => String(r.invoiceId));
    expect([...nums].sort()).toEqual(nums);

    const byProveedor = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, sortBy: "proveedor", sortDir: "asc", limit: 50 });
    const provs = byProveedor.body.data.map((r) => r.proveedor);
    expect([...provs].sort()).toEqual(provs);

    const byUnidades = await request(app)
      .get("/api/purchases/invoices")
      .query({ ...RANGE, sortBy: "unidades", sortDir: "desc", limit: 50 });
    const unids = byUnidades.body.data.map((r) => Number(r.unidades));
    expect([...unids].sort((a, b) => b - a)).toEqual(unids);
  });
});

describe("GET /api/purchases/products", () => {
  // 10. Estructura paginada con datos
  it("responde 200 con data paginada y estructura de producto", async () => {
    const res = await request(app).get("/api/purchases/products").query(RANGE);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination).toHaveProperty("page", 1);
    expect(res.body.pagination).toHaveProperty("limit", 20);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    expect(res.body.data.length).toBeLessThanOrEqual(20);

    const first = res.body.data[0];
    expect(first).toHaveProperty("product");
    expect(first).toHaveProperty("quantity");
    expect(first).toHaveProperty("monto");
    expect(first).toHaveProperty("avgUnitCost");
    expect(Number(first.monto)).toBeGreaterThan(0);
    expect(Number(first.avgUnitCost)).toBeGreaterThan(0);
  });

  // 11. Filtro proveedorId restringe a productos comprados a ese proveedor
  it("filtra por proveedorId: total coincide con el conteo directo", async () => {
    const proveedorId = await pickProviderId();

    const res = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, proveedorId });

    const [{ total }] = await knex
      .countDistinct("productos.IdProducto as total")
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
      .where("mc.IdProveedor", proveedorId)
      .andWhereBetween("mc.Fecha", [RANGE.from, RANGE.to]);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(Number(total));
  });

  // 12. Filtro groupId restringe a productos de ese grupo
  it("filtra por groupId: total coincide con el conteo directo por grupo", async () => {
    const groupId = await pickGroupId();

    const res = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, groupId });

    const [{ total }] = await knex
      .countDistinct("productos.IdProducto as total")
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
      .where("productos.Grupo", groupId)
      .andWhereBetween("mc.Fecha", [RANGE.from, RANGE.to]);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(Number(total));
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  // 13. Ordenamiento por monto, quantity y avgUnitCost
  it("ordena por monto desc, quantity desc y avgUnitCost asc", async () => {
    const byMonto = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, sortBy: "monto", sortDir: "desc", limit: 50 });
    const montos = byMonto.body.data.map((r) => Number(r.monto));
    expect([...montos].sort((a, b) => b - a)).toEqual(montos);

    const byQty = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, sortBy: "quantity", sortDir: "desc", limit: 50 });
    const qtys = byQty.body.data.map((r) => Number(r.quantity));
    expect([...qtys].sort((a, b) => b - a)).toEqual(qtys);

    const byCost = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, sortBy: "avgUnitCost", sortDir: "asc", limit: 50 });
    const costs = byCost.body.data.map((r) => Number(r.avgUnitCost));
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  // 14. Búsqueda por texto en descripción de producto
  it("busca por texto en la descripción del producto", async () => {
    const full = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, limit: 1 });
    const term = String(full.body.data[0].product).slice(0, 4);

    const res = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, search: term });

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(String(row.product)).toContain(term);
    }
  });

  // 15. Rango vacío → 200 con data [] y total 0
  it("responde 200 con data [] y total 0 en rango sin datos", async () => {
    const res = await request(app).get("/api/purchases/products").query({ from: "2000-01-01", to: "2000-01-02" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  // 16. Falta from o to → 400
  it("responde 400 si falta from o to", async () => {
    const noFrom = await request(app).get("/api/purchases/products").query({ to: RANGE.to });
    const noTo = await request(app).get("/api/purchases/products").query({ from: RANGE.from });

    expect(noFrom.status).toBe(400);
    expect(noTo.status).toBe(400);
  });

  // 17. SQL injection en search → 200 sin crash
  it("no es vulnerable a SQL injection", async () => {
    const res = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, search: "'; DROP TABLE usuarios;--" });

    expect(res.status).toBe(200);
  });

  // 18. page/limit vacíos → 200 con defaults, no 500
  it("responde 200 con defaults si page o limit vienen vacíos", async () => {
    const res = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, page: "", limit: "" });

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(20);
  });

  // 19. Ordenamiento por producto (alfabético)
  it("ordena por product asc", async () => {
    const res = await request(app)
      .get("/api/purchases/products")
      .query({ ...RANGE, sortBy: "product", sortDir: "asc", limit: 50 });
    const prods = res.body.data.map((r) => r.product);
    expect([...prods].sort()).toEqual(prods);
  });
});

describe("GET /api/purchases/invoices y /products — exclusión de facturas anuladas", () => {
  // Red de seguridad: limpiar cualquier semilla residual si un test aborta
  // Prefijo TESTD2 y fecha fuera de mayo: evita chocar con la semilla TESTAN de purchases.test.js
  afterAll(async () => {
    await knex("slavecomp").where("IdFactura", "like", "TESTD2%").del();
    await knex("mastercomp").where("IdFactura", "like", "TESTD2%").del();
  });

  it("las facturas anuladas no aparecen en resultados ni en totales", async () => {
    const anuladaId = `TESTD2${Date.now().toString().slice(-5)}`;

    // Producto que NO se compró en el rango — así des-anular la factura suma 1 en products
    const [absentProduct] = await knex("productos")
      .select("productos.IdProducto as id")
      .whereNotIn("productos.IdProducto", function () {
        this.select("sc.IdProducto")
          .from("slavecomp as sc")
          .innerJoin("mastercomp as mc", function () {
            this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
          })
          .whereBetween("mc.Fecha", [RANGE.from, RANGE.to]);
      })
      .limit(1);
    const absentProductId = absentProduct.id;

    const beforeInvoices = await request(app).get("/api/purchases/invoices").query(RANGE);
    const beforeProducts = await request(app).get("/api/purchases/products").query(RANGE);

    // Sembrar una factura anulada con monto alto en febrero (fuera de la ventana de mayo del dashboard)
    await knex("mastercomp").insert({
      IdFactura: anuladaId,
      Fecha: "2021-02-15",
      IdProveedor: "65656",
      Nombre: "TEST ANULADA",
      Rif: "V-00000000",
      Condicion: "Contado",
      Direccion: "TEST",
      Anulada: 1,
    });
    await knex("slavecomp").insert({
      IdFactura: anuladaId,
      IdProducto: absentProductId,
      Descripcion: "TEST",
      Precio: 500000,
      Cantidad: 1,
      Gravado: 0,
      MontoImp: 0,
    });

    try {
      // Mientras está anulada: no aparece en resultados ni altera totales
      const anulledInvoices = await request(app).get("/api/purchases/invoices").query(RANGE);
      expect(anulledInvoices.body.pagination.total).toBe(beforeInvoices.body.pagination.total);
      expect(anulledInvoices.body.data.map((r) => r.invoiceId)).not.toContain(anuladaId);

      const anulledProducts = await request(app).get("/api/purchases/products").query(RANGE);
      expect(anulledProducts.body.pagination.total).toBe(beforeProducts.body.pagination.total);

      const searchAnulled = await request(app)
        .get("/api/purchases/invoices")
        .query({ ...RANGE, search: anuladaId });
      expect(searchAnulled.body.pagination.total).toBe(0);

      // Al des-anular la misma factura, sí aparece y suma — la semilla es visible y el filtro es real
      await knex("mastercomp").where("IdFactura", anuladaId).update({ Anulada: 0 });

      const unAnulledInvoices = await request(app).get("/api/purchases/invoices").query(RANGE);
      expect(unAnulledInvoices.body.pagination.total).toBe(beforeInvoices.body.pagination.total + 1);

      // La factura aparece en los resultados al buscarla por su número
      const searchUnAnulled = await request(app)
        .get("/api/purchases/invoices")
        .query({ ...RANGE, search: anuladaId });
      expect(searchUnAnulled.body.pagination.total).toBe(1);
      expect(searchUnAnulled.body.data[0].invoiceId).toBe(anuladaId);

      const unAnulledProducts = await request(app).get("/api/purchases/products").query(RANGE);
      expect(unAnulledProducts.body.pagination.total).toBe(beforeProducts.body.pagination.total + 1);
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
