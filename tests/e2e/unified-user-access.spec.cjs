const { randomUUID } = require("node:crypto");
const { test, expect, login } = require("./fixtures.cjs");
const { backend } = require("../support/auth-environment.cjs");
async function administrator(page, environment) {
  const owner = await environment.seedUser({
    permissions: Object.keys(backend("./auth/capabilities").CAPABILITIES).map((capability) => ({ capability })),
    enrolled: true,
  });
  await login(page, environment, owner);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(owner.secret));
  const verified = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/mfa") && response.status() === 200,
  );
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await verified;
  await expect(page.getByRole("button", { name: "Menú de cuenta", exact: true, includeHidden: true })).toBeAttached();
}
for (const width of [390, 1440, 1920])
  test(`roles y permisos forman un único acceso con previsualización y guardado a ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const inventory = { id: randomUUID(), name: `Consulta inventario ${width}` };
    const purchases = { id: randomUUID(), name: `Consulta compras ${width}` };
    await environment.db("dmmarket_auth_roles").insert([inventory, purchases]);
    await environment.db("dmmarket_auth_role_capabilities").insert([
      { role_id: inventory.id, capability: "inventory.stock.read" },
      { role_id: purchases.id, capability: "purchases.dashboard.read" },
    ]);
    const target = await environment.seedUser({ permissions: [] });
    await environment.db("dmmarket_auth_user_roles").where("user_id", target.id).delete();
    await environment.db("dmmarket_auth_user_roles").insert({ user_id: target.id, role_id: inventory.id });
    await administrator(page, environment);
    await page.goto(`${environment.origin}/acceso/usuarios/${target.id}`);
    const access = page.getByRole("region", { name: "Acceso del usuario", exact: true });
    await expect(access).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar roles del usuario", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Guardar permisos adicionales", exact: true })).toHaveCount(0);
    await access.getByRole("button", { name: "Inventario", exact: true }).click();
    const inventoryRead = access
      .getByRole("row", { name: /Desglose/ })
      .getByRole("checkbox")
      .first();
    await expect(inventoryRead).toBeChecked();
    await expect(inventoryRead).toBeDisabled();
    await expect(inventoryRead).toHaveAttribute("title", new RegExp(inventory.name));
    await access.getByRole("combobox", { name: "Añadir rol", exact: true }).selectOption(purchases.id);
    await access.getByRole("button", { name: "Compras", exact: true }).click();
    await expect(access.getByRole("row", { name: /Dashboard/ }).getByRole("checkbox")).toBeChecked();
    expect(await environment.db("dmmarket_auth_user_roles").where("user_id", target.id).pluck("role_id")).toEqual([
      inventory.id,
    ]);
    await access.getByRole("button", { name: `Quitar rol ${inventory.name}`, exact: true }).click();
    await access.getByRole("button", { name: "Inventario", exact: true }).click();
    await expect(inventoryRead).not.toBeChecked();
    await inventoryRead.check();
    await expect(access.getByText("Adicional", { exact: true })).toBeVisible();
    const writes = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && request.url().includes(`/api/auth/users/${target.id}/`))
        writes.push(new URL(request.url()).pathname);
    });
    await page.screenshot({ path: test.info().outputPath("unified-access.png") });
    await access.getByRole("button", { name: "Guardar acceso", exact: true }).click();
    await expect(access.getByRole("status")).toContainText("Acceso guardado");
    expect(writes).toEqual([`/api/auth/users/${target.id}/access`]);
    expect(await environment.db("dmmarket_auth_user_roles").where("user_id", target.id).pluck("role_id")).toEqual([
      purchases.id,
    ]);
    expect(
      await environment.db("dmmarket_auth_user_capabilities").where("user_id", target.id).pluck("capability"),
    ).toEqual(["inventory.stock.read"]);
    const event = await environment
      .db("dmmarket_auth_events")
      .where({ target_user_id: target.id, action: "auth.user_access_changed" })
      .first();
    expect(JSON.parse(event.details)).toMatchObject({
      rolesAdded: [purchases],
      rolesRemoved: [inventory],
      added: ["inventory.stock.read"],
      removed: [],
    });
    await page.getByRole("button", { name: "Volver a usuarios", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: target.username });
    await expect(row).toContainText(purchases.name);
    await expect(row).not.toContainText(inventory.name);
    await page.getByRole("link", { name: `Administrar ${target.username}`, exact: true }).click();
    await page.reload();
    await expect(access.getByRole("button", { name: `Quitar rol ${purchases.name}`, exact: true })).toBeVisible();
    await expect(access.getByRole("button", { name: "Guardar acceso", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto(`${environment.origin}/acceso#auditoria`);
    await page.getByRole("combobox", { name: "Actividad", exact: true }).selectOption("auth.user_access_changed");
    await page
      .getByRole("button", { name: "Ver detalle: Acceso del usuario actualizado", exact: true })
      .first()
      .click();
    await expect(page.getByText("Roles añadidos", { exact: true })).toBeVisible();
    await expect(page.getByText(purchases.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Roles retirados", { exact: true })).toBeVisible();
    await expect(page.getByText(inventory.name, { exact: true })).toBeVisible();
  });
