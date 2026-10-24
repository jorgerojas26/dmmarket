const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedParties } = require("../../../tests/support/party-fixtures.cjs");
let environment;
const range = "from=2026-01-01&to=2026-01-31";
const grant = (capability, scope = "global") => ({ capability, scope });
async function reader(permissions, sellers = ["A"]) {
  const user = await environment.seedUser({ permissions });
  if (sellers.length)
    await environment
      .db("dmmarket_auth_user_sellers")
      .insert(sellers.map((seller_id) => ({ user_id: user.id, seller_id })));
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedParties(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("catálogo o ventas por separado no autorizan dashboard", async () => {
  for (const permissions of [[grant("clients.read")], [grant("sales.read")], [grant("access.users")]]) {
    const client = await reader(permissions);
    expect((await client.request(`/api/clients/dashboard?${range}`)).status).toBe(403);
  }
  const empty = await reader([grant("clients.read"), grant("sales.read", "assigned")], []);
  expect((await empty.request(`/api/clients/dashboard?${range}`)).status).toBe(403);
});

test.each(["false", "true"])(
  "retención, actividad y rankings sólo usan ventas autorizadas showNoe=%s",
  async (showNoe) => {
    const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
    const result = await client.request(`/api/clients/dashboard?${range}&showNoe=${showNoe}`);
    const amount = showNoe === "true" ? 200 : 100;
    expect(result.status).toBe(200);
    expect(result.body.kpis).toMatchObject({
      totalClients: 3,
      activeClients: 1,
      sinFacturar: 2,
      activePercent: 33.33,
      unregisteredActiveClients: 0,
      avgFrequency: 1,
      retention: { retainedRevenue: 10, prevPeriodRevenue: 10, rate: 100 },
      concentration: { top5: 100, top10: 100, top20: 100 },
    });
    expect(result.body.waterfall).toEqual({ retained: 1, lost: 0, gained: 0, previous: 1, current: 1 });
    expect(result.body.monthlyActive).toEqual([{ month: "2026-01", count: 1, unregistered: 0 }]);
    expect(result.body.treemapTop50).toEqual([{ clientId: "C", name: "Cliente sintético", value: amount }]);
    expect(result.body.abc.clients).toHaveLength(1);
    expect(result.body.abc.clients[0].total_usd).toBe(amount);
    expect(result.body.revenueBySegment[0]).toMatchObject({ num_clients: 1, revenue: amount, avg_invoices: 1 });
    expect(result.body.coverage.routes[0]).toMatchObject({
      Id_Ruta: "R",
      asignados: 3,
      activos: 1,
      coberturaPct: 33.33,
    });
    expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|utilidad|abcUtility|rif|phone|email/i);
  },
);

test("utilidad y ordenación derivada requieren costos y utilidad sobre todo el conjunto", async () => {
  const partial = await reader([
    grant("clients.read"),
    grant("sales.read"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  const result = await partial.request(`/api/clients/dashboard?${range}`);
  expect(result.body.kpis).toMatchObject({
    activeClients: 2,
    sinFacturar: 1,
    avgFrequency: 1.5,
    retention: { prevPeriodRevenue: 30, retainedRevenue: 30, rate: 100 },
  });
  expect(result.body.waterfall).toEqual({ retained: 1, lost: 0, gained: 1, previous: 1, current: 2 });
  expect(result.body.treemapTop50.map((row) => row.value)).toEqual([300, 250]);
  expect(result.body).not.toHaveProperty("abcUtility");
  const narrowed = await partial.request(`/api/clients/dashboard?${range}&employeeId=A`);
  expect(narrowed.body.abcUtility.clients[0].utilidad).toBe(39);
  expect(narrowed.body.abcUtility.clients[0].total_usd).toBe(100);
  for (const capability of ["sales.costs", "sales.profit"]) {
    const single = await reader([grant("clients.read"), grant("sales.read"), grant(capability)]);
    expect((await single.request(`/api/clients/dashboard?${range}`)).body).not.toHaveProperty("abcUtility");
  }
  const full = await reader([grant("clients.read"), grant("sales.read"), grant("sales.costs"), grant("sales.profit")]);
  const all = await full.request(`/api/clients/dashboard?${range}`);
  expect(all.body.abcUtility.clients.map((row) => row.utilidad)).toEqual([146, 100]);
});

test("rutas se aplican antes de actividad, retención y rankings sin mezcla global", async () => {
  await environment.db("rutas").insert({ Id_Ruta: "Z", Nombre: "Ruta B" });
  await environment.db("clientes").where("IdCliente", "CB").update({ Ruta: "Z" });
  const client = await reader([grant("clients.read"), grant("sales.read")]);
  const result = await client.request(`/api/clients/dashboard?${range}&ruta=Z`);
  expect(result.status).toBe(200);
  expect(result.body.kpis).toMatchObject({
    totalClients: 1,
    activeClients: 1,
    sinFacturar: 0,
    activePercent: 100,
    retention: { retainedRevenue: 0, prevPeriodRevenue: 0, rate: null },
  });
  expect(result.body.treemapTop50).toEqual([{ clientId: "CB", name: "Cliente exclusivo de B", value: 250 }]);
  expect(result.body.coverage).toMatchObject({ totalClients: 1, routes: [{ Id_Ruta: "Z", asignados: 1, activos: 1 }] });
  const own = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  const hidden = await own.request(`/api/clients/dashboard?${range}&ruta=Z`);
  expect(hidden.body.kpis.activeClients).toBe(0);
  expect(hidden.body.treemapTop50).toEqual([]);
  expect(hidden.body.monthlyActive).toEqual([]);
  expect(hidden.body.kpis.retention.prevPeriodRevenue).toBe(0);
});

test("cabeceras sin líneas cuentan una vez; identidades históricas se separan del catálogo", async () => {
  await environment.db("masterfact").insert([
    { IdFactura: "header-only", IdVend: "A", IdCliente: "C", Fecha: "2026-03-01", Anulada: false },
    { IdFactura: "orphan", IdVend: "A", IdCliente: "H", Fecha: "2026-03-02", Anulada: false },
    { IdFactura: "null-client", IdVend: "A", IdCliente: null, Fecha: "2026-03-02", Anulada: false },
    { IdFactura: "void-dashboard", IdVend: "A", IdCliente: "NEVER", Fecha: "2026-03-02", Anulada: true },
  ]);
  await environment.db("slavefact").insert([
    { IdFactura: "orphan", IdProducto: "P", Precio: 12, Costo: 2, Cantidad: 1 },
    { IdFactura: "orphan", IdProducto: "P", Precio: 13, Costo: 2, Cantidad: 1 },
    { IdFactura: "null-client", IdProducto: "P", Precio: 20, Costo: 2, Cantidad: 1 },
  ]);
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  const result = await client.request("/api/clients/dashboard?from=2026-03-01&to=2026-03-31");
  expect(result.body.kpis).toMatchObject({
    totalClients: 3,
    activeClients: 1,
    activePercent: 33.33,
    unregisteredActiveClients: 2,
    sinFacturar: 2,
    avgFrequency: 1,
  });
  expect(result.body.monthlyActive).toEqual([{ month: "2026-03", count: 1, unregistered: 2 }]);
  expect(result.body.treemapTop50.map((row) => row.value)).toEqual([25, 20, 0]);
  expect(result.body.waterfall.current).toBe(3);
  expect(result.body.coverage.routes.reduce((sum, row) => sum + row.activos, 0)).toBe(1);
});

test("cero o contribuciones negativas no inventan porcentajes ni clases ABC", async () => {
  await environment
    .db("masterfact")
    .insert({ IdFactura: "return", IdVend: "A", IdCliente: "C", Fecha: "2026-04-01", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "return", IdProducto: "P", Precio: -10, Costo: 2, Cantidad: 1 });
  const client = await reader([
    grant("clients.read"),
    grant("sales.read", "assigned"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  const negative = await client.request("/api/clients/dashboard?from=2026-04-01&to=2026-04-30");
  expect(negative.body.abc.clients[0]).toMatchObject({ total_usd: -10, cumulativePercent: null, abcClass: null });
  expect(negative.body.abcUtility.clients[0]).toMatchObject({ utilidad: -12, cumulativePercent: null, abcClass: null });
  expect(negative.body.kpis.concentration.top5).toBeNull();
  const zero = await client.request("/api/clients/dashboard?from=2026-05-01&to=2026-05-31");
  expect(zero.body.abc.summary).toMatchObject({ totalClients: 0, classC: { count: 0, revenuePercent: 0 } });
  expect(zero.body.kpis.activeClients).toBe(0);
});

test("parámetros sensibles, períodos y consultas alternativos son rechazados", async () => {
  const client = await reader([grant("clients.read"), grant("sales.read")]);
  for (const url of [
    "/api/clients/dashboard",
    `/api/clients/dashboard?${range}&sortBy=utilidad`,
    `/api/clients/dashboard?${range}&search=PRIVATE`,
    `/api/clients/dashboard?${range}&compareFrom=2025-01-01`,
    "/api/clients/dashboard?from=0000-01-01&to=0000-01-31",
  ])
    expect((await client.request(url)).status).toBe(400);
});

test("collation insensible no amplía actividad ni retención o clasificación propios", async () => {
  await environment.db.raw(
    "ALTER TABLE masterfact MODIFY IdVend VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment
    .db("masterfact")
    .insert({ IdFactura: "lowercase", IdVend: "a", IdCliente: "NEVER", Fecha: "2026-01-01", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "lowercase", IdProducto: "P", Precio: 999, Costo: 1, Cantidad: 1 });
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  const result = await client.request(`/api/clients/dashboard?${range}`);
  expect(result.body.kpis.activeClients).toBe(1);
  expect(result.body.treemapTop50.map((row) => row.value)).toEqual([100]);
  expect(result.body.kpis.retention.prevPeriodRevenue).toBe(10);
});

test("el catálogo excesivo no produce una clasificación truncada", async () => {
  await environment
    .db("clientes")
    .insert(Array.from({ length: 5000 }, (_, i) => ({ IdCliente: `LIMIT-${i}`, Empresa: `Cliente sintético ${i}` })));
  const client = await reader([grant("clients.read"), grant("sales.read")]);
  expect((await client.request(`/api/clients/dashboard?${range}`)).status).toBe(413);
});
