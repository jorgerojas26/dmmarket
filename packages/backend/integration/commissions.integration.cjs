const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedCommissions } = require("../../../tests/support/commission-fixtures.cjs");
let environment;
const range = "from=2026-12-01&to=2026-12-31";
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
  await seedCommissions(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("consulta de porcentajes exige permiso de comisiones y vínculo exacto", async () => {
  for (const permission of ["sales.read", "sellers.read", "commissions.update", "access.users"]) {
    const client = await reader([grant(permission)]);
    expect((await client.request("/api/employees/commissionInfo/A")).status).toBe(403);
  }
  const client = await reader([grant("commissions.read", "assigned")]);
  const rates = await client.request("/api/employees/commissionInfo/A");
  expect(rates.status).toBe(200);
  expect(Number(rates.body.find((row) => row.groupId === "G").commission)).toBe(10);
  expect(rates.body.find((row) => row.groupId === "COM-G2").commission).toBeNull();
  expect(rates.body.find((row) => row.groupId === "COM-G3").commission).toBeNull();
  expect((await client.request("/api/employees/commissionInfo/B")).status).toBe(403);
  expect((await client.request(`/api/employees/sales/A?${range}`)).status).toBe(403);
});

test("ventas se intersectan con lectura de comisiones, sin duplicar por historial ambiguo", async () => {
  const client = await reader([grant("commissions.read", "assigned"), grant("sales.read")]);
  const result = await client.request(`/api/employees/sales/A?${range}&sortBy=invoiceId&sortDir=asc`);
  expect(result.status).toBe(200);
  expect(result.body.pagination.total).toBe(5);
  expect(result.body.data.find((row) => row.invoiceId === "COM-A")).toMatchObject({
    invoiceTotal: "100.00",
    commissionTotal: 10,
  });
  expect(result.body.data.find((row) => row.invoiceId === "COM-DUP")).toMatchObject({
    invoiceTotal: "100.00",
    commissionTotal: null,
  });
  expect(result.body.data.find((row) => row.invoiceId === "COM-MISS").commissionTotal).toBeNull();
  expect(result.body.data.find((row) => row.invoiceId === "COM-ORPHAN").commissionTotal).toBeNull();
  expect(result.body.data.find((row) => row.invoiceId === "COM-ZERO").commissionTotal).toBe(0);
  expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|rif|utilidad/);
  expect((await client.request(`/api/employees/sales/B?${range}`)).status).toBe(403);
});

test("notas de entrega no reutilizan historial de masterfact con IDs coincidentes", async () => {
  const client = await reader([grant("commissions.read"), grant("sales.read")]);
  expect((await client.request(`/api/employees/sales/A?${range}&showNoe=true`)).status).toBe(403);
  expect((await client.request(`/api/employees/sales/B?${range}&showNoe=true`)).status).toBe(403);
});

test("costos y utilidad conservan cobertura por registro sin inferirse de comisiones", async () => {
  const basic = await reader([grant("commissions.read"), grant("sales.read")]);
  expect((await basic.request(`/api/employees/sales/A?${range}&sortBy=utilidad`)).status).toBe(403);
  const finance = await reader([
    grant("commissions.read"),
    grant("sales.read"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  const own = await finance.request(`/api/employees/sales/A?${range}&search=COM-A`);
  expect(own.body.data[0].utilidad).toBe("60.00");
  const other = await finance.request(`/api/employees/sales/B?${range}`);
  expect(other.body.data[0]).not.toHaveProperty("utilidad");
  expect(other.body.data[0].commissionTotal).toBe(800);
});

test("buscar y paginar nunca incluyen otro vendedor ni cambian el conteo filtrado", async () => {
  const client = await reader([grant("commissions.read"), grant("sales.read", "assigned")]);
  const first = await client.request(`/api/employees/sales/A?${range}&limit=1&sortBy=invoiceId&sortDir=asc`);
  expect(first.body.pagination).toEqual({ total: 5, page: 1, limit: 1 });
  const second = await client.request(`/api/employees/sales/A?${range}&limit=1&page=2&sortBy=invoiceId&sortDir=asc`);
  expect(second.body.data[0].invoiceId).not.toBe(first.body.data[0].invoiceId);
  const missing = await client.request(`/api/employees/sales/A?${range}&search=COM-B`);
  expect(missing.body.pagination.total).toBe(0);
  expect((await client.request(`/api/employees/sales/B?${range}`)).status).toBe(403);
});

test("colación insensible no mezcla vendedor ni captura histórica de otra factura", async () => {
  await environment.db.raw(
    "ALTER TABLE vendedor_comisiones MODIFY vendedorId VARCHAR(8) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment.db.raw(
    "ALTER TABLE fact_vendedor_comisiones MODIFY masterfactId VARCHAR(12) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment.db("vendedor_comisiones").insert({ vendedorId: "a", grupoId: "G", comision: 99 });
  await environment.db("fact_vendedor_comisiones").insert({ masterfactId: "com-a", grupoId: "G", comision: 99 });
  const client = await reader([grant("commissions.read", "assigned"), grant("sales.read")]);
  expect(
    Number(
      (await client.request("/api/employees/commissionInfo/A")).body.find((row) => row.groupId === "G").commission,
    ),
  ).toBe(10);
  const result = await client.request(`/api/employees/sales/A?${range}&search=COM-A`);
  expect(result.status).toBe(200);
  expect(result.body.data[0].commissionTotal).toBe(10);
});

test("validaciones de parámetros y edición permanecen cerradas sin DDL automático", async () => {
  const client = await reader([grant("commissions.read"), grant("sales.read")]);
  for (const suffix of ["limit=101", "page=0", "sortBy=rif", "export=true", "employeeId=B"])
    expect((await client.request(`/api/employees/sales/A?${range}&${suffix}`)).status).toBe(400);
  expect((await client.request("/api/employees/commissionInfo/A?showNoe=true")).status).toBe(400);
  expect(
    (await client.request("/api/employees/commissionInfo/A", { method: "PUT", body: { commissionInfo: { G: 99 } } }))
      .status,
  ).toBe(403);
  expect(
    Number((await environment.db("vendedor_comisiones").where({ vendedorId: "A", grupoId: "G" }).first()).comision),
  ).toBe(10);
  await environment.db.schema.dropTable("fact_vendedor_comisiones");
  expect((await client.request(`/api/employees/sales/A?${range}`)).status).toBe(503);
  expect(await environment.db.schema.hasTable("fact_vendedor_comisiones")).toBe(false);
});
