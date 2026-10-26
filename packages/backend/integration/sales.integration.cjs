const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
let environment;
const query = "from=2026-01-01&to=2026-01-31";
async function reader(permissions, sellers = []) {
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
});
afterAll(async () => {
  await environment?.close();
});

test.each(["false", "true"])("vendedor A solo ve su SQL antes de contar/sumar/paginar showNoe=%s", async (showNoe) => {
  const client = await reader([{ capability: "sales.read", scope: "assigned" }], ["A"]);
  const response = await client.request(`/api/sales/facturas?${query}&showNoe=${showNoe}&limit=1`);
  expect(response.status).toBe(200);
  expect(response.body.pagination.total).toBe(1);
  expect(response.body.data[0].invoiceId).toBe(showNoe === "true" ? "2" : "1");
  expect(Number(response.body.totals.monto)).toBe(showNoe === "true" ? 200 : 100);
  expect(JSON.stringify(response.body)).not.toMatch(/utilidad|promedio|Costo|Rif|PRIVATE-IDENTIFICATION/);
  const forbidden = await client.request(`/api/sales/productos?${query}&showNoe=${showNoe}&employeeId=B`);
  expect(forbidden.body.pagination.total).toBe(0);
  expect(forbidden.body.data).toEqual([]);
});

test("alcance vacío deniega y filtros no amplían a otro vendedor", async () => {
  const client = await reader([{ capability: "sales.read", scope: "assigned" }]);
  expect((await client.request(`/api/sales/facturas?${query}`)).status).toBe(403);
});

test("lectura global más utilidad/costos propios no expone márgenes globales ni ordenación", async () => {
  const client = await reader(
    [
      { capability: "sales.read", scope: "global" },
      { capability: "sales.financial", scope: "assigned" },
    ],
    ["A"],
  );
  const all = await client.request(`/api/sales/facturas?${query}`);
  expect(all.body.pagination.total).toBe(2);
  expect(Number(all.body.totals.monto)).toBe(300);
  expect(all.body.totals).not.toHaveProperty("utilidad");
  expect(all.body.data.every((row) => !Object.hasOwn(row, "utilidad"))).toBe(true);
  expect((await client.request(`/api/sales/facturas?${query}&sortBy=utilidad`)).status).toBe(403);
  expect((await client.request(`/api/sales/productos?${query}&sortBy=averageProfitPercent`)).status).toBe(403);
  const own = await client.request(`/api/sales/productos?${query}&employeeId=A&sortBy=netProfit`);
  expect(own.status).toBe(200);
  expect(Number(own.body.totals.netProfit)).toBe(39);
  const other = await client.request(`/api/sales/productos?${query}&employeeId=B`);
  expect(other.body.totals).not.toHaveProperty("netProfit");
});

test("permisos de compras no conceden información financiera de ventas", async () => {
  const client = await reader([
    { capability: "sales.read", scope: "global" },
    { capability: "purchases.costs", scope: "global" },
  ]);
  const response = await client.request(`/api/sales/productos?${query}`);
  expect(response.status).toBe(200);
  expect(response.body.totals).not.toHaveProperty("netProfit");
  expect((await client.request(`/api/sales/productos?${query}&sortBy=netProfit`)).status).toBe(403);
});

test("analista autorizado recibe métricas completas y límites validados", async () => {
  const client = await reader(["sales.read", "sales.financial"].map((capability) => ({ capability, scope: "global" })));
  const response = await client.request(`/api/sales/productos?${query}&limit=1`);
  expect(response.status).toBe(200);
  expect(response.body.pagination.total).toBe(1);
  expect(Number(response.body.totals.rawProfit)).toBe(300);
  expect(Number(response.body.totals.netProfit)).toBe(146);
  for (const suffix of ["&limit=1000", "&sortBy=Costo", "&privateField=Rif", "&showNoe=unknown", "&page=0"])
    expect((await client.request(`/api/sales/productos?${query}${suffix}`)).status).toBe(400);
});

test.each(["false", "true"])("documentos y sus líneas no permiten acceso por ID ajeno showNoe=%s", async (showNoe) => {
  const client = await reader([{ capability: "sales.read", scope: "assigned" }], ["A"]);
  const own = showNoe === "true" ? "2" : "1";
  const other = showNoe === "true" ? "1" : "2";
  const listing = await client.request(`/api/invoices?${query}&showNoe=${showNoe}&limit=1`);
  expect(listing.status).toBe(200);
  expect(listing.body.pagination.total).toBe(1);
  expect(listing.body.data[0].invoiceId).toBe(own);
  expect(listing.body.data[0].products).toHaveLength(1);
  expect(JSON.stringify(listing.body)).not.toMatch(/cost|utilidad|rif|PRIVATE-/i);
  expect((await client.request(`/api/invoices/${other}/detail?showNoe=${showNoe}`)).status).toBe(404);
  expect((await client.request(`/api/invoices/unknown/detail?showNoe=${showNoe}`)).status).toBe(404);
  expect((await client.request(`/api/invoices/void/detail?showNoe=${showNoe}`)).status).toBe(404);
  const detail = await client.request(`/api/invoices/${own}/detail?showNoe=${showNoe}`);
  expect(detail.status).toBe(200);
  expect(detail.body.total).toBe(showNoe === "true" ? 200 : 100);
  expect(detail.body.productos[0].descripcion).toBe("Línea sintética");
  expect(JSON.stringify(detail.body)).not.toMatch(/cost|utilidad|rif|PRIVATE-/i);
  expect((await client.request(`/api/invoices?${query}&sortBy=rif`)).status).toBe(403);
});

test("identificación exige permiso explícito y costos/utilidad respetan el vendedor del documento", async () => {
  const client = await reader(
    [
      { capability: "sales.read", scope: "global" },
      { capability: "sales.financial", scope: "assigned" },
    ],
    ["A"],
  );
  const own = await client.request("/api/invoices/1/detail");
  expect(own.status).toBe(200);
  expect(own.body.utilidad).toBe(39);
  expect(own.body.productos[0].costo).toBe(61);
  expect(own.body).not.toHaveProperty("rif");
  const other = await client.request("/api/invoices/2/detail");
  expect(other.status).toBe(200);
  expect(other.body).not.toHaveProperty("utilidad");
  expect(other.body.productos[0]).not.toHaveProperty("costo");
  const personal = await reader(
    [
      { capability: "sales.read", scope: "assigned" },
      { capability: "clients.personal", scope: "global" },
    ],
    ["A"],
  );
  const response = await personal.request(`/api/invoices?${query}&sortBy=rif`);
  expect(response.status).toBe(200);
  expect(response.body.data[0].rif).toBe("PRIVATE-SNAPSHOT-RIF");
  expect((await personal.request("/api/invoices/1/detail")).body.rif).toBe("PRIVATE-SNAPSHOT-RIF");
});

test.each(["false", "true"])(
  "gráficos, grupos, productos y comparación comparten filtro SQL showNoe=%s",
  async (showNoe) => {
    const client = await reader([{ capability: "sales.read", scope: "assigned" }], ["A"]);
    const amount = showNoe === "true" ? 200 : 100;
    for (const endpoint of ["/api/invoices/group", "/api/invoices/sales/G"]) {
      const result = await client.request(`${endpoint}?${query}&showNoe=${showNoe}`);
      expect(result.status).toBe(200);
      expect(result.body).toHaveLength(1);
      expect(Number(result.body[0].rawProfit)).toBe(amount);
      expect(result.body[0]).not.toHaveProperty("netProfit");
    }
    const products = await client.request(`/api/invoices/sales?${query}&showNoe=${showNoe}`);
    expect(products.status).toBe(200);
    expect(Number(products.body.data[0].rawProfit)).toBe(amount);
    expect(Number(products.body.group_sales_chart_data[0].rawProfit)).toBe(amount);
    const groupProducts = await client.request(`/api/groups/sales/G?${query}&showNoe=${showNoe}`);
    expect(groupProducts.status).toBe(200);
    expect(Number(groupProducts.body[0].rawProfit)).toBe(amount);
    const dashboard = await client.request(
      `/api/dashboard/sales?${query}&showNoe=${showNoe}&compareFrom=2025-12-01&compareTo=2025-12-31`,
    );
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.kpis).toMatchObject({
      totalRawProfit: amount,
      totalQuantity: 1,
      totalInvoices: 1,
      avgTicket: amount,
      compareRawProfit: 10,
      compareInvoices: 1,
    });
    expect(dashboard.body.bestEmployee.name).toBe("Vendedor A");
    expect(JSON.stringify(dashboard.body)).not.toMatch(/netProfit|NetProfit|Margin|Costo|PRIVATE-/);
    expect(
      (await client.request(`/api/dashboard/sales?${query}&showNoe=${showNoe}&employeeId=B`)).body.kpis.totalInvoices,
    ).toBe(0);
  },
);

test("agregados globales no revelan utilidad ni ranking por utilidad propia", async () => {
  const client = await reader(
    [
      { capability: "sales.read", scope: "global" },
      { capability: "sales.financial", scope: "assigned" },
    ],
    ["A"],
  );
  const result = await client.request(`/api/dashboard/sales?${query}&compareFrom=2025-12-01&compareTo=2025-12-31`);
  expect(result.status).toBe(200);
  expect(result.body.kpis.totalRawProfit).toBe(300);
  expect(result.body.kpis.compareRawProfit).toBe(30);
  expect(result.body.kpis).not.toHaveProperty("compareNetProfit");
  expect(result.body.topClients[0]).not.toHaveProperty("netProfit");
  expect(result.body.topProducts[0]).not.toHaveProperty("netProfit");
  const own = await client.request(
    `/api/dashboard/sales?${query}&employeeId=A&compareFrom=2025-12-01&compareTo=2025-12-31`,
  );
  expect(own.body.kpis.totalNetProfit).toBe(39);
  expect(own.body.kpis.compareNetProfit).toBe(7);
});

test("catálogo básico permite solo capacidades aprobadas y comparaciones inválidas fallan", async () => {
  const client = await reader([{ capability: "sales.read", scope: "assigned" }], ["A"]);
  expect((await client.request("/api/groups")).body).toEqual([{ groupId: "G", name: "Grupo sintético" }]);
  const noScope = await reader([{ capability: "sales.read", scope: "assigned" }]);
  for (const url of [
    "/api/groups",
    `/api/invoices?${query}`,
    `/api/dashboard/sales?${query}`,
    "/api/invoices/1/detail",
  ])
    expect((await noScope.request(url)).status).toBe(403);
  for (const extra of [
    "&compareFrom=invalid&compareTo=2025-12-31",
    "&compareFrom=2025-12-01",
    "&sortBy=netProfit",
    "&search=PRIVATE",
  ])
    expect((await client.request(`/api/dashboard/sales?${query}${extra}`)).status).toBe(400);
});

test("búsqueda del documento conserva líneas y totales coherentes, sin consultas por identificación prohibida", async () => {
  await environment.db("masterfact").insert({
    IdFactura: "multi-line",
    IdVend: "A",
    IdCliente: "C",
    Fecha: "2026-02-01",
    Anulada: false,
    Rif: "PRIVATE-MULTI",
  });
  await environment.db("slavefact").insert([
    { IdFactura: "multi-line", IdProducto: "P", Descripcion: "Una línea", Precio: 30, Costo: 10, Cantidad: 1 },
    {
      IdFactura: "multi-line",
      IdProducto: "unknown-product",
      Descripcion: "Otra línea",
      Precio: 70,
      Costo: 50,
      Cantidad: 1,
    },
  ]);
  const client = await reader([{ capability: "sales.read", scope: "assigned" }], ["A"]);
  const result = await client.request("/api/invoices?from=2026-02-01&to=2026-02-28&search=multi-line");
  expect(result.status).toBe(200);
  expect(result.body.data[0].products).toHaveLength(2);
  expect(result.body.data[0].total).toBe(100);
  expect(result.body.data[0].products.reduce((sum, line) => sum + line.price * line.quantity, 0)).toBe(100);
  expect(result.body.totals.total).toBe(100);
  const hidden = await client.request("/api/invoices?from=2026-02-01&to=2026-02-28&search=PRIVATE-MULTI");
  expect(hidden.body.pagination.total).toBe(0);
  expect((await client.request("/api/invoices/multi-line/detail?sortBy=cost")).status).toBe(400);
});

test("dashboard conserva redondeo global y datos incompletos al reutilizar agregados", async () => {
  await environment.db("masterfact").insert([
    { IdFactura: "precision-1", IdVend: "A", IdCliente: "C", Fecha: "2026-05-01", Anulada: false },
    { IdFactura: "precision-2", IdVend: "A", IdCliente: "C", Fecha: "2026-06-01", Anulada: false },
    { IdFactura: "precision-null", IdVend: "A", IdCliente: "C", Fecha: "2026-06-02", Anulada: false },
  ]);
  await environment.db("slavefact").insert([
    { IdFactura: "precision-1", IdProducto: "P", Precio: 0.005, Costo: 0, Cantidad: 1 },
    { IdFactura: "precision-2", IdProducto: "P", Precio: 0.005, Costo: 0, Cantidad: 1 },
    { IdFactura: "precision-null", IdProducto: "P", Precio: null, Costo: 0, Cantidad: 1 },
  ]);
  const client = await reader(
    [
      { capability: "sales.read", scope: "assigned" },
      { capability: "sales.financial", scope: "assigned" },
    ],
    ["A"],
  );
  const result = await client.request("/api/dashboard/sales?from=2026-05-01&to=2026-06-30");
  expect(result.status).toBe(200);
  expect(result.body.kpis).toMatchObject({
    totalRawProfit: 0.01,
    totalNetProfit: 0.01,
    totalInvoices: 3,
    avgMarginPercent: 66.67,
  });
  expect(result.body.topProducts[0]).toMatchObject({ rawProfit: null, netProfit: null, averageProfitPercent: null });
  expect(Number(result.body.topProducts[0].quantity)).toBe(3);
  expect(Number(result.body.groupSalesChart[0].rawProfit)).toBe(0.01);
  expect(Number(result.body.topClients[0].total_USD)).toBe(0.01);
});
