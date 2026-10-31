const { randomUUID } = require("node:crypto");
const { test, expect, login } = require("./fixtures.cjs");
const { backend } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");

async function administrator(page, environment) {
  const permissions = Object.keys(backend("./auth/capabilities").CAPABILITIES).map((capability) => ({ capability }));
  const user = await environment.seedUser({ permissions, enrolled: true });
  await login(page, environment, user);
  await page.getByRole("textbox", { name: "Código MFA", exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
}

test("la matriz usa permisos binarios y un permiso explícito de datos de otros vendedores", async ({
  page,
  environment,
}) => {
  await administrator(page, environment);
  await page.goto(`${environment.origin}/acceso#roles`);
  await page.getByRole("button", { name: "Crear rol", exact: true }).click();
  const name = `Comercial ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nombre del rol", { exact: true }).fill(name);
  const read = page.getByRole("checkbox", { name: "Consultar · Ventas / Desglose", exact: true });
  await read.check();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  const others = page.getByRole("checkbox", {
    name: "Consultar datos de otros vendedores · Ventas / Datos de otros vendedores",
    exact: true,
  });
  await expect(others).not.toBeChecked();
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rol guardado" })).toBeVisible();
  const role = await environment.db("dmmarket_auth_roles").where("name", name).first();
  expect(
    await environment.db("dmmarket_auth_role_capabilities").where("role_id", role.id).select("capability"),
  ).toEqual([{ capability: "sales.breakdown.read" }]);
});

test("crear una cuenta Vendedor selecciona una única identidad comercial y no una lista de vínculos", async ({
  page,
  environment,
}) => {
  await seedSales(environment.db);
  await backend("./seeds/001_default_roles").seed(environment.db);
  await administrator(page, environment);
  await page.goto(`${environment.origin}/acceso#usuarios`);
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Ana comercial");
  const username = `comercial-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Rol", { exact: true }).selectOption({ label: "Vendedor" });
  await expect(page.getByLabel("Perfil comercial", { exact: true })).toHaveAttribute("required", "");
  await page.getByLabel("Perfil comercial", { exact: true }).selectOption("A");
  await expect(page.getByText("Vendedores vinculados", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Crear usuario", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Credencial temporal", exact: true })).toBeVisible();
  const user = await environment.db("dmmarket_auth_users").where("username", username).first();
  expect(await environment.db("dmmarket_auth_commercial_profiles").where("user_id", user.id)).toEqual([
    { user_id: user.id, seller_id: "A" },
  ]);
});
