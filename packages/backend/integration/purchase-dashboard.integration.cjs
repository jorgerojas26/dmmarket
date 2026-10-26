const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
let environment;
const range = "from=2026-08-01&to=2026-08-31";
const compare = "compareFrom=2026-07-01&compareTo=2026-07-31";
const grant = (capability) => ({ capability, scope: "global" });
async function reader(permissions) {
  const user = await environment.seedUser({ permissions });
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedPurchases(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("dashboard básico no ordena ni revela importes, comparaciones financieras o proveedores", async () => {
  const client = await reader([grant("purchases.read"), grant("sales.financial"), grant("inventory.costs")]);
  const result = await client.request(`/api/purchases/dashboard?${range}&${compare}`);
  expect(result.status).toBe(200);
  expect(result.body.kpis).toEqual({ totalInvoices: 3, totalQuantity: 6, compareQuantity: 2, compareInvoices: 1 });
  expect(result.body.topProducts.map((row) => row.quantity)).toEqual(["5.000", "1.000"]);
  expect(result.body.groupPurchasesChart).toHaveLength(2);
  expect(JSON.stringify(result.body)).not.toMatch(
    /monto|Purchased|avgTicket|avgUnitCost|Provider|proveedor|PRIVATE|Rif/,
  );
  expect((await client.request(`/api/purchases/pareto?${range}`)).status).toBe(403);
});

test("lectura financiera no se infiere desde costos o lectura de otros recursos", async () => {
  for (const permission of ["purchases.costs", "sales.read", "providers.read", "access.users"]) {
    const client = await reader([grant(permission)]);
    for (const path of ["dashboard", "pareto"])
      expect((await client.request(`/api/purchases/${path}?${range}`)).status).toBe(403);
  }
});

test("totales, costo promedio y comparación requieren costos de compras", async () => {
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  const result = await client.request(`/api/purchases/dashboard?${range}&${compare}`);
  expect(result.status).toBe(200);
  expect(result.body.kpis).toEqual({
    totalInvoices: 3,
    totalQuantity: 6,
    totalPurchased: 130,
    avgUnitCost: 21.67,
    avgTicket: 43.33,
    compareQuantity: 2,
    compareInvoices: 1,
    comparePurchased: 16,
  });
  expect(result.body.topProducts.map((row) => row.totalPurchased)).toEqual(["80.00", "50.00"]);
  expect(result.body).not.toHaveProperty("topProviders");
  expect(result.body).not.toHaveProperty("bestProvider");
});

test("datos básicos de proveedor y clasificaciones no incluyen identificación o contactos", async () => {
  const client = await reader([grant("purchases.read"), grant("providers.read")]);
  const result = await client.request(`/api/purchases/dashboard?${range}`);
  expect(result.body.bestProvider).toMatchObject({
    id: "PUR-A",
    name: "Proveedor compras A",
    quantity: "5.000",
    invoiceCount: 2,
  });
  expect(result.body.topProviders[0]).not.toHaveProperty("totalPurchased");
  expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|Rif|Telfs|Email/);
  const noProviders = await reader([grant("purchases.read")]);
  expect((await noProviders.request(`/api/purchases/dashboard?${range}&proveedorId=PUR-A`)).status).toBe(403);
});

test("grupo y proveedor acotan también comparaciones y rankings", async () => {
  const client = await reader([grant("purchases.read"), grant("purchases.costs"), grant("providers.read")]);
  const result = await client.request(`/api/purchases/dashboard?${range}&${compare}&proveedorId=PUR-A&groupId=G`);
  expect(result.body.kpis).toMatchObject({
    totalInvoices: 1,
    totalQuantity: 5,
    totalPurchased: 80,
    comparePurchased: 16,
  });
  expect(result.body.topProducts).toHaveLength(1);
  expect(result.body.topProviders).toHaveLength(1);
  expect(result.body.groupPurchasesChart).toHaveLength(1);
  const empty = await client.request(`/api/purchases/dashboard?${range}&categoryId=NOPE`);
  expect(empty.body.kpis).toMatchObject({
    totalInvoices: 0,
    totalQuantity: 0,
    totalPurchased: 0,
    avgTicket: null,
    avgUnitCost: null,
  });
  expect(empty.body.topProducts).toEqual([]);
});

test("Pareto de compras clasifica todo el conjunto sin depender de ventas ni inventario", async () => {
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  const result = await client.request(`/api/purchases/pareto?${range}`);
  expect(result.status).toBe(200);
  expect(result.body.products.map((row) => [row.productId, row.totalPurchased, row.cumulativePercent])).toEqual([
    ["P", 80, 61.54],
    ["MISSING-PUR", 50, 100],
  ]);
  expect(result.body.summary).toMatchObject({
    totalProducts: 2,
    classA: { count: 1, purchasedPercent: 61.54 },
    classC: { count: 1, purchasedPercent: 38.46 },
  });
  expect(JSON.stringify(result.body)).not.toMatch(/inventoryValue|firstPurchaseDate|newProducts|netProfit|Provider/);
});

test("campos inválidos no permiten variar población, orden sensible ni tablas", async () => {
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  for (const [path, suffix] of [
    ["dashboard", "sortBy=monto"],
    ["dashboard", "search=PRIVATE"],
    ["dashboard", "showNoe=true"],
    ["dashboard", "compareFrom=bad"],
    ["pareto", "limit=1"],
    ["pareto", compare],
    ["pareto", "showNoe=false"],
  ])
    expect((await client.request(`/api/purchases/${path}?${range}&${suffix}`)).status).toBe(400);
});

test("importes desconocidos no se convierten en cero ni en clases ABC válidas", async () => {
  await environment
    .db("mastercomp")
    .insert({ IdFactura: "purchase-null-dashboard", Fecha: "2026-10-01", Anulada: false });
  await environment
    .db("slavecomp")
    .insert({ IdFactura: "purchase-null-dashboard", IdProducto: null, Precio: null, Cantidad: null });
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  const period = "from=2026-10-01&to=2026-10-31";
  const result = await client.request(`/api/purchases/dashboard?${period}`);
  expect(result.body.kpis).toMatchObject({
    totalInvoices: 1,
    totalQuantity: null,
    totalPurchased: null,
    avgUnitCost: null,
    avgTicket: null,
  });
  const pareto = await client.request(`/api/purchases/pareto?${period}`);
  expect(pareto.body.products[0]).toMatchObject({
    productId: "__none__",
    totalPurchased: null,
    cumulativePercent: null,
    abcClass: null,
  });
});

test("Pareto no trunca un conjunto que supera su límite", async () => {
  await environment.db("slavecomp").insert(
    Array.from({ length: 5000 }, (_, i) => ({
      IdFactura: "purchase-august-A",
      IdProducto: `LIMIT-${i}`,
      Precio: 1,
      Cantidad: 1,
    })),
  );
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  expect((await client.request(`/api/purchases/pareto?${range}`)).status).toBe(413);
});
