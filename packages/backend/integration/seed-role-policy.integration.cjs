const { startEnvironment, backend } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedReceivables } = require("../../../tests/support/receivables-fixtures.cjs");
const { seedInventory } = require("../../../tests/support/inventory-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
const { seed } = backend("./seeds/001_default_roles");
const { createAccess, CAPABILITIES } = backend("./auth/capabilities");
let environment;
const range = "from=2026-01-01&to=2026-01-31&showNoe=false";

beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedReceivables(environment.db);
  await seedInventory(environment.db);
  await seedPurchases(environment.db);
  await seed(environment.db);
});
afterAll(async () => environment?.close());
beforeEach(async () => environment.db("dmmarket_auth_commercial_profiles").delete());

async function role(name) {
  const row = await environment.db("dmmarket_auth_roles").where("name", name).first();
  expect(row).toBeTruthy();
  const grants = await environment.db("dmmarket_auth_role_capabilities").where("role_id", row.id).select("capability");
  return { ...row, grants };
}

async function actor(names, sellerId = null) {
  const user = await environment.seedUser({ permissions: [] });
  for (const name of names)
    await environment.db("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: (await role(name)).id });
  if (sellerId)
    await environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: user.id, seller_id: sellerId });
  const client = environment.client();
  expect((await client.login(user)).body.stage).toBe("ready");
  return { user, client };
}

function expectPrivate(value) {
  if (!value || typeof value !== "object") return;
  const forbidden = [
    "rif",
    "Rif",
    "ci",
    "phone",
    "email",
    "address",
    "Telfs",
    "Email",
    "costo",
    "cost",
    "utilidad",
    "profit",
    "netProfit",
    "margin",
    "inventoryValue",
    "inventoryTotal",
    "newProductsInventoryTotal",
    "commission",
    "commissionTotal",
  ];
  for (const [key, child] of Object.entries(value)) {
    expect(forbidden).not.toContain(key);
    expectPrivate(child);
  }
  expect(JSON.stringify(value)).not.toContain("PRIVATE-");
}

test("los siete roles expresan responsabilidades y Administrador excluye solo herramientas técnicas", async () => {
  expect((await environment.db("dmmarket_auth_roles")).map((row) => row.name).sort()).toEqual(
    [
      "Superusuario",
      "Administrador",
      "Consultor",
      "Cobranza",
      "Vendedor",
      "Anulación de abonos",
      "Cierre de deudas",
    ].sort(),
  );
  const admin = createAccess((await role("Administrador")).grants);
  for (const capability of [
    "audit.events.read",
    "access.recovery.execute",
    "sellers.commissions.update",
    "clients.receivables.reopen",
    "clients.receivables.close",
    "clients.receivables.void",
    "sales.dashboard.financial",
    "settings.currency.update",
  ])
    expect(admin.hasGlobal(capability)).toBe(true);
  for (const capability of [
    "settings.backups.read",
    "settings.backups.create",
    "settings.updates.read",
    "settings.updates.execute",
    "settings.cache.read",
    "settings.cache.clear",
    "settings.rates.sync",
  ])
    expect(admin.hasGlobal(capability)).toBe(false);
  const superuser = createAccess((await role("Superusuario")).grants);
  for (const capability of Object.keys(CAPABILITIES)) expect(superuser.hasGlobal(capability)).toBe(true);
});

test("Consultor consulta todo el negocio sin operaciones, datos sensibles ni administración", async () => {
  const { client } = await actor(["Consultor"]);
  const access = createAccess((await role("Consultor")).grants);
  for (const capability of [
    "sales.dashboard.read",
    "sales.breakdown.read",
    "purchases.dashboard.read",
    "purchases.breakdown.read",
    "clients.dashboard.read",
    "clients.directory.read",
    "clients.receivables.read",
    "sellers.directory.read",
    "providers.directory.read",
    "inventory.stock.read",
    "settings.rates.read",
  ])
    expect(access.hasGlobal(capability)).toBe(true);
  for (const capability of [
    "clients.receivables.payment",
    "clients.receivables.void",
    "clients.receivables.close",
    "clients.receivables.reopen",
    "sales.breakdown.personal",
    "clients.receivables.personal",
    "sales.breakdown.financial",
    "inventory.stock.amounts",
    "sellers.commissions.read",
    "access.roles.read",
    "audit.events.read",
  ])
    expect(access.hasGlobal(capability)).toBe(false);
  for (const url of [
    `/api/sales/facturas?${range}`,
    "/api/invoices/1/detail?showNoe=false",
    "/api/receivables/C",
    "/api/products",
  ]) {
    const result = await client.request(url);
    expect(result.status).toBe(200);
    expectPrivate(result.body);
  }
  for (const mode of ["ventas", "compras-sin-vender"]) {
    const query = `from=2026-08-01&to=2026-08-31&modo=${mode}`;
    const pareto = await client.request(`/api/dashboard/pareto?${query}`);
    expect(pareto.status).toBe(200);
    expectPrivate(pareto.body);
    expect((await client.request(`/api/dashboard/pareto?${query}&sortBy=inventoryValue`)).status).toBe(403);
  }
  const purchases = await client.request("/api/purchases/dashboard?from=2026-08-01&to=2026-08-31");
  expect(purchases.status).toBe(200);
  expectPrivate(purchases.body);
  const exported = await client.request("/api/exports/inventory");
  expect(exported.status).toBe(200);
  expectPrivate(exported.body.data);
  expect((await client.request("/api/auth/directory")).status).toBe(403);
  expect((await client.request("/api/employees/commissionInfo/A")).status).toBe(403);
});

test("Cobranza consulta la cartera completa, tasas y sus facturas sin conceder consultas comerciales", async () => {
  const { client } = await actor(["Cobranza"]);
  const detail = await client.request("/api/receivables/C");
  expect(detail.status).toBe(200);
  expect(detail.body.summary.balance).toBe("300.0000");
  expect(Number(detail.body.rate)).toBe(42.125);
  expectPrivate({ ...detail.body, rate: undefined });
  expect(detail.body.documents.data.every((row) => row.canReadSale)).toBe(true);
  for (const id of ["1", "2"]) {
    const invoice = await client.request(`/api/receivables/C/invoices/${id}`);
    expect(invoice.status).toBe(200);
    expect(invoice.body.idFactura).toBe(id);
    expect(invoice.body.productos.length).toBeGreaterThan(0);
    expectPrivate(invoice.body);
  }
  expect((await client.request("/api/receivables/C/invoices/previous-A")).status).toBe(404);
  expect((await client.request("/api/receivables/CXC-C2/invoices/1")).status).toBe(404);
  expect((await client.request(`/api/sales/facturas?${range}`)).status).toBe(403);
  expect(
    (
      await client.request("/api/invoices/1/detail?showNoe=false", {
        headers: { "X-Access-Resource": "clients.documents" },
      })
    ).status,
  ).toBe(403);
});

test("Vendedor más Cobranza mantiene ventas propias y abre solo facturas respaldadas por cartera", async () => {
  const { client } = await actor(["Vendedor", "Cobranza"], "A");
  const own = await client.request(`/api/sales/facturas?${range}`);
  expect(own.status).toBe(200);
  expect(own.body.data.map((row) => String(row.idFactura || row.invoiceId || row.id))).toEqual(["1"]);
  expect((await client.request(`/api/sales/facturas?${range}&employeeId=B`)).body.data).toHaveLength(0);
  const debt = await client.request("/api/receivables/C");
  expect(debt.body.documents.data.map((row) => row.sale)).toEqual(["1", "2"]);
  expect((await client.request("/api/receivables/C/invoices/2")).status).toBe(200);
  expect(
    (
      await client.request("/api/invoices/2/detail?showNoe=false", {
        headers: { "X-Access-Resource": "clients.documents" },
      })
    ).status,
  ).toBe(404);
  const session = await client.request("/api/auth/session");
  expect(session.body.permissions.some((grant) => grant.capability === "sales.others.read")).toBe(false);
});

test.each([
  ["Cobranza", "payment"],
  ["Anulación de abonos", "void"],
  ["Cierre de deudas", "close"],
])("%s tiene solo su operación de cobranza, nunca reapertura ni datos personales", async (name, permitted) => {
  const { client } = await actor([name]);
  const access = createAccess((await role(name)).grants);
  for (const action of ["payment", "void", "close", "reopen"]) {
    expect(access.hasGlobal(`clients.receivables.${action}`)).toBe(action === permitted);
    if (action !== permitted)
      expect(
        (
          await client.request("/api/receivables/C/preview", {
            method: "POST",
            body: { type: action, id: "1", reason: "Validación del rol mínimo" },
          })
        ).status,
      ).toBe(403);
  }
  expect(access.hasGlobal("clients.receivables.personal")).toBe(false);
  expect(access.hasGlobal("sales.others.read")).toBe(false);
  expect((await client.request("/api/receivables/C")).status).toBe(200);
});
