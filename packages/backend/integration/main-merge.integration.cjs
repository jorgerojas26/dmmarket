const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedInventory } = require("../../../tests/support/inventory-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
let environment;
const grants = (...capabilities) => capabilities.map((capability) => ({ capability, scope: "global" }));
async function client(permissions) {
  const user = await environment.seedUser({ permissions });
  const connection = environment.client();
  expect((await connection.login(user)).body.stage).toBe("ready");
  return { connection, user };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedInventory(environment.db);
  await seedPurchases(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("moneda del negocio conserva sesión, CSRF y permisos de preferencias", async () => {
  expect((await environment.client().request("/api/settings")).status).toBe(401);
  const { connection: reader } = await client(grants("inventory.read"));
  expect((await reader.request("/api/settings")).body).toEqual({ reportCurrency: "USD" });
  expect((await reader.request("/api/settings", { method: "PUT", body: { reportCurrency: "Bs" } })).status).toBe(403);
  const { connection: editor, user } = await client(grants("preferences.read", "preferences.update"));
  expect(
    (await editor.request("/api/settings", { method: "PUT", body: { reportCurrency: "Bs" }, csrf: "invalid" })).status,
  ).toBe(403);
  const saved = await editor.request("/api/settings", { method: "PUT", body: { reportCurrency: "Bs" } });
  expect(saved.status).toBe(200);
  expect((await reader.request("/api/settings")).body).toEqual({ reportCurrency: "Bs" });
  expect(
    await environment.db("dmmarket_auth_events").where({ actor_id: user.id, action: "preferences.currency_changed" }),
  ).toHaveLength(1);
  expect((await editor.request("/api/preferences")).body.documentType).toBe("invoices");
  for (const reportCurrency of ["EUR", "", null, true])
    expect((await editor.request("/api/settings", { method: "PUT", body: { reportCurrency } })).status).toBe(400);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .update({ password_ms: Date.now() - 300001 });
  const stale = await editor.request("/api/settings", { method: "PUT", body: { reportCurrency: "USD" } });
  expect(stale.body.error.code).toBe("RECENT_AUTH_REQUIRED");
});

test("compras por costo unitario usan el orden compatible con MySQL 5.0 sin ampliar permisos", async () => {
  const { connection } = await client(grants("purchases.read", "purchases.costs"));
  for (const [sortDir, expected] of [
    ["asc", "P"],
    ["desc", "MISSING-PUR"],
  ]) {
    const response = await connection.request(
      `/api/purchases/products?from=2026-08-01&to=2026-08-31&sortBy=avgUnitCost&sortDir=${sortDir}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data[0].productId).toBe(expected);
  }
});

test("cobranza sin esquema mantiene el código de no habilitada dentro de las rutas protegidas", async () => {
  const { connection } = await client(grants("receivables.read"));
  const response = await connection.request("/api/receivables");
  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe("CXC_SCHEMA_UNAVAILABLE");
});

test("sin columna Peso se conservan inventario, ventas, despacho y permisos sin inventar ceros", async () => {
  await environment.db.schema.alterTable("productos", (table) => table.dropColumn("Peso"));
  try {
    const { connection } = await client(grants("inventory.read", "sales.read", "sales.export"));
    const inventory = await connection.request("/api/products?sortBy=Peso&sortDir=asc");
    expect(inventory.status).toBe(200);
    expect(inventory.body.data.every((product) => product.Peso === null)).toBe(true);
    expect(JSON.stringify(inventory.body)).not.toMatch(/PrecioA|inventoryValue|Proveedor/);
    for (const sortDir of ["asc", "desc"]) {
      const products = await connection.request(
        `/api/sales/productos?from=2026-01-01&to=2026-01-31&sortBy=peso&sortDir=${sortDir}`,
      );
      expect(products.status).toBe(200);
      expect(products.body.data.every((product) => product.peso === null)).toBe(true);
      expect(products.body.totals.peso).toBeNull();
    }
    const invoices = await connection.request("/api/invoices?from=2026-01-01&to=2026-01-31");
    expect(invoices.status).toBe(200);
    expect(invoices.body.data.flatMap((invoice) => invoice.products).every((product) => product.peso === null)).toBe(
      true,
    );
    expect((await connection.request("/api/sales/facturas?from=2026-01-01&to=2026-01-31")).status).toBe(200);
  } finally {
    await environment.db.schema.alterTable("productos", (table) => table.decimal("Peso", 12, 3));
  }
});
