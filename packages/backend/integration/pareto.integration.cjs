const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedPareto } = require("../../../tests/support/pareto-fixtures.cjs");
let environment;
const range = "from=2026-06-01&to=2026-07-01";
const grant = (capability, scope = "global") => ({ capability, scope });
const own = [grant("sales.read", "assigned"), grant("purchases.read")];
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
  await seedPareto(environment.db);
});
afterAll(async () => {
  await environment?.close();
});

test("dependencias explícitas impiden inferir compras o utilidad desde ventas", async () => {
  for (const permissions of [[grant("sales.read")], [grant("purchases.read")], [grant("access.users")]]) {
    const client = await reader(permissions);
    expect((await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit`)).status).toBe(403);
  }
  const client = await reader(own);
  expect((await client.request(`/api/dashboard/pareto?${range}`)).status).toBe(403);
  for (const suffix of ["sortBy=netProfit", "newSortBy=netProfit", "sortBy=inventoryValue", "newSortBy=inventoryValue"])
    expect((await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit&${suffix}`)).status).toBe(403);
});

test.each(["false", "true"])("filtra vendedor antes de ranking y maduración a 30 días showNoe=%s", async (showNoe) => {
  const client = await reader(own);
  const result = await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit&showNoe=${showNoe}`);
  expect(result.status).toBe(200);
  expect(result.body.valueKey).toBe("rawProfit");
  expect(result.body.products.map((row) => [row.productId, row.rawProfit, row.rank])).toEqual([
    ["P", 100, 1],
    ["Q", 80, 2],
  ]);
  expect(result.body.products[0].firstPurchaseDate).toBe("2010-01-01");
  expect(result.body.products[1].firstPurchaseDate).toBe("2026-06-01");
  expect(result.body.products[0].cumulativePercent).toBe(55.56);
  expect(result.body.summary.totalProducts).toBe(2);
  expect(result.body.newProductsCount).toBe(1);
  expect(result.body.newProducts[0]).toMatchObject({ productId: "R", rawProfit: 20, firstPurchaseDate: "2026-06-02" });
  expect(JSON.stringify(result.body)).not.toMatch(
    /netProfit|inventoryValue|cumulativeProfit|profitPercent|newProductsInventoryTotal/,
  );
});

test("cobertura financiera se exige sobre todo el conjunto, no basta una capacidad", async () => {
  const partial = await reader([
    grant("sales.read"),
    grant("purchases.read"),
    grant("sales.costs", "assigned"),
    grant("sales.profit", "assigned"),
  ]);
  expect((await partial.request(`/api/dashboard/pareto?${range}`)).status).toBe(403);
  const bounded = await partial.request(`/api/dashboard/pareto?${range}&employeeId=A`);
  expect(bounded.status).toBe(200);
  expect(bounded.body.products.map((row) => [row.productId, row.netProfit])).toEqual([
    ["Q", 60],
    ["P", 39],
  ]);
  for (const capability of ["sales.costs", "sales.profit"]) {
    const single = await reader([...own, grant(capability)]);
    expect((await single.request(`/api/dashboard/pareto?${range}`)).status).toBe(403);
  }
});

test("inventario actual exige ambas capacidades; datos desconocidos no se convierten en cero", async () => {
  const onlyRead = await reader([...own, grant("inventory.read")]);
  const hidden = await onlyRead.request(`/api/dashboard/pareto?${range}&metric=rawProfit`);
  expect(hidden.body.products.every((row) => !Object.hasOwn(row, "inventoryValue"))).toBe(true);
  const allowed = await reader([...own, grant("inventory.read"), grant("inventory.costs")]);
  const result = await allowed.request(`/api/dashboard/pareto?${range}&metric=rawProfit&sortBy=inventoryValue`);
  expect(result.body.products.map((row) => [row.productId, row.inventoryValue])).toEqual([
    ["Q", 500],
    ["P", 300],
  ]);
  expect(result.body.newProductsInventoryTotal).toBe(100);
  await environment.db("productos").where("IdProducto", "R").update({ Existencia: null });
  const missing = await allowed.request(`/api/dashboard/pareto?${range}&metric=rawProfit`);
  expect(missing.body.newProducts[0].inventoryValue).toBeNull();
  expect(missing.body.newProductsInventoryTotal).toBeNull();
});

test("compras sin vender requiere lectura global de ventas y costos de compras", async () => {
  const scoped = await reader([...own, grant("purchases.costs")]);
  expect((await scoped.request(`/api/dashboard/pareto?${range}&modo=compras-sin-vender`)).status).toBe(403);
  const noCosts = await reader([grant("sales.read"), grant("purchases.read")]);
  expect((await noCosts.request(`/api/dashboard/pareto?${range}&modo=compras-sin-vender`)).status).toBe(403);
  const client = await reader([grant("sales.read"), grant("purchases.read"), grant("purchases.costs")]);
  for (const showNoe of ["false", "true"]) {
    const result = await client.request(`/api/dashboard/pareto?${range}&modo=compras-sin-vender&showNoe=${showNoe}`);
    expect(result.status).toBe(200);
    expect(result.body.valueKey).toBe("totalPurchased");
    expect(result.body.products.map((row) => [row.productId, row.totalPurchased])).toEqual([["S", 200]]);
    expect(result.body.products[0]).not.toHaveProperty("netProfit");
  }
  expect((await client.request(`/api/dashboard/pareto?${range}&modo=compras-sin-vender&employeeId=A`)).status).toBe(
    400,
  );
});

test("búsqueda, orden y página de nuevos no alteran población ABC", async () => {
  const client = await reader(own);
  const first = await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit&newSearch=no-match&newLimit=1`);
  expect(first.body.products).toHaveLength(2);
  expect(first.body.newProductsCount).toBe(1);
  expect(first.body.newProductsTotal).toBe(0);
  expect(first.body.newProducts).toEqual([]);
  const second = await client.request(
    `/api/dashboard/pareto?${range}&metric=rawProfit&sortBy=quantity&sortDir=desc&newLimit=1&newPage=2`,
  );
  expect(second.body.products.map((row) => row.rank)).toEqual([2, 1]);
  expect(second.body.newProducts).toEqual([]);
  for (const suffix of [
    "newPage=0",
    "newLimit=101",
    "newSortDir=bad",
    "metric=cost",
    "modo=bad",
    "newSortBy=Rif",
    "from=invalid",
    "search=private",
  ])
    expect((await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit&${suffix}`)).status).toBe(400);
});

test("colación insensible no suma ventas ajenas ni compras de otro producto", async () => {
  await environment.db.raw(
    "ALTER TABLE masterfact MODIFY IdVend VARCHAR(32) CHARACTER SET utf8 COLLATE utf8_general_ci",
  );
  await environment
    .db("masterfact")
    .insert({ IdFactura: "pareto-lowercase", IdVend: "a", IdCliente: "C", Fecha: "2026-06-20", Anulada: false });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "pareto-lowercase", IdProducto: "Q", Precio: 9999, Costo: 1, Cantidad: 1 });
  const client = await reader(own);
  const result = await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit`);
  expect(result.body.products.map((row) => row.rawProfit)).toEqual([100, 80]);
});

test("productos sin compra en el período no ingresan y ventas ajenas excluyen compras globales", async () => {
  await environment.db("slavecomp").insert({ IdFactura: "pareto-old", IdProducto: "U", Precio: 1, Cantidad: 1 });
  await environment
    .db("slavefact")
    .insert({ IdFactura: "pareto-A", IdProducto: "U", Precio: 9999, Costo: 1, Cantidad: 1 });
  const client = await reader(own);
  const result = await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit`);
  expect(result.body.products.some((row) => row.productId === "U")).toBe(false);
  await environment
    .db("slavefact")
    .insert({ IdFactura: "pareto-B", IdProducto: "S", Precio: 60, Costo: 50, Cantidad: 1 });
  const global = await reader([grant("sales.read"), grant("purchases.read"), grant("purchases.costs")]);
  expect((await global.request(`/api/dashboard/pareto?${range}&modo=compras-sin-vender`)).body.products).toEqual([]);
  expect(
    (await global.request(`/api/dashboard/pareto?${range}&modo=compras-sin-vender&showNoe=true`)).body.products.map(
      (row) => row.productId,
    ),
  ).toEqual(["S"]);
});

test("importes desconocidos o negativos no inventan acumulados, porcentajes ni clases", async () => {
  for (const id of ["N", "M"])
    await environment.db("slavecomp").insert([
      { IdFactura: "pareto-old", IdProducto: id, Precio: 1, Cantidad: 1 },
      { IdFactura: "pareto-june", IdProducto: id, Precio: 1, Cantidad: 1 },
    ]);
  await environment.db("slavefact").insert([
    { IdFactura: "pareto-A", IdProducto: "N", Precio: -10, Costo: 1, Cantidad: 1 },
    { IdFactura: "pareto-A", IdProducto: "M", Precio: null, Costo: 1, Cantidad: 1 },
  ]);
  const client = await reader(own);
  const result = await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit`);
  expect(result.status).toBe(200);
  expect(result.body.products.find((row) => row.productId === "M").rawProfit).toBeNull();
  expect(result.body.products.find((row) => row.productId === "N").rawProfit).toBe(-10);
  expect(
    result.body.products.every(
      (row) => row.cumulativePercent === null && row.abcClass === null && row.cumulativeRevenue === null,
    ),
  ).toBe(true);
});

test("cruces de productos no multiplican importes y conservan identidades nulas y exactas", async () => {
  await environment.db("mastercomp").insert({ IdFactura: "JOIN-UI", Fecha: "2027-03-01", Anulada: false });
  await environment
    .db("masterfact")
    .insert({ IdFactura: "JOIN-UI", IdVend: "A", IdCliente: "C", Fecha: "2027-03-01", Anulada: false });
  await environment.db("slavecomp").insert([
    { IdFactura: "JOIN-UI", IdProducto: "PAIR", Precio: 1, Cantidad: 1 },
    { IdFactura: "JOIN-UI", IdProducto: "PAIR", Precio: 2, Cantidad: 1 },
    { IdFactura: "JOIN-UI", IdProducto: null, Precio: 3, Cantidad: 1 },
    { IdFactura: "JOIN-UI", IdProducto: null, Precio: 4, Cantidad: 1 },
    { IdFactura: "JOIN-UI", IdProducto: "CASE", Precio: 8, Cantidad: 1 },
    { IdFactura: "JOIN-UI", IdProducto: "UNSOLD", Precio: 9, Cantidad: 1 },
  ]);
  await environment.db("slavefact").insert([
    { IdFactura: "JOIN-UI", IdProducto: "PAIR", Precio: 10, Costo: 1, Cantidad: 2 },
    { IdFactura: "JOIN-UI", IdProducto: null, Precio: 5, Costo: 1, Cantidad: 1 },
    { IdFactura: "JOIN-UI", IdProducto: "case", Precio: 999, Costo: 1, Cantidad: 1 },
  ]);
  const dates = "from=2027-03-01&to=2027-03-31";
  const scoped = await reader(own);
  const sales = await scoped.request(`/api/dashboard/pareto?${dates}&metric=rawProfit`);
  expect(sales.status).toBe(200);
  const rows = [...sales.body.products, ...sales.body.newProducts];
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.productId === "PAIR")).toMatchObject({ rawProfit: 20, quantity: 2 });
  expect(rows.find((row) => row.productId === "__none__")).toMatchObject({ rawProfit: 5, quantity: 1 });
  const global = await reader([grant("sales.read"), grant("purchases.read"), grant("purchases.costs")]);
  const unsold = await global.request(`/api/dashboard/pareto?${dates}&modo=compras-sin-vender`);
  expect(unsold.status).toBe(200);
  expect([...unsold.body.products, ...unsold.body.newProducts].map((row) => row.productId).sort()).toEqual([
    "CASE",
    "UNSOLD",
  ]);
});

test("exceso de productos rechaza el Pareto completo en vez de truncar el universo", async () => {
  const ids = Array.from({ length: 5000 }, (_, i) => `LIMIT-${i}`);
  await environment
    .db("slavecomp")
    .insert(ids.map((IdProducto) => ({ IdFactura: "pareto-june", IdProducto, Precio: 1, Cantidad: 1 })));
  await environment
    .db("slavefact")
    .insert(ids.map((IdProducto) => ({ IdFactura: "pareto-A", IdProducto, Precio: 1, Costo: 0, Cantidad: 1 })));
  const client = await reader(own);
  expect((await client.request(`/api/dashboard/pareto?${range}&metric=rawProfit`)).status).toBe(413);
});
