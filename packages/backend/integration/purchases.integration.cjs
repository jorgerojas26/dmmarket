const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
let environment;
const range = "from=2026-08-01&to=2026-08-31";
const grant = (capability) => ({ capability, scope: "global" });
async function reader(permissions) {
  const user = await environment.seedUser({ permissions });
  const client = environment.client();
  await client.login(user);
  return client;
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedPurchases(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("compras exige lectura explícita, no se infiere de ventas, costos o proveedores", async () => {
  for (const permission of [
    "purchases.costs",
    "purchases.export",
    "sales.read",
    "inventory.read",
    "providers.read",
    "access.users",
  ]) {
    const client = await reader([grant(permission)]);
    for (const path of ["invoices", "products"])
      expect((await client.request(`/api/purchases/${path}?${range}`)).status).toBe(403);
  }
});

test("lectura básica conserva documentos sin líneas y cantidades sin exponer importes o proveedores", async () => {
  const client = await reader([grant("purchases.read"), grant("inventory.costs"), grant("sales.financial")]);
  const invoices = await client.request(`/api/purchases/invoices?${range}&sortBy=numero&sortDir=asc&limit=1`);
  expect(invoices.status).toBe(200);
  expect(invoices.body.pagination).toEqual({ page: 1, limit: 1, total: 3 });
  expect(invoices.body.data[0]).toMatchObject({
    invoiceId: "purchase-august-A",
    unidades: "5.000",
    fecha: "2026-08-01",
  });
  expect(invoices.body.totals).toEqual({ unidades: "6.000" });
  expect(JSON.stringify(invoices.body)).not.toMatch(/monto|Precio|avgUnitCost|proveedor|PRIVATE|80\.00|130\.00/i);
  const empty = await client.request(`/api/purchases/invoices?${range}&search=purchase-august-empty`);
  expect(empty.body.data[0].unidades).toBe("0.000");
  const products = await client.request(`/api/purchases/products?${range}`);
  expect(products.body.pagination.total).toBe(2);
  expect(products.body.data.find((row) => row.productId === "MISSING-PUR").product).toBe("Producto histórico comprado");
  expect(products.body.totals).toEqual({ quantity: "6.000" });
});

test("costos y todos sus derivados y ordenaciones requieren purchases.costs", async () => {
  const basic = await reader([grant("purchases.read")]);
  for (const [path, sort] of [
    ["invoices", "monto"],
    ["products", "monto"],
    ["products", "avgUnitCost"],
  ])
    expect((await basic.request(`/api/purchases/${path}?${range}&sortBy=${sort}`)).status).toBe(403);
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  const products = await client.request(`/api/purchases/products?${range}&sortBy=monto&limit=1`);
  expect(products.body.data[0]).toMatchObject({ productId: "P", monto: "80.00", avgUnitCost: "16.00" });
  expect(products.body.totals).toEqual({ quantity: "6.000", monto: "130.00" });
  const page2 = await client.request(`/api/purchases/products?${range}&sortBy=monto&limit=1&page=2`);
  expect(page2.body.data[0].monto).toBe("50.00");
  expect(page2.body.totals).toEqual(products.body.totals);
  const header = await client.request(`/api/purchases/invoices?${range}&search=purchase-august-empty`);
  expect(header.body.data[0].monto).toBe("0.00");
});

test("proveedores son permiso separado y su identificación no entra en compras", async () => {
  const basic = await reader([grant("purchases.read")]);
  for (const suffix of ["proveedorId=PUR-A", "sortBy=proveedor"])
    expect((await basic.request(`/api/purchases/invoices?${range}&${suffix}`)).status).toBe(403);
  expect((await basic.request(`/api/purchases/invoices?${range}&search=Proveedor`)).body.pagination.total).toBe(0);
  const client = await reader([grant("purchases.read"), grant("providers.read")]);
  const result = await client.request(`/api/purchases/invoices?${range}&proveedorId=PUR-A&sortBy=proveedor`);
  expect(result.status).toBe(200);
  expect(result.body.pagination.total).toBe(2);
  expect(result.body.data.every((row) => row.proveedor === "Proveedor compras A")).toBe(true);
  expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|Rif|Telfs|Email/);
});

test("grupo y búsqueda filtran filas antes de agrupar, contar y totalizar", async () => {
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  const group = await client.request(`/api/purchases/invoices?${range}&groupId=G&limit=1`);
  expect(group.body.pagination.total).toBe(1);
  expect(group.body.totals).toEqual({ unidades: "5.000", monto: "80.00" });
  const historic = await client.request(`/api/purchases/products?${range}&search=${encodeURIComponent("histórico")}`);
  expect(historic.body.pagination.total).toBe(1);
  expect(historic.body.totals).toEqual({ quantity: "1.000", monto: "50.00" });
  expect(
    (await client.request(`/api/purchases/products?${range}&search=${encodeURIComponent("' OR 1=1 --")}`)).body
      .pagination.total,
  ).toBe(0);
  expect((await client.request(`/api/purchases/products?${range}&groupId=G&categoryId=G`)).status).toBe(400);
});

test("valores desconocidos y productos sin identificador no desaparecen ni inventan ceros", async () => {
  await environment.db("mastercomp").insert({ IdFactura: "purchase-null", Fecha: "2026-10-01", Anulada: false });
  await environment.db("slavecomp").insert({
    IdFactura: "purchase-null",
    IdProducto: null,
    Descripcion: "Producto sin identificador",
    Precio: null,
    Cantidad: null,
  });
  const client = await reader([grant("purchases.read"), grant("purchases.costs")]);
  for (const path of ["invoices", "products"]) {
    const result = await client.request(`/api/purchases/${path}?from=2026-10-01&to=2026-10-31`);
    expect(result.status).toBe(200);
    expect(result.body.pagination.total).toBe(1);
    expect(result.body.data[0].monto).toBeNull();
    expect(result.body.totals.monto).toBeNull();
  }
  expect((await client.request("/api/purchases/products?from=2026-10-01&to=2026-10-31")).body.data[0].productId).toBe(
    "__none__",
  );
});

test("tablas de compras son fijas y los parámetros no abren exportaciones ni escrituras", async () => {
  const client = await reader([grant("purchases.read")]);
  for (const suffix of [
    "showNoe=true",
    "showNoe=false",
    "limit=101",
    "page=0",
    "sortBy=Rif",
    "export=true",
    "employeeId=A",
    "compareFrom=2025-01-01",
  ])
    expect((await client.request(`/api/purchases/invoices?${range}&${suffix}`)).status).toBe(400);
  expect((await client.request("/api/purchases/invoices")).status).toBe(400);
  expect((await client.request(`/api/purchases/invoices?${range}`)).body.pagination.limit).toBe(20);
  expect(
    (
      await client.request(`/api/purchases/invoices?${range}`, {
        method: "POST",
        body: { invoiceId: "purchase-august-A" },
      })
    ).status,
  ).toBe(403);
  expect((await client.request("/api/groups")).status).toBe(200);
});

test("identificadores binarios no mezclan documentos ni proveedores por colación", async () => {
  await environment.db.raw(
    "ALTER TABLE slavecomp MODIFY IdFactura VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment
    .db("mastercomp")
    .insert({ IdFactura: "PURCHASE-AUGUST-A", Fecha: "2026-08-01", IdProveedor: "pur-a", Anulada: false });
  await environment
    .db("slavecomp")
    .insert({ IdFactura: "PURCHASE-AUGUST-A", IdProducto: "P", Descripcion: "Otra compra", Precio: 9999, Cantidad: 1 });
  const client = await reader([grant("purchases.read"), grant("purchases.costs"), grant("providers.read")]);
  const result = await client.request(`/api/purchases/invoices?${range}&proveedorId=PUR-A`);
  expect(result.body.pagination.total).toBe(2);
  expect(result.body.data.find((row) => row.invoiceId === "purchase-august-A").monto).toBe("80.00");
});
