const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedParties } = require("../../../tests/support/party-fixtures.cjs");
let environment;
const range = "from=2026-01-01&to=2026-01-31";
const grant = (capability, scope = "global") => ({ capability, scope });
async function reader(permissions) {
  const user = await environment.seedUser({ permissions });
  await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
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

test("rutas son catálogo explícito, sin inferir autorización desde ventas", async () => {
  const sales = await reader([grant("sales.read", "assigned")]);
  for (const url of [
    "/api/clients/routes",
    `/api/clients/average/month/C?${range}`,
    `/api/clients/best/product/P?${range}`,
  ])
    expect((await sales.request(url)).status).toBe(403);
  const catalog = await reader([grant("clients.read")]);
  expect((await catalog.request("/api/clients/routes")).body).toEqual([
    { Id_Ruta: "R", Nombre: "Ruta sintética", clientes: 3 },
  ]);
  expect((await catalog.request(`/api/clients/routes?${range}`)).status).toBe(400);
  expect((await catalog.request(`/api/clients/average/month/C?${range}`)).status).toBe(403);
  expect((await catalog.request(`/api/clients/best/product/P?${range}`)).status).toBe(403);
});

test.each(["false", "true"])(
  "meses distinguen años y sólo cuentan documentos autorizados showNoe=%s",
  async (showNoe) => {
    const own = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
    const result = await own.request(`/api/clients/average/month/C?from=2025-12-01&to=2026-02-28&showNoe=${showNoe}`);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      id: "Cliente sintético",
      data: [
        { x: "2025-12", y: 10, invoiceCount: 1 },
        { x: "2026-01", y: showNoe === "true" ? 200 : 100, invoiceCount: 1 },
        { x: "2026-02", y: null, invoiceCount: 0 },
      ],
    });
    const other = await own.request(`/api/clients/average/month/CB?${range}&showNoe=${showNoe}`);
    expect(other.body.data).toEqual([{ x: "2026-01", y: null, invoiceCount: 0 }]);
    expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|utilidad|profit|cost/i);
  },
);

test.each(["false", "true"])(
  "ranking aplica alcance antes de agrupar y omite utilidad no cubierta showNoe=%s",
  async (showNoe) => {
    const own = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
    const result = await own.request(`/api/clients/best/product/P?${range}&showNoe=${showNoe}`);
    expect(result.status).toBe(200);
    expect(result.body).toHaveLength(1);
    expect(result.body[0]).toMatchObject({
      clientId: "C",
      quantity_total: "1.000",
      total_USD: showNoe === "true" ? "200.00" : "100.00",
    });
    expect(result.body[0]).not.toHaveProperty("utilidad");
    const financial = await reader([
      grant("clients.read"),
      grant("sales.read"),
      grant("sales.costs", "assigned"),
      grant("sales.profit", "assigned"),
    ]);
    const global = await financial.request(`/api/clients/best/product/P?${range}&showNoe=${showNoe}`);
    expect(global.body).toHaveLength(2);
    expect(global.body.every((row) => !Object.hasOwn(row, "utilidad"))).toBe(true);
    const bounded = await financial.request(`/api/clients/best/product/P?${range}&showNoe=${showNoe}&employeeId=A`);
    expect(Number(bounded.body[0].utilidad)).toBe(showNoe === "true" ? 107 : 39);
    expect((await own.request(`/api/clients/best/product/P?${range}&ruta=missing`)).body).toEqual([]);
  },
);

test("períodos y parámetros inválidos no abren búsquedas ni ordenación sensible", async () => {
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  for (const url of [
    "/api/clients/average/month/C",
    "/api/clients/average/month/C?from=2025-01-01&to=2027-01-01",
    `/api/clients/average/month/C?${range}&from=invalid`,
    `/api/clients/best/product/P?${range}&sortBy=utilidad`,
    `/api/clients/best/product/P?${range}&search=PRIVATE`,
    `/api/clients/best/product/${encodeURIComponent("' OR 1=1 --")}?${range}`,
  ])
    expect((await client.request(url)).status).toBe(400);
});

test("varias líneas cuentan un documento y un producto sin catálogo no se pierde", async () => {
  await environment
    .db("masterfact")
    .insert({ IdFactura: "multiline-month", IdVend: "A", IdCliente: "C", Fecha: "2026-04-01", Anulada: false });
  await environment.db("slavefact").insert([
    { IdFactura: "multiline-month", IdProducto: "ORPHAN", Precio: 12, Costo: 2, Cantidad: 1 },
    { IdFactura: "multiline-month", IdProducto: "ORPHAN", Precio: 13, Costo: 3, Cantidad: 1 },
  ]);
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  const period = "from=2026-04-01&to=2026-04-30";
  expect((await client.request(`/api/clients/average/month/C?${period}`)).body.data).toEqual([
    { x: "2026-04", y: 25, invoiceCount: 1 },
  ]);
  const product = await client.request(`/api/clients/best/product/ORPHAN?${period}`);
  expect(product.body[0]).toMatchObject({ quantity_total: "2.000", total_USD: "25.00" });
});

test("identificadores insensibles no amplían histórico, ranking ni utilidad propios", async () => {
  await environment.db.raw(
    "ALTER TABLE masterfact MODIFY IdVend VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment.db("vendedores").insert({ idVend: "a", Empresa: "No autorizado" });
  await environment
    .db("masterfact")
    .insert({ IdFactura: "lowercase", IdVend: "a", IdCliente: "C", Fecha: "2026-01-01", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "lowercase", IdProducto: "P", Precio: 999, Costo: 1, Cantidad: 1 });
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  expect((await client.request(`/api/clients/average/month/C?${range}`)).body.data[0].y).toBe(100);
  const financial = await reader([
    grant("clients.read"),
    grant("sales.read"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  const product = await financial.request(`/api/clients/best/product/P?${range}&employeeId=A`);
  expect(Number(product.body[0].utilidad)).toBe(39);
  expect(Number(product.body[0].total_USD)).toBe(100);
});

test("último mes de cuatro dígitos termina sin extender el rango", async () => {
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  const result = await client.request("/api/clients/average/month/C?from=9999-12-01&to=9999-12-31");
  expect(result.status).toBe(200);
  expect(result.body.data).toEqual([{ x: "9999-12", y: null, invoiceCount: 0 }]);
});
