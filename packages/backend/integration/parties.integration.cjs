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

test("directorios requieren capacidades explícitas, sin inferir clientes desde ventas propias", async () => {
  const client = await reader([grant("sales.read", "assigned")]);
  for (const url of [
    "/api/clients",
    "/api/employees",
    `/api/clients/list?${range}`,
    `/api/sellers/list?${range}`,
    `/api/clients/C/summary?${range}`,
  ])
    expect((await client.request(url)).status).toBe(403);
  const catalog = await reader([grant("clients.read")]);
  expect((await catalog.request("/api/clients")).body).toHaveLength(3);
  const rows = await catalog.request(`/api/clients/list?${range}`);
  expect(rows.status).toBe(200);
  expect(rows.body.data).toHaveLength(3);
  expect(rows.body.data.every((row) => Object.keys(row).sort().join(",") === "Empresa,IdCliente")).toBe(true);
  expect(rows.body.totals).toEqual({});
  expect((await catalog.request(`/api/clients/list?${range}&sortBy=utilidad`)).status).toBe(403);
});

test("búsqueda de clientes enlazada a parámetros no permite SQL ni datos personales", async () => {
  const client = await reader([grant("clients.read")]);
  const all = await client.request("/api/clients");
  expect(all.status).toBe(200);
  expect(all.body.every((row) => Object.keys(row).sort().join(",") === "IdCliente,name")).toBe(true);
  expect((await client.request(`/api/clients?filter=${encodeURIComponent("' OR 1=1 --")}`)).body).toEqual([]);
  expect((await client.request("/api/clients?search=PRIVATE-CLIENT-B")).body).toEqual([]);
  expect((await client.request("/api/clients?sortBy=rif")).status).toBe(403);
  const personal = await reader([grant("clients.read"), grant("clients.personal")]);
  const result = await personal.request("/api/clients?filter=exclusivo&sortBy=rif");
  expect(result.status).toBe(200);
  expect(result.body[0].rif).toBe("PRIVATE-CLIENT-B");
});

test("vendedores propios y datos personales propios no se convierten en directorio global", async () => {
  const own = await reader([grant("sellers.read", "assigned")]);
  const catalog = await own.request("/api/employees");
  expect(catalog.body).toEqual([{ id: "A", name: "Vendedor A" }]);
  expect((await own.request("/api/employees?search=B")).body).toEqual([]);
  const combined = await reader([grant("sellers.read"), grant("sellers.personal", "assigned")]);
  const result = await combined.request("/api/employees");
  expect(result.status).toBe(200);
  expect(result.body.find((row) => row.id === "A").phone).toBe("PRIVATE-PHONE-A");
  expect(result.body.find((row) => row.id === "B")).not.toHaveProperty("phone");
  expect(JSON.stringify(result.body)).not.toContain("PRIVATE-PHONE-B");
  expect((await combined.request("/api/employees?sortBy=phone")).status).toBe(403);
  expect((await combined.request("/api/employees?search=PRIVATE-PHONE-B")).body).toEqual([]);
});

test.each(["false", "true"])(
  "estadísticas de clientes compartidos solo suman ventas autorizadas showNoe=%s",
  async (showNoe) => {
    const client = await reader([grant("clients.read"), grant("sales.read", "assigned")]);
    const amount = showNoe === "true" ? 200 : 100;
    const result = await client.request(`/api/clients/list?${range}&showNoe=${showNoe}&limit=1&sortBy=total_ventas`);
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(3);
    expect(result.body.data[0].IdCliente).toBe("C");
    expect(Number(result.body.totals.total_ventas)).toBe(amount);
    expect(JSON.stringify(result.body)).not.toMatch(/utilidad|PRIVATE-/);
    const summary = await client.request(`/api/clients/C/summary?${range}&showNoe=${showNoe}`);
    expect(summary.body).toMatchObject({ totalAmount: amount, totalCount: 1, avgTicket: amount });
    const exclusive = await client.request(`/api/clients/CB/sales?${range}&showNoe=${showNoe}`);
    expect(exclusive.body.total).toBe(0);
    expect(exclusive.body.data).toEqual([]);
    const best = await client.request(`/api/clients/best?${range}&showNoe=${showNoe}`);
    expect(best.body).toHaveLength(1);
    expect(Number(best.body[0].total_USD)).toBe(amount);
  },
);

test.each(["false", "true"])("ventas globales se intersectan con vendedores propios showNoe=%s", async (showNoe) => {
  const client = await reader([
    grant("sellers.read", "assigned"),
    grant("sales.read"),
    grant("sales.financial", "assigned"),
  ]);
  const amount = showNoe === "true" ? 200 : 100;
  const result = await client.request(`/api/sellers/list?${range}&showNoe=${showNoe}`);
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(1);
  expect(result.body.data[0].sellerId).toBe("A");
  expect(Number(result.body.totals.sales)).toBe(amount);
  expect(result.body.data[0]).not.toHaveProperty("phone");
  expect((await client.request(`/api/sellers/B/sales?${range}&showNoe=${showNoe}`)).status).toBe(403);
  expect((await client.request(`/api/sellers/B/summary?${range}&showNoe=${showNoe}`)).status).toBe(403);
  const own = await client.request(`/api/sellers/A/summary?${range}&showNoe=${showNoe}`);
  expect(own.status).toBe(200);
  expect(own.body.totals.sales).toBe(amount);
  expect(own.body.compare.sales).toBe(10);
  expect(own.body.seller).not.toHaveProperty("rif");
});

test("utilidad propia nunca ordena ni expone métricas del directorio global", async () => {
  const client = await reader([grant("sellers.read"), grant("sales.read"), grant("sales.financial", "assigned")]);
  const result = await client.request(`/api/sellers/list?${range}`);
  expect(result.status).toBe(200);
  expect(Number(result.body.totals.sales)).toBe(550);
  expect(JSON.stringify(result.body)).not.toMatch(/profit|marginPercent/);
  expect((await client.request(`/api/sellers/list?${range}&sortBy=profit`)).status).toBe(403);
  const disjoint = await reader([grant("sellers.read", "assigned"), grant("sales.read", "assigned")], []);
  expect((await disjoint.request(`/api/sellers/list?${range}`)).status).toBe(403);
});

test("orden por utilidad de clientes exige cobertura completa, filtrado de nombres precede conteo", async () => {
  const client = await reader([grant("clients.read"), grant("sales.read")]);
  expect((await client.request(`/api/clients/list?${range}&sortBy=utilidad`)).status).toBe(403);
  const filtered = await client.request(`/api/clients/list?${range}&search=exclusivo&limit=1`);
  expect(filtered.status).toBe(200);
  expect(filtered.body.total).toBe(1);
  expect(filtered.body.data[0].IdCliente).toBe("CB");
  expect(Number(filtered.body.totals.total_ventas)).toBe(250);
  for (const suffix of ["&limit=5000", "&from=invalid", "&phone=PRIVATE", "&sortBy=Rif"])
    expect((await client.request(`/api/clients/list?${range}${suffix}`)).status).toBe(400);
});

test("filtro de vendedor también limita el catálogo y no inventa utilidad para otros", async () => {
  const client = await reader([grant("sellers.read"), grant("sales.read"), grant("sales.financial", "assigned")]);
  const result = await client.request(`/api/sellers/list?${range}&employeeId=A&sortBy=profit`);
  expect(result.status).toBe(200);
  expect(result.body.total).toBe(1);
  expect(result.body.data[0].sellerId).toBe("A");
  expect(Number(result.body.data[0].profit)).toBe(39);
});

test.each(["false", "true"])(
  "histórico sin catálogo no se pierde ni concede acceso restringido showNoe=%s",
  async (showNoe) => {
    const [master, slave, key] =
      showNoe === "true" ? ["masternoe", "slavenoe", "IdNoe"] : ["masterfact", "slavefact", "IdFactura"];
    await environment
      .db(master)
      .insert({ [key]: "missing-party", IdVend: null, IdCliente: null, Fecha: "2026-03-01", Anulada: false });
    await environment.db(slave).insert({ [key]: "missing-party", IdProducto: "P", Precio: 30, Costo: 11, Cantidad: 1 });
    const period = `from=2026-03-01&to=2026-03-31&showNoe=${showNoe}`;
    const client = await reader([grant("clients.read"), grant("sellers.read"), grant("sales.read")]);
    const customers = await client.request(`/api/clients/list?${period}`);
    expect(customers.status).toBe(200);
    expect(customers.body.data.find((row) => row.IdCliente === "__none__").total_ventas).toBe("30.00");
    expect(Number(customers.body.totals.total_ventas)).toBe(30);
    const summary = await client.request(`/api/clients/__none__/summary?${period}`);
    expect(summary.body.totalAmount).toBe(30);
    const sellers = await client.request(`/api/sellers/list?${period}`);
    expect(sellers.body.data.find((row) => row.sellerId === "__none__").sales).toBe("30.00");
    const seller = await client.request(`/api/sellers/__none__/summary?${period}`);
    expect(seller.status).toBe(200);
    expect(seller.body.totals.sales).toBe(30);
    const restricted = await reader([grant("sellers.read", "assigned"), grant("sales.read", "assigned")]);
    expect((await restricted.request(`/api/sellers/__none__/summary?${period}`)).status).toBe(403);
  },
);

test("collation compartida insensible no amplía vendedor ni datos financieros propios", async () => {
  await environment.db.raw(
    "ALTER TABLE masterfact MODIFY IdVend VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment.db("vendedores").insert({
    idVend: "a",
    Empresa: "Otro vendedor con minúscula",
    Rif: "PRIVATE-LOWERCASE",
    Ci: "PRIVATE-LOWERCASE",
    Telfs: "PRIVATE-LOWERCASE",
    Email: "PRIVATE-LOWERCASE",
  });
  await environment
    .db("masterfact")
    .insert({ IdFactura: "lowercase-seller", IdVend: "a", IdCliente: "C", Fecha: "2026-01-01", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "lowercase-seller", IdProducto: "P", Precio: 999, Costo: 1, Cantidad: 1 });
  const restricted = await reader([grant("sellers.read", "assigned"), grant("sales.read", "assigned")]);
  expect((await restricted.request(`/api/sellers/list?${range}`)).body.data.map((row) => row.sellerId)).toEqual(["A"]);
  expect((await restricted.request(`/api/sales/facturas?${range}`)).body.totals.monto).toBe("100.00");
  const global = await reader([grant("sales.read"), grant("sales.financial", "assigned")]);
  const own = await global.request(`/api/sales/productos?${range}&employeeId=A`);
  expect(Number(own.body.totals.rawProfit)).toBe(100);
  expect(Number(own.body.totals.netProfit)).toBe(39);
});

test("directorios analíticos no fusionan identidades históricas por la colación de MySQL", async () => {
  await environment
    .db("masterfact")
    .insert({ IdFactura: "lower-party", IdVend: "a", IdCliente: "c", Fecha: "2026-04-01", Anulada: false });
  await environment.db("slavefact").insert({
    IdFactura: "lower-party",
    IdProducto: "P",
    Descripcion: "Caso histórico",
    Precio: 5,
    Costo: 2,
    Cantidad: 1,
  });
  try {
    const all = await reader([
      grant("sellers.read"),
      grant("clients.read"),
      grant("sales.read"),
      grant("sellers.personal", "assigned"),
    ]);
    const sellers = await all.request("/api/sellers/list?from=2026-04-01&to=2026-04-30");
    expect(sellers.status).toBe(200);
    expect(Number(sellers.body.data.find((row) => row.sellerId === "A").sales)).toBe(0);
    expect(Number(sellers.body.data.find((row) => row.sellerId === "a").sales)).toBe(5);
    expect(sellers.body.data.find((row) => row.sellerId === "a")).not.toHaveProperty("phone");
    const clients = await all.request("/api/clients/list?from=2026-04-01&to=2026-04-30");
    expect(clients.status).toBe(200);
    expect(Number(clients.body.data.find((row) => row.IdCliente === "C").total_ventas)).toBe(0);
    expect(Number(clients.body.data.find((row) => row.IdCliente === "c").total_ventas)).toBe(5);
  } finally {
    await environment.db("slavefact").where("IdFactura", "lower-party").del();
    await environment.db("masterfact").where("IdFactura", "lower-party").del();
  }
});
