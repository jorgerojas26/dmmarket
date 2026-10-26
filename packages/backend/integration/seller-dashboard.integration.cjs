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

test("dashboard requiere ambas lecturas y no infiere acceso desde administración o campos personales", async () => {
  for (const permissions of [
    [],
    [grant("access.users")],
    [grant("sellers.read")],
    [grant("sales.read")],
    [grant("sellers.personal"), grant("sales.financial")],
  ]) {
    const client = await reader(permissions);
    expect((await client.request(`/api/sellers/dashboard?${range}`)).status).toBe(403);
  }
  const empty = await reader([grant("sellers.read", "assigned"), grant("sales.read", "assigned")], []);
  expect((await empty.request(`/api/sellers/dashboard?${range}`)).status).toBe(403);
});

test.each(["false", "true"])(
  "intersección propia limita ranking, comparación, tendencia y derivados showNoe=%s",
  async (showNoe) => {
    const client = await reader([
      grant("sellers.read", "assigned"),
      grant("sales.read"),
      grant("sales.financial", "assigned"),
    ]);
    const result = await client.request(`/api/sellers/dashboard?${range}&showNoe=${showNoe}`);
    const sales = showNoe === "true" ? 200 : 100;
    expect(result.status).toBe(200);
    expect(result.body.kpis).toMatchObject({
      totalSellers: 1,
      activeSellers: 1,
      inactiveSellers: 0,
      totalSales: sales,
      totalInvoices: 1,
      compareSales: 10,
      marginPercent: showNoe === "true" ? 53.5 : 39,
      lowMarginSellers: 0,
      improvedSellers: 1,
    });
    expect(result.body.ranking).toHaveLength(1);
    expect(result.body.ranking[0]).toMatchObject({ sellerId: "A", sales, previousSales: 10, sharePercent: 100 });
    expect(result.body.ranking[0]).not.toHaveProperty("phone");
    expect(result.body.monthlyTrend).toEqual([{ month: "2026-01", sales, invoiceCount: 1 }]);
    expect(result.body.inactiveSellers).toEqual([]);
  },
);

test.each(["false", "true"])(
  "lectura global no convierte privilegios financieros propios en globales showNoe=%s",
  async (showNoe) => {
    const client = await reader([grant("sellers.read"), grant("sales.read"), grant("sales.financial", "assigned")]);
    const result = await client.request(`/api/sellers/dashboard?${range}&showNoe=${showNoe}`);
    expect(result.status).toBe(200);
    expect(result.body.kpis).toMatchObject({ totalSellers: 2, totalSales: 550, totalInvoices: 3, compareSales: 30 });
    expect(result.body.ranking.map((row) => row.sellerId)).toEqual(["B", "A"]);
    expect(JSON.stringify(result.body)).not.toMatch(/profit|margin|lowMargin|PRIVATE|rif|phone|email/i);
    const filtered = await client.request(`/api/sellers/dashboard?${range}&showNoe=${showNoe}&employeeId=A`);
    expect(filtered.body.kpis.totalSellers).toBe(1);
    expect(filtered.body.kpis.marginPercent).toBe(showNoe === "true" ? 53.5 : 39);
  },
);

test("otros permisos no conceden finanzas ni alertas derivadas", async () => {
  for (const capability of ["inventory.costs", "purchases.costs"]) {
    const client = await reader([grant("sellers.read"), grant("sales.read"), grant(capability)]);
    const result = await client.request(`/api/sellers/dashboard?${range}`);
    expect(result.status).toBe(200);
    expect(result.body.kpis).not.toHaveProperty("lowMarginSellers");
    expect(result.body.kpis).not.toHaveProperty("marginPercent");
    expect(result.body.ranking.every((row) => !Object.hasOwn(row, "profit"))).toBe(true);
  }
  const financial = await reader([grant("sellers.read"), grant("sales.read"), grant("sales.financial")]);
  const global = await financial.request(`/api/sellers/dashboard?${range}`);
  expect(global.body.kpis.marginPercent).toBe(44.73);
  expect(global.body.kpis.lowMarginSellers).toBe(1);
});

test("sin ventas autorizadas no equivale a no vender; contactos se omiten por registro", async () => {
  const client = await reader([grant("sellers.read"), grant("sellers.personal", "assigned"), grant("sales.read")]);
  const result = await client.request("/api/sellers/dashboard?from=2026-02-01&to=2026-02-28");
  expect(result.status).toBe(200);
  expect(result.body.kpis).toMatchObject({
    totalSellers: 2,
    activeSellers: 0,
    inactiveSellers: 2,
    coveragePercent: 0,
    totalSales: 0,
    totalInvoices: 0,
    compareSales: 250,
  });
  expect(result.body.ranking).toEqual([]);
  expect(result.body.monthlyTrend).toEqual([]);
  expect(result.body.inactiveSellers.find((row) => row.sellerId === "A").phone).toBe("PRIVATE-PHONE-A");
  expect(result.body.inactiveSellers.find((row) => row.sellerId === "B")).not.toHaveProperty("phone");
  const assigned = await reader([grant("sellers.read"), grant("sales.read", "assigned")]);
  const partial = await assigned.request(`/api/sellers/dashboard?${range}`);
  expect(partial.body.kpis.totalSales).toBe(100);
  expect(partial.body.inactiveSellers).toEqual([{ sellerId: "B", name: "Vendedor B" }]);
});

test("validación estricta no acepta búsqueda, ordenación o rangos alternativos", async () => {
  const client = await reader([grant("sellers.read"), grant("sales.read")]);
  for (const url of [
    "/api/sellers/dashboard",
    `/api/sellers/dashboard?${range}&sortBy=profit`,
    `/api/sellers/dashboard?${range}&search=PRIVATE`,
    `/api/sellers/dashboard?${range}&limit=5001`,
    `/api/sellers/dashboard?${range}&compareFrom=2025-01-01`,
    "/api/sellers/dashboard?from=0000-01-01&to=0000-01-31",
  ])
    expect((await client.request(url)).status).toBe(400);
});

test("históricos sin ficha y sin vendedor permanecen sin inflar cobertura ni revelar otras identidades", async () => {
  await environment.db("masterfact").insert([
    { IdFactura: "orphan", IdVend: "H", IdCliente: "C", Fecha: "2026-03-01", Anulada: false },
    { IdFactura: "no-seller", IdVend: null, IdCliente: "C", Fecha: "2026-03-02", Anulada: false },
  ]);
  await environment.db("slavefact").insert([
    { IdFactura: "orphan", IdProducto: "P", Precio: 30, Costo: 2, Cantidad: 1 },
    { IdFactura: "no-seller", IdProducto: "P", Precio: 20, Costo: 2, Cantidad: 1 },
  ]);
  const client = await reader([grant("sellers.read"), grant("sales.read")]);
  const result = await client.request("/api/sellers/dashboard?from=2026-03-01&to=2026-03-31");
  expect(result.status).toBe(200);
  expect(result.body.kpis).toMatchObject({
    totalSellers: 4,
    activeSellers: 2,
    inactiveSellers: 2,
    coveragePercent: 50,
    totalSales: 50,
    totalInvoices: 2,
  });
  expect(result.body.ranking.map((row) => row.sellerId)).toEqual(["H", "__none__"]);
  const restricted = await reader([grant("sellers.read", "assigned"), grant("sales.read", "assigned")]);
  const own = await restricted.request("/api/sellers/dashboard?from=2026-03-01&to=2026-03-31");
  expect(own.body.kpis).toMatchObject({ totalSellers: 1, totalSales: 0, activeSellers: 0 });
  expect(JSON.stringify(own.body)).not.toMatch(/__none__|no registrado/);
});

test("inactividad usa días SQL exactos sin desfase horario", async () => {
  const client = await reader([grant("sellers.read", "assigned"), grant("sales.read", "assigned")]);
  const period = "from=2026-01-01&to=2026-02-01";
  const invoice = await client.request(`/api/sellers/dashboard?${period}`);
  expect(invoice.body.kpis.staleSellers).toBe(1);
  expect(invoice.body.ranking[0].daysInactive).toBe(31);
  const noe = await client.request(`/api/sellers/dashboard?${period}&showNoe=true`);
  expect(noe.body.kpis.staleSellers).toBe(0);
  expect(noe.body.ranking[0].daysInactive).toBe(30);
});

test("collation insensible no amplía comparación, ranking ni tendencia propios", async () => {
  await environment.db.raw(
    "ALTER TABLE masterfact MODIFY IdVend VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment.db("vendedores").insert({ idVend: "a", Empresa: "Vendedor ajeno minúscula" });
  await environment
    .db("masterfact")
    .insert({ IdFactura: "lowercase", IdVend: "a", IdCliente: "C", Fecha: "2026-01-01", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "lowercase", IdProducto: "P", Precio: 999, Costo: 1, Cantidad: 1 });
  const client = await reader([
    grant("sellers.read", "assigned"),
    grant("sales.read"),
    grant("sales.financial", "assigned"),
  ]);
  const result = await client.request(`/api/sellers/dashboard?${range}`);
  expect(result.status).toBe(200);
  expect(result.body.kpis).toMatchObject({ totalSales: 100, compareSales: 10, marginPercent: 39 });
  expect(result.body.ranking.map((row) => row.sellerId)).toEqual(["A"]);
  expect(result.body.monthlyTrend).toEqual([{ month: "2026-01", sales: 100, invoiceCount: 1 }]);
});

test("dashboard rechaza cohortes superiores al límite en vez de truncar rankings", async () => {
  await environment
    .db("vendedores")
    .insert(Array.from({ length: 5000 }, (_, i) => ({ idVend: `LIMIT-${i}`, Empresa: `Vendedor sintético ${i}` })));
  const client = await reader([grant("sellers.read"), grant("sales.read")]);
  expect((await client.request(`/api/sellers/dashboard?${range}`)).status).toBe(413);
});
