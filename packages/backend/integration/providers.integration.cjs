const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedPurchases } = require("../../../tests/support/purchase-fixtures.cjs");
const { seedProviders } = require("../../../tests/support/provider-fixtures.cjs");
let environment;
const range = "from=2026-11-01&to=2026-11-30";
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
  await seedPurchases(environment.db);
  await seedProviders(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("directorio requiere providers.read y nunca selecciona datos personales o importes", async () => {
  for (const capability of ["purchases.read", "sales.read", "inventory.read", "access.users"]) {
    const client = await reader([grant(capability)]);
    expect((await client.request("/api/providers/list")).status).toBe(403);
  }
  const client = await reader([grant("providers.read")]);
  const result = await client.request("/api/providers/list?limit=1&sortBy=IdProveedor&sortDir=asc");
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ total: 2, page: 1, limit: 1 });
  expect(result.body.data[0]).toEqual({ IdProveedor: "PUR-A", Empresa: "Proveedor compras A" });
  expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|Rif|Telfs|Email|monto/);
  expect((await client.request("/api/providers/options?search=compras")).body).toHaveLength(2);
  expect((await client.request("/api/providers/list?search=PRIVATE")).body.total).toBe(0);
});

test("proveedor no infiere ventas, compras o costos, los grupos no autorizados se omiten", async () => {
  const client = await reader([grant("providers.read")]);
  expect((await client.request(`/api/providers/PUR-A/summary?${range}`)).body).toEqual({
    provider: { IdProveedor: "PUR-A", Empresa: "Proveedor compras A" },
  });
  for (const subresource of ["sales", "products", "purchases"])
    expect((await client.request(`/api/providers/PUR-A/${subresource}?${range}`)).status).toBe(403);
});

test.each(["false", "true"])(
  "proveedor conserva vendedor asignado antes de resumen, líneas y agregados showNoe=%s",
  async (showNoe) => {
    const client = await reader([grant("providers.read"), grant("sales.read", "assigned")]);
    const summary = await client.request(`/api/providers/PUR-A/summary?${range}&showNoe=${showNoe}`);
    expect(summary.status).toBe(200);
    expect(summary.body.sales).toMatchObject({ totalRawProfit: 100, totalInvoices: 1, totalQuantity: 1 });
    expect(summary.body.sales).not.toHaveProperty("totalNetProfit");
    expect(summary.body).not.toHaveProperty("purchases");
    const list = await client.request(`/api/providers/PUR-A/sales?${range}&showNoe=${showNoe}`);
    expect(list.body.pagination.total).toBe(1);
    expect(list.body.data[0].invoiceId).toBe("provider-sale-A");
    const detail = await client.request(`/api/providers/PUR-A/sales/provider-sale-A?showNoe=${showNoe}`);
    expect(detail.status).toBe(200);
    expect(detail.body.total).toBe(100);
    expect(detail.body.productos).toHaveLength(1);
    expect(detail.body.productos[0].descripcion).toBe("Venta proveedor A");
    expect(JSON.stringify(detail.body)).not.toMatch(/PRIVATE|costo|utilidad/);
    expect((await client.request(`/api/providers/PUR-A/sales/provider-sale-B?showNoe=${showNoe}`)).status).toBe(404);
  },
);

test("costo propio no se amplía al proveedor global; acotar empleado legítimo permite campos", async () => {
  const client = await reader([grant("providers.read"), grant("sales.read"), grant("sales.financial", "assigned")]);
  const global = await client.request(`/api/providers/PUR-A/summary?${range}`);
  expect(global.body.sales.totalRawProfit).toBe(300);
  expect(global.body.sales).not.toHaveProperty("totalNetProfit");
  const own = await client.request(`/api/providers/PUR-A/summary?${range}&employeeId=A`);
  expect(own.body.sales.totalNetProfit).toBe(40);
  const detail = await client.request("/api/providers/PUR-A/sales/provider-sale-A");
  expect(detail.body.utilidad).toBe(40);
  expect(detail.body.productos[0].costo).toBe(60);
});

test("detalle de compra verifica proveedor, anulación y permiso antes de enviar líneas", async () => {
  const client = await reader([grant("providers.read"), grant("purchases.read")]);
  const detail = await client.request("/api/providers/PUR-A/purchases/provider-purchase-A");
  expect(detail.status).toBe(200);
  expect(detail.body.productos[0]).toMatchObject({ descripcion: "Producto del proveedor A", cantidad: "2.000000" });
  expect(detail.body).not.toHaveProperty("total");
  expect(detail.body.productos[0]).not.toHaveProperty("precio");
  for (const path of [
    "PUR-B/purchases/provider-purchase-A",
    "PUR-A/purchases/provider-purchase-B",
    "PUR-A/purchases/provider-purchase-void",
  ])
    expect((await client.request(`/api/providers/${path}`)).status).toBe(404);
  const allowed = await reader([grant("providers.read"), grant("purchases.read"), grant("purchases.costs")]);
  expect((await allowed.request("/api/providers/PUR-A/purchases/provider-purchase-A")).body.total).toBe("14.00");
});

test("compras globales autorizadas no dependen del vendedor ni del sistema de ventas", async () => {
  const client = await reader([
    grant("providers.read"),
    grant("purchases.read"),
    grant("purchases.costs"),
    grant("sales.read", "assigned"),
  ]);
  const summary = await client.request(`/api/providers/PUR-A/summary?${range}&showNoe=true&employeeId=A`);
  expect(summary.body.purchases).toMatchObject({ totalInvoices: 1, totalQuantity: 2, totalPurchased: 14 });
  expect(summary.body.sales.totalRawProfit).toBe(100);
  const list = await client.request(`/api/providers/PUR-A/purchases?${range}`);
  expect(list.body.pagination.total).toBe(1);
  expect(list.body.data[0].monto).toBe("14.00");
  const missing = await client.request(`/api/providers/PROV-MISSING/summary?${range}`);
  expect(missing.status).toBe(200);
  expect(missing.body.purchases.totalPurchased).toBe(33);
});

test("parámetros no autorizados no permiten consultas por contactos o dominios diferentes", async () => {
  const client = await reader([grant("providers.read"), grant("purchases.read")]);
  for (const path of [
    "list?sortBy=Rif",
    "list?export=true",
    "options?limit=100",
    "list?search[]=a",
    `PUR-A/summary?${range}&sortBy=totalNetProfit`,
    `PUR-A/purchases?${range}&showNoe=true`,
  ])
    expect((await client.request(`/api/providers/${path}`)).status).toBe(400);
  expect((await client.request(`/api/providers/${encodeURIComponent("' OR 1=1 --")}/summary?${range}`)).status).toBe(
    400,
  );
});

test("colación insensible no mezcla la asociación de productos con otro proveedor", async () => {
  await environment.db.raw(
    "ALTER TABLE productos MODIFY Proveedor VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment
    .db("productos")
    .insert({ IdProducto: "PROV-LOWER", Descripcion: "Otro proveedor con minúscula", Grupo: "G", Proveedor: "pur-a" });
  await environment.db("slavefact").insert({
    IdFactura: "provider-sale-A",
    IdProducto: "PROV-LOWER",
    Descripcion: "No corresponde al proveedor",
    Precio: 999,
    Costo: 1,
    Cantidad: 1,
  });
  const client = await reader([grant("providers.read"), grant("sales.read", "assigned")]);
  const result = await client.request(`/api/providers/PUR-A/summary?${range}`);
  expect(result.status).toBe(200);
  expect(result.body.sales.totalRawProfit).toBe(100);
  expect((await client.request("/api/providers/PUR-A/sales/provider-sale-A")).body.productos).toHaveLength(1);
});

test("tabla original agrega sólo ventas propias y conserva compras sin revelar importes no autorizados", async () => {
  const own = await reader([grant("providers.read"), grant("sales.read", "assigned"), grant("purchases.read")]);
  const result = await own.request(`/api/providers/list?${range}&sortBy=total_ventas`);
  expect(result.status).toBe(200);
  const a = result.body.data.find((row) => row.IdProveedor === "PUR-A");
  expect(a).toMatchObject({ total_ventas: 100, num_ventas: 1, num_compras: 1 });
  expect(a).not.toHaveProperty("utilidad");
  expect(a).not.toHaveProperty("total_compras");
  expect(result.body.totals.total_ventas).toBe(1189);
  expect((await own.request(`/api/providers/list?${range}&sortBy=utilidad`)).status).toBe(403);
  const catalog = await reader([grant("providers.read")]);
  const rows = await catalog.request(`/api/providers/list?${range}`);
  expect(rows.status).toBe(200);
  expect(rows.body.totals).toEqual({});
  expect(rows.body.data.every((row) => Object.keys(row).sort().join(",") === "Empresa,IdProveedor")).toBe(true);
});

test("tabla original global no obtiene utilidad propia ni convierte costos incompletos en cero", async () => {
  const global = await reader([grant("providers.read"), grant("sales.read"), grant("sales.financial", "assigned")]);
  const result = await global.request(`/api/providers/list?${range}`);
  expect(result.status).toBe(200);
  expect(result.body.totals).not.toHaveProperty("utilidad");
  const own = await reader([
    grant("providers.read"),
    grant("sales.read", "assigned"),
    grant("sales.financial", "assigned"),
  ]);
  await environment
    .db("slavefact")
    .where("IdFactura", "provider-sale-A")
    .where("IdProducto", "PROV-P")
    .update({ Costo: null });
  try {
    const missing = await own.request(`/api/providers/list?${range}`);
    expect(missing.status).toBe(200);
    expect(missing.body.data.find((row) => row.IdProveedor === "PUR-A").utilidad).toBeNull();
    expect(missing.body.totals.utilidad).toBeNull();
    const summary = await own.request(`/api/providers/PUR-A/summary?${range}`);
    expect(summary.status).toBe(200);
    expect(summary.body.sales.totalNetProfit).toBeNull();
    const document = await own.request("/api/providers/PUR-A/sales/provider-sale-A");
    expect(document.status).toBe(200);
    expect(document.body.utilidad).toBeNull();
    expect(document.body.productos[0].costo).toBeNull();
    const rows = await own.request(`/api/providers/PUR-A/sales?${range}`);
    expect(rows.status).toBe(200);
    expect(rows.body.data[0].utilidad).toBeNull();
  } finally {
    await environment
      .db("slavefact")
      .where("IdFactura", "provider-sale-A")
      .where("IdProducto", "PROV-P")
      .update({ Costo: 60 });
  }
});

test("tabla original rechaza universos excesivos sin truncar y permite búsquedas acotadas", async () => {
  const rows = Array.from({ length: 5000 }, (_, index) => ({
    IdProveedor: `BOUND-${String(index).padStart(5, "0")}`,
    Empresa: `Proveedor límite ${index}`,
  }));
  try {
    for (let offset = 0; offset < rows.length; offset += 200)
      await environment.db("proveedores").insert(rows.slice(offset, offset + 200));
    const client = await reader([grant("providers.read"), grant("sales.read")]);
    expect((await client.request(`/api/providers/list?${range}`)).status).toBe(413);
    const search = await client.request(
      `/api/providers/list?${range}&search=${encodeURIComponent("Proveedor compras A")}`,
    );
    expect(search.status).toBe(200);
    expect(search.body.total).toBe(1);
    expect(search.body.data[0].IdProveedor).toBe("PUR-A");
    const catalog = await client.request("/api/providers/list?limit=1");
    expect(catalog.status).toBe(200);
    expect(catalog.body.total).toBeGreaterThan(5000);
  } finally {
    await environment.db("proveedores").where("IdProveedor", "like", "BOUND-%").del();
  }
});
