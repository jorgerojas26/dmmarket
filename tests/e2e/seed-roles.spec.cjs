const { test, expect, login } = require("./fixtures.cjs");
const { backend } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedReceivables, prepareReceivablesWrites } = require("../support/receivables-fixtures.cjs");
const { seedInventory } = require("../support/inventory-fixtures.cjs");

async function userFor(environment, names, sellerId = null) {
  await seedSales(environment.db);
  await seedReceivables(environment.db);
  await seedInventory(environment.db);
  await prepareReceivablesWrites(environment.db);
  await backend("./seeds/001_default_roles").seed(environment.db);
  const user = await environment.seedUser({ permissions: [] });
  for (const name of names) {
    const role = await environment.db("dmmarket_auth_roles").where("name", name).first();
    expect(role).toBeTruthy();
    await environment.db("dmmarket_auth_user_roles").insert({ user_id: user.id, role_id: role.id });
  }
  if (sellerId)
    await environment.db("dmmarket_auth_commercial_profiles").insert({ user_id: user.id, seller_id: sellerId });
  return user;
}

test("Consultor recorre negocio y cartera sin datos sensibles ni operaciones", async ({ page, environment }) => {
  await login(page, environment, await userFor(environment, ["Consultor"]));
  await page.goto(`${environment.origin}/inventario`);
  await expect(page.getByRole("cell", { name: "I-A", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Precio", exact: true })).toHaveCount(0);
  await page.goto(`${environment.origin}/clientes?view=receivables`);
  await expect(page.getByRole("heading", { name: "Cuentas por cobrar", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar abono", exact: true })).toHaveCount(0);
  await page.getByRole("cell", { name: "Cliente sintético", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver factura 2", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Ver factura 2", exact: true }).click();
  await expect(page.getByText("Factura #2", { exact: true })).toBeVisible();
  await expect(page.getByText(/PRIVATE-/)).toHaveCount(0);
  const forbidden = await page.evaluate(async () => ({
    directory: (await fetch("/api/auth/directory")).status,
    commissions: (await fetch("/api/employees/commissionInfo/A")).status,
  }));
  expect(forbidden).toEqual({ directory: 403, commissions: 403 });
});

test("Vendedor con Cobranza mantiene ventas propias y consulta facturas ajenas solo desde cartera", async ({
  page,
  environment,
}) => {
  await login(page, environment, await userFor(environment, ["Vendedor", "Cobranza"], "A"));
  await page.goto(`${environment.origin}/ventas?view=desglose&from=2026-01-01&to=2026-01-31`);
  await expect(page.getByRole("heading", { name: "Desglose de Ventas", exact: true })).toBeVisible();
  const sales = await page.evaluate(
    async () => (await (await fetch("/api/sales/facturas?from=2026-01-01&to=2026-01-31&showNoe=false")).json()).data,
  );
  expect(sales.map((row) => String(row.idFactura || row.invoiceId || row.id))).toEqual(["1"]);
  await page.goto(`${environment.origin}/clientes?view=receivables`);
  await expect(page.getByRole("button", { name: "Registrar abono", exact: true })).toBeEnabled();
  await page.getByRole("cell", { name: "Cliente sintético", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver factura 2", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Ver factura 2", exact: true }).click();
  await expect(page.getByText("Factura #2", { exact: true })).toBeVisible();
  await expect(page.getByText(/PRIVATE-/)).toHaveCount(0);
});
