const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedParties } = require("../../../tests/support/party-fixtures.cjs");
let environment;
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
const period = "from=2026-02-01&to=2026-02-28";

test("no infiere acceso a clientes desde ventas ni actividad desde el catálogo", async () => {
  for (const permissions of [[grant("sales.read")], [grant("clients.read")], [grant("access.users")]]) {
    const client = await reader(permissions);
    expect((await client.request(`/api/clients/sin-facturar?${period}`)).status).toBe(403);
  }
  const empty = await reader([grant("clients.read"), grant("sales.read", "assigned")], []);
  expect((await empty.request(`/api/clients/sin-facturar?${period}`)).status).toBe(403);
});

test.each(["false", "true"])(
  "histórico y última fecha sólo usan ventas propias hasta el corte showNoe=%s",
  async (showNoe) => {
    const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
    const result = await client.request(`/api/clients/sin-facturar?${period}&showNoe=${showNoe}&limit=1`);
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(3);
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0]).toMatchObject({
      IdCliente: "C",
      revenue_historico: showNoe === "true" ? "210.00" : "110.00",
      dias_inactivo: showNoe === "true" ? 57 : 58,
    });
    expect(JSON.stringify(result.body)).not.toMatch(/rif|PRIVATE|profit|utilidad|phone/i);
    const later = await client.request(`/api/clients/sin-facturar?${period}&showNoe=${showNoe}&page=2&limit=1`);
    expect(later.body.total).toBe(3);
    expect(later.body.data[0]).toMatchObject({
      IdCliente: "CB",
      last_factura: null,
      dias_inactivo: null,
      revenue_historico: "0.00",
    });
    const before = await client.request(`/api/clients/sin-facturar?from=2025-11-01&to=2025-11-30&showNoe=${showNoe}`);
    expect(before.body.data.every((row) => row.last_factura === null && Number(row.revenue_historico) === 0)).toBe(
      true,
    );
  },
);

test.each(["false", "true"])(
  "exclusión no observa documentos ajenos de clientes compartidos showNoe=%s",
  async (showNoe) => {
    const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
    const result = await client.request(`/api/clients/sin-facturar?from=2026-01-02&to=2026-01-05&showNoe=${showNoe}`);
    expect(result.status).toBe(200);
    expect(result.body.data.some((row) => row.IdCliente === "C")).toBe(showNoe !== "true");
    expect(result.body.data.find((row) => row.IdCliente === "CB")).toMatchObject({
      last_factura: null,
      revenue_historico: "0.00",
    });
    const global = await reader([grant("clients.read"), grant("sales.read")]);
    const all = await global.request(`/api/clients/sin-facturar?from=2026-01-02&to=2026-01-05&showNoe=${showNoe}`);
    expect(all.body.data.map((row) => row.IdCliente)).toEqual(["NEVER"]);
  },
);

test("filtros preceden conteo y paginación, ordenación no admite campos sensibles", async () => {
  const client = await reader([grant("clients.read"), grant("sales.read")]);
  const filtered = await client.request(`/api/clients/sin-facturar?${period}&search=exclusivo&ruta=R&limit=1`);
  expect(filtered.body.total).toBe(1);
  expect(filtered.body.data[0]).toMatchObject({ IdCliente: "CB", revenue_historico: "250.00", dias_inactivo: 54 });
  expect((await client.request(`/api/clients/sin-facturar?${period}&ruta=missing`)).body.total).toBe(0);
  expect(
    (await client.request(`/api/clients/sin-facturar?${period}&search=${encodeURIComponent("' OR 1=1 --")}`)).body
      .total,
  ).toBe(0);
  for (const suffix of [
    "&sortBy=utilidad",
    "&sortBy=rif",
    "&from=invalid",
    "&showNoe=1",
    "&limit=101",
    "&search=PRIVATE&phone=1",
  ])
    expect((await client.request(`/api/clients/sin-facturar?${period}${suffix}`)).status).toBe(400);
});

test("documentos sin líneas cuentan como actividad; anulados y futuros no", async () => {
  await environment.db("masterfact").insert([
    { IdFactura: "header-only", IdVend: "A", IdCliente: "C", Fecha: "2026-04-01", Anulada: false },
    { IdFactura: "void-only", IdVend: "A", IdCliente: "NEVER", Fecha: "2026-04-01", Anulada: true },
    { IdFactura: "future", IdVend: "A", IdCliente: "CB", Fecha: "2026-05-01", Anulada: false },
  ]);
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  const april = await client.request("/api/clients/sin-facturar?from=2026-04-01&to=2026-04-30");
  expect(april.body.data.map((row) => row.IdCliente)).toEqual(["CB", "NEVER"]);
  expect(april.body.data.every((row) => row.last_factura === null)).toBe(true);
  const may = await client.request("/api/clients/sin-facturar?from=2026-05-01&to=2026-05-31");
  expect(may.body.data.find((row) => row.IdCliente === "C").dias_inactivo).toBe(60);
});

test("collation insensible no amplía histórico ni excluye por vendedor ajeno", async () => {
  await environment.db.raw(
    "ALTER TABLE masterfact MODIFY IdVend VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment
    .db("masterfact")
    .insert({ IdFactura: "lowercase", IdVend: "a", IdCliente: "NEVER", Fecha: "2026-02-01", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "lowercase", IdProducto: "P", Precio: 999, Costo: 1, Cantidad: 1 });
  const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
  const result = await client.request(`/api/clients/sin-facturar?${period}`);
  expect(result.body.data.find((row) => row.IdCliente === "NEVER")).toMatchObject({
    last_factura: null,
    revenue_historico: "0.00",
  });
  const global = await reader([grant("clients.read"), grant("sales.read")]);
  const narrowed = await global.request(`/api/clients/sin-facturar?${period}&employeeId=A`);
  expect(narrowed.body.data.find((row) => row.IdCliente === "NEVER")).toMatchObject({
    last_factura: null,
    revenue_historico: "0.00",
  });
});
