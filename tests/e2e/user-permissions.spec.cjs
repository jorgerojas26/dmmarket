const { test, expect, login } = require("./fixtures.cjs");
const { backend } = require("../support/auth-environment.cjs");

for (const width of [390, 1440])
  test(`los permisos adicionales distinguen roles, se guardan sin motivo y pueden retirarse a ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const user = await environment.seedUser({ permissions: [{ capability: "inventory.stock.read" }] });
    const owner = await environment.seedUser({
      permissions: Object.keys(backend("./auth/capabilities").CAPABILITIES).map((capability) => ({ capability })),
      enrolled: true,
    });
    await login(page, environment, owner);
    await page.getByRole("textbox", { name: "Código MFA", exact: true }).fill(await environment.token(owner.secret));
    const verified = page.waitForResponse(
      (response) => response.url().endsWith("/api/auth/mfa") && response.status() === 200,
    );
    await page.getByRole("button", { name: "Verificar código", exact: true }).click();
    await verified;
    await expect(page.getByRole("button", { name: "Menú de cuenta", exact: true, includeHidden: true })).toBeAttached();
    await page.goto(`${environment.origin}/acceso`);
    await page.getByRole("link", { name: `Administrar ${user.username}`, exact: true }).click();
    const section = page.getByRole("region", { name: "Permisos adicionales", exact: true });
    await section.getByRole("button", { name: "Inventario", exact: true }).click();
    const inherited = section
      .getByRole("row", { name: /Desglose/ })
      .getByRole("checkbox")
      .first();
    await expect(inherited).toBeChecked();
    await expect(inherited).toBeDisabled();
    await section.getByRole("button", { name: "Configuración", exact: true }).click();
    const rates = section
      .getByRole("row", { name: /Tasas BCV/ })
      .getByRole("checkbox")
      .first();
    await rates.check();
    await expect(section.getByRole("textbox", { name: /motivo/i })).toHaveCount(0);
    await section.getByRole("button", { name: "Guardar permisos adicionales", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("Permisos adicionales guardados");
    expect(
      await environment.db("dmmarket_auth_user_capabilities").where("user_id", user.id).pluck("capability"),
    ).toEqual(["settings.rates.read"]);
    const event = await environment
      .db("dmmarket_auth_events")
      .where({ target_user_id: user.id, action: "auth.user_permissions_changed" })
      .first();
    expect(JSON.parse(event.details)).toEqual({ added: ["settings.rates.read"], removed: [] });
    await rates.uncheck();
    await section.getByRole("button", { name: "Guardar permisos adicionales", exact: true }).click();
    await expect(section.getByRole("button", { name: "Guardar permisos adicionales", exact: true })).toBeDisabled();
    expect(await environment.db("dmmarket_auth_user_capabilities").where("user_id", user.id)).toHaveLength(0);
    await page.goto(`${environment.origin}/acceso#auditoria`);
    await page.getByRole("combobox", { name: "Actividad", exact: true }).selectOption("auth.user_permissions_changed");
    await page
      .getByRole("button", { name: "Ver detalle: Permisos adicionales actualizados", exact: true })
      .first()
      .click();
    await expect(page.getByText("Permisos retirados", { exact: true })).toBeVisible();
    await expect(page.getByText("Configuración / Tasas BCV · Consultar", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
