const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
let environment;
const grant = (capability) => ({ capability, scope: "global" });
const range = "from=2026-11-01&to=2026-11-30&showNoe=false";
async function clientFor(resource, actions = []) {
  const user = await environment.seedUser({
    permissions: [grant(`${resource}.read`), ...actions.map((action) => grant(`${resource}.${action}`))],
  });
  const client = environment.client();
  expect((await client.login(user)).status).toBe(200);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await require("../../../tests/support/sales-fixtures.cjs").seedSales(environment.db);
  await require("../../../tests/support/party-fixtures.cjs").seedParties(environment.db);
  await require("../../../tests/support/purchase-fixtures.cjs").seedPurchases(environment.db);
  await require("../../../tests/support/provider-fixtures.cjs").seedProviders(environment.db);
  await require("../../../tests/support/receivables-fixtures.cjs").seedReceivables(environment.db);
  await require("../../../tests/support/commission-fixtures.cjs").seedCommissions(environment.db);
});
afterAll(async () => environment?.close());

test.each([
  ["sales.dashboard", `/api/dashboard/sales?${range}`],
  ["sales.breakdown", `/api/sales/productos?${range}`],
  ["sales.dispatch", `/api/invoices?${range}`],
  ["purchases.dashboard", "/api/purchases/dashboard?from=2026-11-01&to=2026-11-30"],
  ["purchases.breakdown", "/api/purchases/products?from=2026-11-01&to=2026-11-30"],
  ["clients.dashboard", `/api/clients/dashboard?${range}`],
  ["clients.directory", `/api/clients/list?${range}`],
  ["clients.details", `/api/clients/C/summary?${range}`],
  ["clients.documents", `/api/clients/C/sales?${range}`],
  ["clients.inactive", `/api/clients/sin-facturar?${range}&sortBy=Empresa`],
  ["sellers.dashboard", `/api/sellers/dashboard?${range}`],
  ["sellers.directory", `/api/sellers/list?${range}`],
  ["sellers.details", `/api/sellers/A/summary?${range}`],
  ["sellers.documents", `/api/sellers/A/sales?${range}`],
  ["sellers.commissions", "/api/employees/commissionInfo/A"],
  ["providers.directory", `/api/providers/list?${range}`],
  ["providers.details", `/api/providers/PUR-A/summary?${range}`],
  ["providers.sales", `/api/providers/PUR-A/sales?${range}`],
  ["providers.purchases", "/api/providers/PUR-A/purchases?from=2026-11-01&to=2026-11-30"],
  ["providers.clients", `/api/providers/PUR-A/clients?${range}`],
  ["providers.sellers", `/api/providers/PUR-A/sellers?${range}`],
  ["providers.products", `/api/providers/PUR-A/products?${range}`],
  ["clients.receivables", "/api/receivables?sortBy=name"],
])("%s se consulta de forma completa sin conceder otros módulos ni rentabilidad", async (resource, endpoint) => {
  const client = await clientFor(resource);
  const response = await client.request(endpoint);
  expect(response.status).toBe(200);
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toMatch(/"(?:utilidad|profit|cost|costo|netProfit|marginPercent)":/);
  if (resource === "sales.dispatch") expect(serialized).not.toMatch(/"(?:totalAmount|price|totalRawProfit)":/);
});

test("consultar tasas no concede sincronización y leer preferencias no permite cambiarlas", async () => {
  const rates = await clientFor("settings.rates");
  expect((await rates.request("/api/currency_rates")).status).toBe(200);
  expect(
    (await rates.request("/api/currency_rates/bcv/sync", { method: "POST", body: { confirmed: true } })).status,
  ).toBe(403);
  const preferences = await clientFor("settings.preferences");
  expect((await preferences.request("/api/preferences")).status).toBe(200);
  expect(
    (
      await preferences.request("/api/preferences", {
        method: "PUT",
        body: { documentType: "delivery-notes", revision: 1 },
      })
    ).status,
  ).toBe(403);
  expect((await preferences.request("/api/settings", { method: "PUT", body: { reportCurrency: "Bs" } })).status).toBe(
    403,
  );
});

test("modificar comisiones requiere la acción explícita además de la consulta completa", async () => {
  await require("../../../tests/support/commission-fixtures.cjs").prepareCommissionWrites(environment.db);
  const client = await clientFor("sellers.commissions", ["update"]);
  const response = await client.request("/api/employees/commissionInfo/A/preview", {
    method: "POST",
    body: { commissionInfo: { G: "15.0000" }, reason: "Revisión de autorización" },
  });
  expect(response.status).toBe(200);
  const readOnly = await clientFor("sellers.commissions");
  expect(
    (
      await readOnly.request("/api/employees/commissionInfo/A/preview", {
        method: "POST",
        body: { commissionInfo: { G: "15.0000" }, reason: "Sin modificación" },
      })
    ).status,
  ).toBe(403);
});

test.each([
  [
    "clients.dashboard",
    `/api/clients/dashboard?${range}`,
    ["abc", "treemapTop50", "revenueBySegment", "concentration", "retention", "value"],
  ],
  [
    "sellers.dashboard",
    `/api/sellers/dashboard?${range}`,
    ["ranking", "previousSales", "compareSales", "avgSalesPerSeller", "improvedSellers"],
  ],
  ["sales.dashboard", `/api/dashboard/sales?${range}`, ["bestEmployee", "topClients", "topProducts"]],
])("%s incluye clasificaciones e indicadores comerciales con consulta", async (resource, endpoint, keys) => {
  const response = await (await clientFor(resource)).request(endpoint);
  expect(response.status).toBe(200);
  for (const key of keys.filter((key) => key !== "value")) expect(JSON.stringify(response.body)).toContain(`"${key}":`);
});

test("el directorio comercial ordena vendedores por ventas visibles", async () => {
  const client = await clientFor("sellers.directory");
  const response = await client.request("/api/sellers/list?from=2026-01-01&to=2026-01-31&sortDir=asc");
  expect(response.status).toBe(200);
  expect(response.body.data.map((row) => row.name)).toEqual(["Vendedor A", "Vendedor B"]);
});
