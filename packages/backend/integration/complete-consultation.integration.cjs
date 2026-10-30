const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { CAPABILITIES } = require("@dmmarket/permissions");
let environment;
const range = "from=2026-01-01&to=2026-01-31&showNoe=false";
const grant = (capability, scope = "global") => ({ capability, scope });
async function actor(permissions, linked = false) {
  const user = await environment.seedUser({ permissions });
  if (linked) await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const client = environment.client();
  expect((await client.login(user)).status).toBe(200);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await require("../../../tests/support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../../../tests/support/party-fixtures.cjs").seedParties(environment.db);
  await require("../../../tests/support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../../../tests/support/receivables-fixtures.cjs").seedReceivables(environment.db);
  await require("../../../tests/support/inventory-fixtures.cjs").seedInventory(environment.db);
  await environment
    .db("mastercomp")
    .insert({ IdFactura: "consultation-jan", Fecha: "2026-01-01", IdProveedor: "PUR-A", Anulada: 0 });
  await environment.db("slavecomp").insert({ IdFactura: "consultation-jan", IdProducto: "P", Precio: 5, Cantidad: 1 });
});
afterAll(async () => environment?.close());

test("consultar ventas incluye indicadores, Pareto e impresión, no rentabilidad ni otras vistas", async () => {
  const client = await actor([grant("sales.dashboard.read")]);
  const report = await client.request(`/api/dashboard/sales?${range}`);
  expect(report.status).toBe(200);
  expect(report.body.kpis).toHaveProperty("totalRawProfit");
  expect(report.body.kpis).not.toHaveProperty("totalNetProfit");
  expect(report.body.topClients.length).toBeGreaterThan(0);
  const pareto = await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit`);
  expect(pareto.status).toBe(200);
  expect(pareto.body.products.length + pareto.body.newProducts.length).toBeGreaterThan(0);
  expect((await client.request(`/api/dashboard/pareto?${range}&metric=netProfit`)).status).toBe(403);
  expect((await client.request(`/api/exports/sales?${range}&kind=pareto&metric=rawProfit`)).status).toBe(200);
  expect((await client.request(`/api/sales/facturas?${range}`)).status).toBe(403);
});

test("la rentabilidad de un dashboard no habilita la de otro y mantiene el alcance", async () => {
  const client = await actor(
    [grant("sales.dashboard.read", "assigned"), grant("sales.dashboard.financial"), grant("clients.dashboard.read")],
    true,
  );
  const sales = await client.request(`/api/dashboard/sales?${range}`);
  expect(sales.status).toBe(200);
  expect(Number(sales.body.kpis.totalRawProfit)).toBe(100);
  expect(sales.body.kpis).toHaveProperty("totalNetProfit");
  const clients = await client.request(`/api/clients/dashboard?${range}`);
  expect(clients.status).toBe(200);
  expect(clients.body).toHaveProperty("abc");
  expect(clients.body).not.toHaveProperty("abcUtility");
});

test("compras y desgloses comerciales incluyen sus importes con consulta", async () => {
  for (const [resource, endpoint, money] of [
    ["purchases.dashboard", "/api/purchases/dashboard?from=2026-08-01&to=2026-08-31", "totalPurchased"],
    ["sales.breakdown", `/api/sales/facturas?${range}`, "monto"],
    ["clients.directory", `/api/clients/list?${range}`, "total_ventas"],
    ["sellers.directory", `/api/sellers/list?${range}`, "sales"],
  ]) {
    const response = await (await actor([grant(`${resource}.read`)])).request(endpoint);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toContain(`"${money}":`);
    expect(JSON.stringify(response.body)).not.toMatch(/"(?:utilidad|profit|marginPercent)":/);
    expect(response.body.exportAllowed).toBe(true);
  }
});

test("cartera de consulta incluye saldos, historial, detalle e impresión sin permitir operaciones", async () => {
  const client = await actor([grant("clients.receivables.read")]);
  const list = await client.request("/api/receivables");
  expect(list.status).toBe(200);
  expect(Number(list.body.summary.balance)).toBe(400);
  const detail = await client.request("/api/receivables/C");
  expect(detail.status).toBe(200);
  expect(Number(detail.body.summary.balance)).toBe(300);
  expect(detail.body).toHaveProperty("timeline");
  expect((await client.request("/api/exports/receivables")).status).toBe(200);
  for (const type of ["payment", "void", "close", "reopen"])
    expect((await client.request("/api/receivables/C/preview", { method: "POST", body: { type } })).status).toBe(403);
});

test("abonar, anular y cerrar son acciones independientes", async () => {
  for (const action of ["payment", "void", "close"]) {
    const client = await actor([grant("clients.receivables.read"), grant(`clients.receivables.${action}`)]);
    for (const type of ["payment", "void", "close", "reopen"]) {
      const response = await client.request("/api/receivables/C/preview", { method: "POST", body: { type } });
      const permitted = type === action || (type === "reopen" && action === "void");
      if (permitted) expect(response.status).not.toBe(403);
      else expect(response.status).toBe(403);
    }
  }
});

test("Despacho e Inventario conservan consulta operativa útil e impresión sin dinero", async () => {
  const stock = await actor([grant("inventory.stock.read")]);
  const report = await stock.request("/api/products");
  expect(report.status).toBe(200);
  expect(report.body.data.length).toBeGreaterThan(0);
  expect(JSON.stringify(report.body)).not.toContain('"PrecioA":');
  const dispatch = await actor([grant("sales.dispatch.read")]);
  const selected = await dispatch.request("/api/exports/sales/dispatch", {
    method: "POST",
    body: { invoiceIds: ["1"], showNoe: false },
  });
  expect(selected.status).toBe(200);
  expect(selected.body.products.length).toBeGreaterThan(0);
  expect(selected.body.products[0]).not.toHaveProperty("price");
});

test("el catálogo no ofrece controles redundantes ni fragmenta los análisis del dashboard", () => {
  for (const key of [
    "sales.dashboard.amounts",
    "sales.pareto.read",
    "sales.unsold.read",
    "clients.inactive.read",
    "purchases.dashboard.amounts",
    "clients.receivables.amounts",
    "clients.receivables.export",
    "clients.receivables.reopen",
    "sales.breakdown.amounts",
    "sales.breakdown.export",
  ])
    expect(Object.hasOwn(CAPABILITIES, key)).toBe(false);
  for (const key of [
    "sales.dashboard.financial",
    "clients.dashboard.financial",
    "sales.dispatch.amounts",
    "inventory.stock.amounts",
  ])
    expect(Object.hasOwn(CAPABILITIES, key)).toBe(true);
});

test("el alias de escenarios históricos no amplía consulta vinculada al dashboard completo", async () => {
  const client = await actor([grant("sales.pareto.read", "assigned")], true);
  const report = await client.request(`/api/dashboard/sales?${range}`);
  expect(report.status).toBe(200);
  expect(Number(report.body.kpis.totalRawProfit)).toBe(100);
});
