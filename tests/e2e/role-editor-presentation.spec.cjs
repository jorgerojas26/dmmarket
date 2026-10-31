const { randomUUID } = require("node:crypto");
const { test, expect, setPermission, login } = require("./fixtures.cjs");
const grant = (capability) => ({ capability });

async function openEditor(page, environment, readOnly = false) {
  await login(
    page,
    environment,
    await environment.seedUser({
      permissions: [
        grant("access.roles.read"),
        ...(!readOnly ? [grant("access.roles.create"), grant("access.roles.update")] : []),
      ],
    }),
  );
  await page.goto(`${environment.origin}/acceso#roles`);
  if (readOnly)
    await page
      .getByRole("button", { name: /^Ver permisos de / })
      .first()
      .click();
  else await page.getByRole("button", { name: "Crear rol", exact: true }).click();
  return page.getByRole("navigation", { name: "Módulos de permisos", exact: true });
}

for (const width of [390, 1440]) {
  test(`módulos de solo consulta usan tablas compactas sin alterar el editor a ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const modules = await openEditor(page, environment);
    await expect(page.getByRole("table", { name: "Permisos de Ventas", exact: true })).toBeVisible();
    const footer = page.locator(".access-role-editor .access-form-actions");
    const initialFooter = await footer.boundingBox();
    for (const [name, resources] of [
      ["Compras", ["Dashboard", "Desglose"]],
      ["Auditoría", ["Eventos"]],
    ]) {
      await modules.getByRole("button", { name, exact: true }).click();
      const panel = page.getByRole("region", { name: `Permisos de ${name}`, exact: true });
      const table = panel.getByRole("table", { name: `Permisos de ${name}`, exact: true });
      await expect(table).toBeVisible();
      await expect(table.locator("thead tr")).toHaveCount(1);
      await expect(table.getByRole("columnheader")).toHaveText(["Vista o función", "Consulta"]);
      const resourceHeading = table.getByRole("columnheader", { name: "Vista o función", exact: true });
      await expect(resourceHeading).toHaveCSS("text-transform", "uppercase");
      await expect(resourceHeading).toHaveCSS("font-size", "10px");
      await expect(resourceHeading).toHaveCSS("background-color", "rgb(37, 43, 53)");
      await expect(table.locator('[scope="colgroup"]')).toHaveCount(0);
      await expect(table.locator("tbody tr")).toHaveCount(resources.length);
      expect(
        await table
          .locator("tbody tr")
          .evaluateAll((rows) => rows.every((row) => row.getBoundingClientRect().height >= 48)),
      ).toBe(true);
      await expect(table.getByRole("columnheader", { name: "Consulta", exact: true })).toHaveCSS(
        "background-color",
        "rgb(37, 52, 75)",
      );
      expect((await table.boundingBox()).width).toBeLessThanOrEqual(560);
      for (const resource of resources) {
        await expect(table.getByRole("rowheader", { name: resource, exact: true })).toBeVisible();
        const checkbox = table.getByRole("checkbox", { name: `Consultar · ${name} / ${resource}`, exact: true });
        const before = await checkbox.boundingBox();
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        expect(await checkbox.boundingBox()).toEqual(before);
        await checkbox.focus();
        await page.keyboard.press("Space");
        await expect(checkbox).not.toBeChecked();
      }
      expect(await footer.boundingBox()).toEqual(initialFooter);
    }
    for (const name of ["Inventario", "Acceso"]) {
      await modules.getByRole("button", { name, exact: true }).click();
      const table = page.getByRole("table", { name: `Permisos de ${name}`, exact: true });
      await expect(table).toBeVisible();
      await expect(table.locator("thead tr")).toHaveCount(2);
      expect(
        await table
          .locator("tbody tr")
          .evaluateAll((rows) => rows.every((row) => row.getBoundingClientRect().height >= 48)),
      ).toBe(true);
      expect(await footer.boundingBox()).toEqual(initialFooter);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

for (const width of [390, 1440, 1920]) {
  test(`lista y editor de roles mantienen el mismo ancho a ${width}px`, async ({ page, environment }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openEditor(page, environment);
    await page.getByRole("button", { name: "Volver a roles", exact: true }).click();
    const list = page.locator(".access-card");
    await expect(list).toBeVisible();
    const { x, width: listWidth } = await list.boundingBox();
    await page.getByRole("button", { name: "Crear rol", exact: true }).click();
    await expect(page.getByRole("table", { name: "Permisos de Ventas", exact: true })).toBeVisible();
    for (const selector of [".access-role-editor", ".access-role-identity"]) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds.x).toBe(x);
      expect(bounds.width).toBe(listWidth);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Volver a roles", exact: true }).click();
    await page
      .getByRole("button", { name: /^Editar / })
      .first()
      .click();
    await expect(page.getByRole("table", { name: "Permisos de Ventas", exact: true })).toBeVisible();
    const edited = await page.locator(".access-role-editor").boundingBox();
    expect(edited.x).toBe(x);
    expect(edited.width).toBe(listWidth);
  });
}

for (const width of [390, 1440]) {
  test(`editor de roles muestra un módulo, conserva alcances y funciona con teclado a ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const modules = await openEditor(page, environment);
    const help = page.getByRole("button", { name: "Ayuda sobre permisos", exact: true });
    await expect(help).toHaveText("?");
    await expect(page.getByText("Los permisos se suman entre roles.", { exact: true })).toBeHidden();
    await help.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Los permisos se suman entre roles.", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Los permisos se suman entre roles.", { exact: true })).toBeHidden();
    await expect(page.getByText("Define qué puede hacer este perfil y sobre qué datos.")).toHaveCount(0);
    await expect(page.getByText("Sin cambios pendientes", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quitar permisos de Ventas", exact: true })).toHaveCount(0);
    await expect(modules).toHaveCSS("border-right-width", width > 1100 ? "1px" : "0px");
    await expect(modules.getByRole("button")).toHaveCount(9);
    expect(
      await modules
        .getByRole("button")
        .evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth)),
    ).toBe(true);
    await expect(modules.getByRole("button", { name: "Ventas", exact: true })).toHaveAttribute("aria-current", "true");
    const permissions = page.getByRole("region", { name: "Permisos de Ventas", exact: true });
    const table = permissions.getByRole("table", { name: "Permisos de Ventas", exact: true });
    await expect(table).toBeVisible();
    await expect(table.locator("thead tr")).toHaveCount(2);
    await expect(table.getByRole("columnheader", { name: "Acceso", exact: true })).toHaveAttribute("colspan", "1");
    await expect(table.getByRole("columnheader", { name: "Información comercial", exact: true })).toHaveAttribute(
      "colspan",
      "2",
    );
    await expect(table.getByRole("columnheader", { name: "Identificación", exact: true })).toHaveAttribute(
      "colspan",
      "1",
    );
    const dashboard = table
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: "Dashboard", exact: true }) });
    await expect(dashboard.locator('td[data-group="commercial"]')).toHaveCount(2);
    await expect(dashboard.locator('td[data-group="personal"]')).toHaveCount(1);
    await expect(dashboard.locator('td[data-group="commercial"]').first()).toHaveCSS(
      "background-color",
      "rgba(51, 46, 35, 0.38)",
    );
    const tableFrame = page.locator(".access-permission-table-scroll");
    await expect(tableFrame).toHaveCSS("border-radius", "0px");
    await expect(tableFrame).toHaveCSS("border-top-width", "0px");
    await expect(tableFrame).toHaveCSS("margin-left", "0px");
    await expect(tableFrame).toHaveCSS("margin-right", "0px");
    await expect(page.getByText("Cambios sin guardar", { exact: true })).toHaveCount(0);
    await expect(permissions.getByRole("heading", { name: "Ventas", exact: true })).toBeVisible();
    const roleName = page.getByLabel("Nombre del rol", { exact: true });
    expect(
      await roleName.evaluate((element) => ({
        outside: !element.closest(".access-role-editor"),
        form: element.form?.id,
      })),
    ).toEqual({ outside: true, form: "access-role-form" });
    expect(
      await table
        .getByRole("row")
        .evaluateAll((rows) => rows.slice(1).every((row) => row.getBoundingClientRect().height <= 68)),
    ).toBe(true);
    for (const label of ["Vista o función", "Consulta", "Rentabilidad", "Importes comerciales", "Datos personales"])
      await expect(table.getByRole("columnheader", { name: label, exact: true })).toBeVisible();
    for (const [name, count] of [
      ["Dashboard", 2],
      ["Desglose", 2],
      ["Despacho", 4],
    ]) {
      const resource = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
      await expect(resource.getByRole("checkbox")).toHaveCount(count);
      await expect(resource.getByRole("combobox")).toHaveCount(0);
    }
    await expect(table.getByRole("switch")).toHaveCount(0);
    await expect(table.getByRole("cell", { name: "No aplica", exact: true })).toHaveCount(7);
    if (width > 1100) {
      expect(await table.evaluate((element) => element.scrollWidth <= element.parentElement.clientWidth)).toBe(true);
    }
    await expect(page.getByRole("region", { name: "Permisos de Configuración", exact: true })).toHaveCount(0);
    const dashboardToggle = page.getByRole("checkbox", { name: "Consultar · Ventas / Dashboard", exact: true });
    await dashboardToggle.focus();
    await page.keyboard.press("Space");
    await expect(dashboardToggle).toBeChecked();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(dashboardToggle).not.toBeChecked();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await setPermission(page, "Consultar · Ventas / Desglose");
    await expect(page.getByRole("button", { name: "Quitar permisos de Ventas", exact: true })).toBeVisible();
    const settings = modules.getByRole("button", { name: "Configuración", exact: true });
    await settings.focus();
    await page.keyboard.press("Enter");
    await expect(settings).toHaveAttribute("aria-current", "true");
    const settingsTable = page.getByRole("table", { name: "Permisos de Configuración", exact: true });
    await expect(settingsTable.getByRole("columnheader", { name: "Acciones", exact: true })).toBeVisible();
    await expect(settingsTable.getByRole("columnheader", { name: "Información comercial", exact: true })).toHaveCount(
      0,
    );
    await setPermission(page, "Consultar · Configuración / Tasas BCV");
    await modules.getByRole("button", { name: "Ventas", exact: true }).click();
    await expect(page.getByLabel("Consultar · Ventas / Desglose", { exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: "Guardar rol", exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Volver a roles", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "¿Descartar los cambios?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Seguir editando", exact: true }).click();
    await expect(page.getByLabel("Consultar · Ventas / Desglose", { exact: true })).toBeChecked();
  });
}

test("los permisos se editan por fila sin activar otros y se guardan junto a sus alcances", async ({
  page,
  environment,
}) => {
  const modules = await openEditor(page, environment);
  const name = `Matriz ${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nombre del rol", { exact: true }).fill(name);
  await setPermission(page, "Consultar · Ventas / Desglose");
  await expect(page.getByRole("button", { name: "Activar consultas", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("las nuevas consultas", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Consultar · Ventas / Dashboard", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Consultar · Ventas / Despacho", { exact: true })).not.toBeChecked();
  await setPermission(page, "Consultar · Ventas / Dashboard");
  await expect(page.getByLabel("Consultar · Ventas / Desglose", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Consultar · Ventas / Dashboard", { exact: true })).toBeChecked();
  await expect(
    page.getByLabel("Ver rentabilidad (costos, utilidad y margen) · Ventas / Dashboard", { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Ver importes comerciales · Ventas / Despacho", { exact: true })).not.toBeChecked();
  await modules.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await setPermission(page, "Consultar · Clientes / Cuentas por cobrar");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByLabel("Registrar abonos · Clientes / Cuentas por cobrar", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rol guardado" })).toBeVisible();
  const role = await environment.db("dmmarket_auth_roles").where("name", name).first();
  expect(
    await environment
      .db("dmmarket_auth_role_capabilities")
      .where("role_id", role.id)
      .orderBy("capability")
      .select("capability"),
  ).toEqual([grant("clients.receivables.read"), grant("sales.breakdown.read"), grant("sales.dashboard.read")]);
  await page.getByRole("button", { name: `Editar ${name}`, exact: true }).click();
  await expect(page.getByLabel("Consultar · Ventas / Desglose", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Quitar permisos de Ventas", exact: true }).click();
  await expect(page.getByText("Cambios sin guardar", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quitar permisos de Ventas", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Consultar · Ventas / Desglose", { exact: true })).not.toBeChecked();
  await modules.getByRole("button", { name: "Clientes", exact: true }).click();
  await expect(page.getByLabel("Consultar · Clientes / Cuentas por cobrar", { exact: true })).toBeChecked();
});

test("la inspección de un rol permite recorrer módulos sin habilitar edición ni guardado", async ({
  page,
  environment,
}) => {
  const modules = await openEditor(page, environment, true);
  await page.getByRole("button", { name: "Ayuda sobre permisos", exact: true }).click();
  await expect(page.getByText("Los permisos se suman entre roles.", { exact: true })).toBeVisible();
  await modules.getByRole("button", { name: "Configuración", exact: true }).click();
  await expect(page.getByRole("region", { name: "Permisos de Configuración", exact: true })).toBeVisible();
  await expect(page.getByLabel("Consultar · Configuración / Tasas BCV", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar rol", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Activar consultas", exact: true })).toHaveCount(0);
  await modules.getByRole("button", { name: "Auditoría", exact: true }).click();
  await expect(page.getByRole("table", { name: "Permisos de Auditoría", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Consultar · Auditoría / Eventos", exact: true })).toBeDisabled();
  await modules.getByRole("button", { name: "Ventas", exact: true }).click();
  await expect(page.getByRole("region", { name: "Permisos de Ventas", exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`seleccionar permisos no desplaza la tabla ni los controles a ${width}px`, async ({ page, environment }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openEditor(page, environment);
    const positions = () =>
      page
        .locator(
          ".access-permission-table, .access-permission-table tr, .access-permission-checkbox input, .access-role-editor .access-form-actions",
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
    await expect(page.getByRole("table", { name: "Permisos de Ventas", exact: true })).toBeVisible();
    const initial = await positions();
    const checkbox = page.getByRole("checkbox", { name: "Consultar · Ventas / Dashboard", exact: true });
    await checkbox.check();
    expect(await positions()).toEqual(initial);
    await checkbox.uncheck();
    expect(await positions()).toEqual(initial);
    const footer = page.locator(".access-role-editor .access-form-actions");
    const footerPosition = await footer.boundingBox();
    for (const name of ["Compras", "Clientes", "Configuración", "Acceso"]) {
      await page
        .getByRole("navigation", { name: "Módulos de permisos", exact: true })
        .getByRole("button", { name, exact: true })
        .click();
      expect(await footer.boundingBox()).toEqual(footerPosition);
    }
  });
}

test("el nombre general del rol conserva validación nativa fuera de los paneles", async ({ page, environment }) => {
  await openEditor(page, environment);
  await setPermission(page, "Consultar · Ventas / Dashboard");
  await page.getByRole("button", { name: "Guardar rol", exact: true }).click();
  const name = page.getByLabel("Nombre del rol", { exact: true });
  await expect(name).toBeFocused();
  expect(await name.evaluate((element) => element.validity.valueMissing)).toBe(true);
});
