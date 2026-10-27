const { randomUUID } = require("node:crypto");
const { test, expect, login } = require("./fixtures.cjs");

async function openAudit(page, environment) {
  const reader = await environment.seedUser({ permissions: [{ capability: "audit.read", scope: "global" }] });
  const actor = await environment.seedUser();
  const target = await environment.seedUser();
  await environment.db("dmmarket_auth_users").where("id", actor.id).update({ display_name: "Ana Pérez" });
  await environment.db("dmmarket_auth_users").where("id", target.id).update({ display_name: "Lucía Torres" });
  const role = (await environment.db("dmmarket_auth_user_roles").where("user_id", actor.id).first()).role_id;
  await environment.db("dmmarket_auth_roles").where("id", role).update({ name: "Equipo de ventas" });
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
  await expect(report.getByRole("status").filter({ hasText: "27 eventos" })).toBeVisible();
  return { report, actor, target, role, reader };
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
  const { report, actor, target, role } = await openAudit(page, environment);
  await report.getByLabel("Actividad", { exact: true }).selectOption("auth.role_changed");
  await report.getByRole("button", { name: "Rol actualizado", exact: true }).first().click();
  const panel = page.getByRole("dialog", { name: "Detalle del evento", exact: true });
  await panel.getByText("Referencia técnica", { exact: true }).click();
  for (const text of ["Ana Pérez", "Lucía Torres", "Equipo de ventas", actor.id, target.id, role, "auth.role_changed"])
    await expect(panel.getByText(text, { exact: true })).toBeVisible();
  await expect(panel.getByText(/Revisión de permisos/)).toBeVisible();
  await expect(panel.getByText(/Los nombres corresponden a los registros actuales/)).toBeVisible();
  await expect(panel.getByRole("button", { name: /Guardar|Eliminar|Editar/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Ver actividad de esta persona", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Quitar filtro de responsable", exact: true })).toContainText(
    "Ana Pérez",
  );
  await report.getByRole("button", { name: "Quitar filtro de responsable", exact: true }).click();
  await expect(report.getByRole("button", { name: "Quitar filtro de responsable", exact: true })).toHaveCount(0);
});

test("eventos no catalogados conservan su código en el detalle y el filtro exacto", async ({ page, environment }) => {
  const { report } = await openAudit(page, environment);
  await report.getByRole("button", { name: "Evento del sistema", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Detalle del evento", exact: true });
  await panel.getByText("Referencia técnica", { exact: true }).click();
  await expect(panel.getByText("legacy.unknown_event", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Ver eventos de esta actividad", exact: true }).click();
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
  await expect(report.getByRole("status").filter({ hasText: "27 eventos" })).toBeVisible();
  await report.getByRole("button", { name: "Actualizar historial", exact: true }).click();
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
  const panel = page.getByRole("dialog", { name: "Detalle del evento", exact: true });
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((element) => element.getBoundingClientRect().width <= innerWidth)).toBe(true);
  await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(panel).toHaveCount(0);
});
