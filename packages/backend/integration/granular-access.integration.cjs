const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedParties } = require("../../../tests/support/party-fixtures.cjs");
const { seedInventory } = require("../../../tests/support/inventory-fixtures.cjs");
let environment;
beforeEach(async () => {
  await environment.db("dmmarket_auth_commercial_profiles").delete();
});
const grant = (capability, scope = "global") => ({ capability, scope });
async function actor(permissions, linked = true) {
  const user = await environment.seedUser({ permissions });
  if (linked && permissions.some((grant) => grant.scope === "assigned"))
    await environment.db("dmmarket_auth_commercial_profiles").where("seller_id", "A").delete();
  if (linked && permissions.some((grant) => grant.scope === "assigned"))
    await environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: user.id, seller_id: "A" });
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedParties(environment.db);
  await seedInventory(environment.db);
});
afterAll(async () => environment?.close());
const range = "from=2026-01-01&to=2026-01-31&showNoe=false";

test("despacho consulta productos sin abrir dashboard ni desglose y sin importes", async () => {
  const client = await actor([grant("sales.dispatch.read")]);
  const response = await client.request(`/api/invoices?${range}`);
  expect(response.status).toBe(200);
  expect(response.body.data.length).toBeGreaterThan(0);
  expect(response.body.data[0]).not.toHaveProperty("total");
  expect(response.body.data[0].products[0]).not.toHaveProperty("price");
  expect(response.body.data[0].products[0]).not.toHaveProperty("cost");
  for (const endpoint of [
    "/api/dashboard/sales",
    "/api/sales/facturas",
    "/api/sales/productos",
    "/api/dashboard/pareto",
  ])
    expect((await client.request(`${endpoint}?${range}`)).status).toBe(403);
  expect((await client.request(`/api/invoices?${range}&sortBy=total`)).status).toBe(403);
});

test("los grupos de información son específicos del submódulo y se aplican en exportaciones", async () => {
  const client = await actor([
    grant("sales.dispatch.read"),
    grant("sales.dispatch.export"),
    grant("sales.breakdown.read"),
    grant("sales.breakdown.amounts"),
    grant("sales.breakdown.financial"),
  ]);
  const dispatch = await client.request(`/api/invoices?${range}`);
  expect(dispatch.body.data[0]).not.toHaveProperty("total");
  const breakdown = await client.request(`/api/sales/facturas?${range}`);
  expect(breakdown.body.totals).toHaveProperty("monto");
  expect(breakdown.body.totals).toHaveProperty("utilidad");
  const exported = await client.request("/api/exports/sales/dispatch", {
    method: "POST",
    body: { invoiceIds: ["1"], showNoe: false },
  });
  expect(exported.status).toBe(200);
  expect(exported.body.invoices[0]).not.toHaveProperty("total");
  expect(exported.body.products[0]).not.toHaveProperty("price");
  expect(exported.body.products[0]).not.toHaveProperty("total");
  expect((await client.request(`/api/exports/sales?${range}`)).status).toBe(200);
});

test("los alcances de lectura e información se intersectan sin ampliar documentos", async () => {
  const client = await actor([
    grant("sales.dispatch.read", "assigned"),
    grant("sales.dispatch.amounts"),
    grant("sales.dispatch.export"),
  ]);
  const result = await client.request(`/api/invoices?${range}`);
  expect(result.status).toBe(200);
  expect(result.body.data.every((row) => row.invoiceId === "1")).toBe(true);
  expect(result.body.data[0]).toHaveProperty("total");
  const denied = await client.request("/api/exports/sales/dispatch", {
    method: "POST",
    body: { invoiceIds: ["2"], showNoe: false },
  });
  expect(denied.status).toBe(404);
});

test("los módulos de clientes, vendedores e inventario no necesitan acceso a Ventas", async () => {
  for (const [resource, endpoint] of [
    ["clients.directory", `/api/clients/list?${range}`],
    ["sellers.directory", `/api/sellers/list?${range}`],
    ["inventory.stock", "/api/products"],
  ]) {
    const client = await actor([grant(`${resource}.read`)]);
    const result = await client.request(endpoint);
    expect(result.status).toBe(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    for (const row of result.body.data) {
      for (const key of resource === "inventory.stock" ? ["PrecioA", "inventoryValue"] : ["profit", "utilidad"])
        expect(row).not.toHaveProperty(key);
    }
    expect((await client.request(`/api/dashboard/sales?${range}`)).status).toBe(403);
  }
});

test("una pestaña de detalle no hereda acceso de su directorio", async () => {
  const client = await actor([grant("clients.directory.read")]);
  expect((await client.request(`/api/clients/list?${range}`)).status).toBe(200);
  expect((await client.request(`/api/clients/C/summary?${range}`)).status).toBe(403);
  expect((await client.request(`/api/clients/C/sales?${range}`)).status).toBe(403);
});

test("información y acciones aisladas no conceden entrada a un submódulo", async () => {
  const client = await actor([grant("sales.dispatch.amounts"), grant("sales.dispatch.export")]);
  expect((await client.request(`/api/invoices?${range}`)).status).toBe(403);
});

test("un encabezado de contexto no abre submódulos ajenos ni cambia la autorización de un endpoint fijo", async () => {
  const client = await actor([grant("sales.dispatch.read"), grant("sales.dispatch.amounts")]);
  expect(
    (await client.request(`/api/dashboard/sales?${range}`, { headers: { "X-Access-Resource": "sales.dispatch" } }))
      .status,
  ).toBe(403);
  expect(
    (
      await client.request(`/api/invoices/1/detail?showNoe=false`, {
        headers: { "X-Access-Resource": "sales.dispatch" },
      })
    ).status,
  ).toBe(403);
});

test("todos los submódulos tienen límites independientes incluso compartiendo tablas comerciales", async () => {
  const client = await actor([grant("inventory.stock.read")]);
  for (const endpoint of [
    `/api/purchases/dashboard?${range}`,
    `/api/purchases/invoices?${range}`,
    `/api/clients/dashboard?${range}`,
    `/api/clients/sin-facturar?${range}`,
    `/api/clients/C/sales?${range}`,
    `/api/sellers/dashboard?${range}`,
    `/api/sellers/A/summary?${range}`,
    `/api/sellers/A/sales?${range}`,
    `/api/providers/list?${range}`,
    `/api/providers/PROV/summary?${range}`,
    `/api/providers/PROV/purchases?${range}`,
    `/api/providers/PROV/sales?${range}`,
    `/api/providers/PROV/products?${range}`,
    `/api/providers/PROV/clients?${range}`,
    `/api/providers/PROV/sellers?${range}`,
    "/api/receivables",
    "/api/employees/commissionInfo/A",
    "/api/preferences",
    "/api/backups",
    "/api/audit",
  ])
    expect((await client.request(endpoint)).status).toBe(403);
});

test("el catálogo entrega la jerarquía completa y rechaza nombres del catálogo anterior", async () => {
  const client = await actor([grant("access.roles.read"), grant("access.roles.create")]);
  const response = await client.request("/api/auth/roles/catalog");
  expect(response.status).toBe(200);
  for (const capability of response.body.data) {
    expect(capability).toHaveProperty("module");
    expect(capability).toHaveProperty("resource");
    expect(["access", "information", "action"]).toContain(capability.kind);
    expect(capability.capability.split(".")).toHaveLength(3);
  }
  expect(response.body.data.some((item) => item.capability === "sales.read")).toBe(false);
  expect(
    (
      await client.request("/api/auth/roles", {
        method: "POST",
        body: { name: "No compatible", permissions: [grant("sales.read")] },
      })
    ).status,
  ).toBe(400);
});

test("la migración confirmada conserva los roles y perfiles actuales al repetirse", async () => {
  const user = await environment.seedUser({ permissions: [grant("sales.dispatch.read")] });
  const rolesBefore = await environment.db("dmmarket_auth_roles").orderBy("id");
  const grantsBefore = await environment.db("dmmarket_auth_role_capabilities").orderBy("role_id").orderBy("capability");
  const usersBefore = await environment.db("dmmarket_auth_users").orderBy("id");
  const invoicesBefore = await environment.db("masterfact").orderBy("IdFactura");
  await require("../migrations/20261105_individual_commercial_identity").up(environment.db);
  expect(await environment.db("dmmarket_auth_roles").orderBy("id")).toEqual(rolesBefore);
  expect(await environment.db("dmmarket_auth_role_capabilities").orderBy("role_id").orderBy("capability")).toEqual(
    grantsBefore,
  );
  expect(await environment.db("dmmarket_auth_users").orderBy("id")).toEqual(usersBefore);
  expect(await environment.db("masterfact").orderBy("IdFactura")).toEqual(invoicesBefore);
  expect(await environment.db("dmmarket_auth_user_roles").where("user_id", user.id)).toHaveLength(1);
});

test("clientes vinculados no incluyen identidades ni RIF de clientes ajenos", async () => {
  const client = await actor([
    grant("clients.directory.read", "assigned"),
    grant("clients.directory.amounts", "assigned"),
    grant("clients.directory.personal", "assigned"),
  ]);
  for (const [endpoint, headers] of [
    [`/api/clients/list?${range}`, {}],
    ["/api/clients", { "X-Access-Resource": "clients.directory" }],
  ]) {
    const response = await client.request(endpoint, { headers });
    expect(response.status).toBe(200);
    const rows = response.body.data || response.body;
    expect(rows.map((row) => row.IdCliente)).toEqual(["C"]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /PRIVATE-CLIENT-B|PRIVATE-CLIENT-N|Cliente exclusivo de B|Cliente sin ventas/,
    );
  }
});

test("consulta global de clientes incluye la identificación de los registros autorizados", async () => {
  const client = await actor([grant("clients.directory.read"), grant("clients.directory.personal")]);
  const response = await client.request(`/api/clients/list?${range}`);
  expect(response.status).toBe(200);
  expect(response.body.data.find((row) => row.IdCliente === "C")).toHaveProperty("rif", "PRIVATE-IDENTIFICATION");
  for (const id of ["CB", "NEVER"])
    expect(response.body.data.find((row) => row.IdCliente === id)).toHaveProperty("rif");
});

test("los filtros de rutas tampoco cuentan clientes ajenos al alcance", async () => {
  const client = await actor([grant("clients.directory.read", "assigned")]);
  const response = await client.request("/api/clients/routes");
  expect(response.status).toBe(200);
  expect(response.body).toHaveLength(1);
  expect(Number(response.body[0].clientes)).toBe(1);
});

test("Inventario no obtiene clientes o vendedores prestando su contexto", async () => {
  const client = await actor([grant("inventory.stock.read")]);
  const headers = { "X-Access-Resource": "inventory.stock" };
  for (const endpoint of ["/api/clients", "/api/clients/routes", "/api/employees"])
    expect((await client.request(endpoint, { headers })).status).toBe(403);
  expect((await client.request("/api/groups", { headers })).status).toBe(200);
});

test("el filtro contextual de clientes no entrega identificación personal aunque la vista permita verla en documentos", async () => {
  const client = await actor([grant("sales.breakdown.read"), grant("sales.breakdown.personal")]);
  const headers = { "X-Access-Resource": "sales.breakdown" };
  const lookup = await client.request("/api/clients", { headers });
  expect(lookup.status).toBe(200);
  expect(lookup.body.every((row) => Object.keys(row).sort().join(",") === "IdCliente,name")).toBe(true);
  expect((await client.request("/api/clients?sortBy=rif", { headers })).status).toBe(403);
  expect((await client.request("/api/invoices/1/detail?showNoe=false")).body).toHaveProperty("rif");
});
