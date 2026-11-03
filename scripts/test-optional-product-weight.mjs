import assert from "node:assert/strict";
import { createRequire } from "node:module";

const load = createRequire(new URL("../packages/backend/package.json", import.meta.url));
const request = load("supertest");
const app = load("./index.js");
const database = load("./database.js");

try {
  const hasWeight = await database.schema.hasColumn("productos", "Peso");
  const inventory = await request(app).get("/api/products").query({ limit: 20 });
  assert.equal(inventory.status, 200, JSON.stringify(inventory.body));
  assert.ok(inventory.body.total > 0);
  for (const product of inventory.body.data) {
    assert.ok(Object.hasOwn(product, "Peso"));
    const original = await database("productos").where("IdProducto", product.IdProducto).first();
    assert.equal(product.Peso, hasWeight ? original.Peso : null);
  }
  const dates = await database("masternoe").min("Fecha as from").max("Fecha as to").first();
  for (const sortDir of ["asc", "desc"]) {
    const sales = await request(app)
      .get("/api/sales/productos")
      .query({ ...dates, showNoe: true, limit: 10, sortBy: "peso", sortDir });
    assert.equal(sales.status, 200, JSON.stringify(sales.body));
    assert.ok(sales.body.data.length > 0);
    assert.ok(Object.hasOwn(sales.body.totals, "peso"));
    if (!hasWeight) {
      assert.equal(sales.body.totals.peso, null);
      for (const product of sales.body.data) assert.equal(product.peso, null);
    }
  }
  const invoices = await request(app)
    .get("/api/invoices")
    .query({ ...dates, showNoe: true, limit: 1 });
  assert.equal(invoices.status, 200, JSON.stringify(invoices.body));
  assert.ok(invoices.body.data[0].products.length > 0);
  for (const product of invoices.body.data[0].products) {
    assert.ok(Object.hasOwn(product, "peso"));
    const original = await database("productos").where("IdProducto", product.productId).first();
    assert.equal(product.peso, hasWeight && original?.Peso != null ? Number(original.Peso) : null);
  }
  console.log(`Inventario, ventas ordenadas por peso y despacho: correctos ${hasWeight ? "con" : "sin"} columna Peso.`);
} finally {
  await database.destroy();
}
process.exit(0);
