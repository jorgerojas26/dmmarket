const { randomUUID } = require("node:crypto");
const { test, expect, login, openModule } = require("./fixtures.cjs");

for (const width of [390, 1440]) {
  test(`Auditoría se abre desde el sidebar de Acceso y no desde el usermenu a ${width}px`, async ({
    page,
    environment,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const user = await environment.seedUser({
      permissions: [
        { capability: "audit.events.read" },
        { capability: "access.users.read" },
        { capability: "access.roles.read" },
      ],
    });
    await login(page, environment, user);
    await openModule(page, "Acceso");
    await expect(page.locator(".clients-sidebar").getByRole("button", { name: "Usuarios", exact: true })).toBeVisible();
    await expect(page.locator(".clients-sidebar").getByRole("button", { name: "Roles", exact: true })).toBeVisible();
    const audit = page.locator(".clients-sidebar").getByRole("button", { name: "Auditoría", exact: true });
    await expect(audit).toBeVisible();
    await audit.click();
    await expect(page).toHaveURL(`${environment.origin}/acceso#auditoria`);
    await expect(audit).toHaveClass(/active/);
    await expect(page.getByRole("heading", { name: "Auditoría", exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Módulos disponibles", exact: true })
        .getByRole("link", { name: "Auditoría", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".access-content .access-content")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Auditoría", exact: true })).toBeVisible();
    await page.locator(".clients-sidebar").getByRole("button", { name: "Roles", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible();
  });
}

test("lector exclusivo de auditoría entra a Acceso sin obtener administración y conserva enlaces anteriores", async ({
  page,
  environment,
}) => {
  await login(page, environment, await environment.seedUser({ permissions: [{ capability: "audit.events.read" }] }));
  await expect(page).toHaveURL(`${environment.origin}/acceso#auditoria`);
  await expect(page.locator(".clients-sidebar").getByRole("button", { name: /^(Usuarios|Roles)$/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Auditoría", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/auth/directory")).status)).toBe(403);
  await page.goto(`${environment.origin}/auditoria`);
  await expect(page).toHaveURL(`${environment.origin}/acceso#auditoria`);
  await expect(page.getByRole("heading", { name: "Auditoría", exact: true })).toBeVisible();
});

test("administrar roles no permite consultar auditoría ni solicitar sus datos", async ({ page, environment }) => {
  await login(page, environment, await environment.seedUser({ permissions: [{ capability: "access.roles.read" }] }));
  const requests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/audit") requests.push(request.url());
  });
  await page.goto(`${environment.origin}/acceso#auditoria`);
  await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible();
  await expect(page.locator(".clients-sidebar").getByRole("button", { name: "Auditoría", exact: true })).toHaveCount(0);
  await page.goto(`${environment.origin}/auditoria`);
  await expect(page.getByRole("heading", { name: "Acceso restringido", exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

async function openAudit(page, environment) {
  await environment.db("dmmarket_auth_events").delete();
  const reader = await environment.seedUser({ permissions: [{ capability: "audit.read", scope: "global" }] });
  const actor = await environment.seedUser();
  const target = await environment.seedUser();
  await environment.db("dmmarket_auth_users").where("id", actor.id).update({ display_name: "Ana Pérez" });
  await environment.db("dmmarket_auth_users").where("id", target.id).update({ display_name: "Lucía Torres" });
  const role = (await environment.db("dmmarket_auth_user_roles").where("user_id", actor.id).first()).role_id;
  const roleName = `Equipo de ventas ${role.slice(0, 8)}`;
  await environment.db("dmmarket_auth_roles").where("id", role).update({ name: roleName });
  const today = new Date().toISOString().slice(0, 10);
  await environment.db("dmmarket_auth_events").insert(
    Array.from({ length: 27 }, (_, index) => ({
      id: randomUUID(),
      actor_id: actor.id,
      target_user_id: target.id,
      target_role_id: role,
      action: index === 26 ? "legacy.unknown_event" : "auth.role_changed",
      outcome: index % 2 ? "failure" : "success",
      reason: `Revisión de permisos ${index + 1}`,
      occurred_ms: Date.parse(`${today}T00:00:00Z`) + index * 1000,
    })),
  );
  await login(page, environment, reader);
  await expect(page.getByRole("heading", { name: "Auditoría", exact: true })).toBeVisible();
  const report = page.getByRole("region", { name: "Consulta autorizada de auditoría", exact: true });
  await report.getByRole("searchbox", { name: "Buscar en el historial", exact: true }).fill("Lucía Torres");
  await expect(report.getByRole("table", { name: "Historial de actividad", exact: true })).toBeVisible();
  await expect(report.getByRole("row")).toHaveCount(21);
  return { report, actor, target, role, roleName, reader };
}

test("historial muestra nombres y actividades legibles con filtros y paginación reales", async ({
  page,
  environment,
}) => {
  const { report } = await openAudit(page, environment);
  const table = report.getByRole("table", { name: "Historial de actividad", exact: true });
  await expect(table.getByText("Ana Pérez", { exact: true })).toHaveCount(20);
  await expect(table.getByText("Rol actualizado", { exact: true }).first()).toBeVisible();
  await expect(report.getByText("1–20 de 27", { exact: true })).toBeVisible();
  await report.getByRole("button", { name: "Página siguiente", exact: true }).click();
  await expect(report.getByText("21–27 de 27", { exact: true })).toBeVisible();
  await report.getByLabel("Resultado", { exact: true }).selectOption("failure");
  await expect(report.getByText("1–13 de 13", { exact: true })).toBeVisible();
  await expect(table.getByText("Correcto", { exact: true })).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Página siguiente", exact: true })).toBeDisabled();
  await expect(page.getByLabel("ID del actor de auditoría", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/api/auth/directory")).status)).toBe(403);
});

test("detalle contextual conserva identificadores, motivo y nombres actuales sin habilitar edición", async ({
  page,
  environment,
}) => {
  const { report, actor, target, role, roleName } = await openAudit(page, environment);
  await report.getByLabel("Actividad", { exact: true }).selectOption("auth.role_changed");
  await report.getByRole("button", { name: "Rol actualizado", exact: true }).first().click();
  const detail = page.getByRole("region", { name: "Detalle del evento", exact: true });
  await expect(page).toHaveURL(/\/acceso\/auditoria\/[a-f0-9-]{36}$/);
  await detail.getByText("Referencia técnica", { exact: true }).click();
  for (const text of ["Ana Pérez", "Lucía Torres", roleName, actor.id, target.id, role, "auth.role_changed"])
    await expect(detail.getByText(text, { exact: true })).toBeVisible();
  await expect(detail.getByText(/Revisión de permisos/)).toBeVisible();
  await expect(detail.getByText(/Los nombres corresponden a los registros actuales/)).toBeVisible();
  await expect(detail.getByRole("button", { name: /Guardar|Eliminar|Editar/ })).toHaveCount(0);
  await detail.getByRole("button", { name: "Ver actividad de esta persona", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Quitar filtro de responsable", exact: true })).toContainText(
    "Ana Pérez",
  );
  await report.getByRole("button", { name: "Quitar filtro de responsable", exact: true }).click();
  await expect(report.getByRole("button", { name: "Quitar filtro de responsable", exact: true })).toHaveCount(0);
});

test("eventos no catalogados conservan su código en el detalle y el filtro exacto", async ({ page, environment }) => {
  const { report } = await openAudit(page, environment);
  await report.getByRole("button", { name: "Evento del sistema", exact: true }).click();
  const detail = page.getByRole("region", { name: "Detalle del evento", exact: true });
  await detail.getByText("Referencia técnica", { exact: true }).click();
  await expect(detail.getByText("legacy.unknown_event", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Ver eventos de esta actividad", exact: true }).click();
  await expect(report.getByText("1–1 de 1", { exact: true })).toBeVisible();
});

test("búsqueda vacía y error recuperable conservan filtros y un marco estable", async ({ page, environment }) => {
  const { report } = await openAudit(page, environment);
  await report.getByRole("searchbox", { name: "Buscar en el historial", exact: true }).fill("sin-coincidencias");
  await expect(report.getByRole("heading", { name: "No hay eventos que coincidan", exact: true })).toBeVisible();
  await page.route("**/api/auth/audit?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "No disponible." } }),
    }),
  );
  await report.getByRole("searchbox", { name: "Buscar en el historial", exact: true }).fill("Lucía Torres");
  await expect(report.getByRole("alert")).toContainText("No se pudo cargar la información.");
  await expect(report.getByRole("searchbox", { name: "Buscar en el historial", exact: true })).toHaveValue(
    "Lucía Torres",
  );
  await page.unrouteAll({ behavior: "wait" });
  await report.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(report.getByRole("table", { name: "Historial de actividad", exact: true })).toBeVisible();
});

test("Auditoría móvil mantiene filtros y detalle accesibles sin desbordar la página", async ({ page, environment }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { report } = await openAudit(page, environment);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await report
      .getByRole("table", { name: "Historial de actividad", exact: true })
      .evaluate((element) => element.scrollWidth <= element.parentElement.clientWidth),
  ).toBe(true);
  await report.locator(".date-range-trigger").click();
  const calendar = report.locator(".date-range-dropdown");
  expect(
    await calendar.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    }),
  ).toBe(true);
  await calendar.getByRole("button", { name: "Listo", exact: true }).click();
  await report.getByRole("button", { name: "Rol actualizado", exact: true }).first().click();
  const detail = page.getByRole("region", { name: "Detalle del evento", exact: true });
  await expect(detail).toBeVisible();
  expect(await detail.evaluate((element) => element.getBoundingClientRect().width <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await detail.getByRole("button", { name: "Volver a auditoría", exact: true }).click();
  await expect(report.getByRole("table", { name: "Historial de actividad", exact: true })).toBeVisible();
});

test("el detalle de un evento tiene URL propia y sobrevive a la recarga", async ({ page, environment }) => {
  await openAudit(page, environment);
  const event = await environment.db("dmmarket_auth_events").where("action", "legacy.unknown_event").first();
  await page.goto(`${environment.origin}/acceso/auditoria/${event.id}`);
  const detail = page.getByRole("region", { name: "Detalle del evento", exact: true });
  await expect(detail.getByRole("heading", { name: "Evento del sistema", exact: true })).toBeVisible();
  await page.reload();
  await expect(detail).toBeVisible();
  await expect(page).toHaveURL(`${environment.origin}/acceso/auditoria/${event.id}`);
  await detail.getByRole("button", { name: "Volver a auditoría", exact: true }).click();
  await expect(page).toHaveURL(`${environment.origin}/acceso#auditoria`);
  await expect(page.getByRole("table", { name: "Historial de actividad", exact: true })).toBeVisible();
});
