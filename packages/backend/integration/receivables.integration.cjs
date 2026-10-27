const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedReceivables } = require("../../../tests/support/receivables-fixtures.cjs");
let environment;
const grant = (capability, scope = "global") => ({ capability, scope });
async function reader(permissions, linked = true) {
  const user = await environment.seedUser({ permissions });
  if (linked) await environment.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedReceivables(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("vendedor, administrador de acceso o permiso de operación no conceden lectura de cartera", async () => {
  for (const permissions of [
    [grant("sales.read", "assigned")],
    [grant("sales.read")],
    [grant("clients.read")],
    [grant("access.users")],
    [grant("receivables.payment")],
  ]) {
    const client = await reader(permissions);
    for (const path of ["", "/status", "/banks", "/C"])
      expect((await client.request(`/api/receivables${path}`)).status).toBe(403);
  }
});

test("cobranza global incluye deuda completa del cliente compartido sin heredar filtro de ventas", async () => {
  const client = await reader([grant("receivables.read"), grant("sales.read", "assigned")]);
  const result = await client.request("/api/receivables?limit=1");
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    total: 3,
    page: 1,
    limit: 1,
    summary: { balance: "400.0000", overdue: "400.0000", debtors: 3 },
  });
  const detail = await client.request("/api/receivables/C");
  expect(detail.status).toBe(200);
  expect(detail.body.summary.balance).toBe("300.0000");
  expect(detail.body.documents.data.map((row) => row.sale)).toEqual(["1", "2"]);
  expect(detail.body.client).not.toHaveProperty("rif");
  expect(detail.body).not.toHaveProperty("rate");
});

test("cartera no consulta identificación personal ni tasa sin sus permisos", async () => {
  const client = await reader([grant("receivables.read")]);
  expect((await client.request("/api/receivables?search=PRIVATE-CXC-RIF")).body.total).toBe(0);
  const allowed = await reader([grant("receivables.read"), grant("clients.personal"), grant("rates.read")]);
  const detail = await allowed.request("/api/receivables/CXC-C2");
  expect(detail.status).toBe(200);
  expect(detail.body.client.rif).toBe("PRIVATE-CXC-RIF");
  expect(Number(detail.body.rate)).toBe(42.125);
  expect((await allowed.request("/api/receivables?search=PRIVATE-CXC-RIF")).body.total).toBe(1);
});

test("histórico sin cliente conserva deuda y documentos no cobrables se identifican", async () => {
  const client = await reader([grant("receivables.read")]);
  const history = await client.request("/api/receivables/CXC-HIST");
  expect(history.status).toBe(200);
  expect(history.body.client.unregistered).toBe(true);
  expect(history.body.summary.balance).toBe("25.0000");
  const invalid = await client.request("/api/receivables/CXC-C2?documents=all");
  expect(invalid.body.documents.data.find((row) => row.id === 6)).toMatchObject({
    eligible: false,
    status: "Excluida",
  });
});

test("filtros, páginas y consultas no pueden pedir alcance de vendedor ni activar escrituras", async () => {
  const client = await reader([grant("receivables.read")]);
  for (const suffix of ["employeeId=A", "showNoe=true", "limit=101", "page=10001", "export=true", "state=unknown"])
    expect((await client.request(`/api/receivables?${suffix}`)).status).toBe(400);
  expect((await client.request("/api/receivables/C?documents=bad")).status).toBe(400);
  expect(
    (await client.request("/api/receivables/C/operations", { method: "POST", body: { type: "payment", amount: "1" } }))
      .status,
  ).toBe(403);
  expect((await client.request("/api/receivables/banks")).body).toEqual([{ id: "B1", name: "Banco sintético" }]);
});

test("el cruce indexado no cobra facturas con un identificador distinto por mayúsculas", async () => {
  const client = await reader([grant("receivables.read")]);
  await environment.db.raw(
    "ALTER TABLE masterfact MODIFY IdFactura VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment.db("cxc_documentos").insert({
    IdDocumento: 7,
    IdFactura: "cxc-c2",
    IdCliente: "CXC-C2",
    TipoDoc: "FAC",
    FechaEmision: "2026-01-01",
    FechaVencimiento: "2026-01-05",
    MonedaOriginal: "USD",
    MontoOriginal: 900,
    SaldoActual: 900,
    Estatus: "PENDIENTE",
  });
  const result = await client.request("/api/receivables?state=debt");
  expect(result.status).toBe(200);
  expect(result.body.summary.balance).toBe("400.0000");
  expect(result.body.data.find((account) => account.id === "CXC-C2").balance).toBe("75.0000");
  const detail = await client.request("/api/receivables/CXC-C2?documents=all");
  expect(detail.status).toBe(200);
  expect(detail.body.summary.balance).toBe("75.0000");
  expect(detail.body.documents.data.find((document) => document.id === 7)).toMatchObject({
    eligible: false,
    status: "Excluida",
  });
});

test("identificadores exactos no mezclan deudas por colación y la lectura nunca recrea tablas", async () => {
  const client = await reader([grant("receivables.read")]);
  await environment.db.raw(
    "ALTER TABLE clientes MODIFY IdCliente VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  expect((await client.request("/api/receivables/c")).status).toBe(404);
  await environment.db.schema.dropTable("cxc_cierres");
  const status = await client.request("/api/receivables/status");
  expect(status.body.available).toBe(false);
  expect((await client.request("/api/receivables/C")).status).toBe(503);
  expect(await environment.db.schema.hasTable("cxc_cierres")).toBe(false);
});
