const { test, expect, login, openModule } = require("./fixtures.cjs");
const grant = (capability) => ({ capability, scope: "global" });

test("panel BCV original distingue publicación futura, tasa vigente y día sin publicación", async ({
  page,
  environment,
}) => {
  await require("../support/rate-fixtures.cjs").seedRates(environment.db);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Caracas" }).format(new Date());
  const publication = new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10),
    requested = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  await environment
    .db("bcv_tasas")
    .insert({ Fecha: publication, Compra: 200.1234, Venta: 201.1234, Actualizado: `${publication} 12:00:00` });
  await login(page, environment, await environment.seedUser({ permissions: [grant("rates.read")] }));
  await openModule(page, "Configuración", "Tasas BCV");
  const panel = page.getByRole("region", { name: "Configuración", exact: true });
  await expect(panel.locator(".rates-card").filter({ hasText: "Última tasa publicada" })).toContainText("310,00");
  await expect(panel.getByText("Aplica desde", { exact: false })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Consultar BCV", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Fecha de la tasa", exact: true }).click();
  const date = new Date(`${requested}T00:00:00Z`);
  await panel.locator(".rdrYearPicker select").selectOption(String(date.getUTCFullYear()));
  await panel.locator(".rdrMonthPicker select").selectOption(String(date.getUTCMonth()));
  await panel
    .locator("button.rdrDay:not(.rdrDayPassive)")
    .filter({ has: page.getByText(String(date.getUTCDate()), { exact: true }) })
    .click();
  await expect(panel.locator(".rates-summary").getByText(/No se publicó tasa el/)).toBeVisible();
  await expect(panel.getByText("Bs 201,12", { exact: true })).toBeVisible();
  const history = await page.evaluate(
    async () => await (await fetch("/api/currency_rates/bcv?from=2026-01-01&to=2026-01-03")).json(),
  );
  expect(history.map((row) => row.tasa)).toEqual([200.1234, 201.1234]);
});

test("Configuración original de sólo lectura no habilita escrituras ni revela rutas, tokens o claves", async ({
  page,
  environment,
}) => {
  await login(
    page,
    environment,
    await environment.seedUser({ permissions: [grant("backups.read"), grant("updates.read")] }),
  );
  await openModule(page, "Configuración", "Respaldos");
  const panel = page.getByRole("region", { name: "Configuración", exact: true });
  await expect(panel.getByText("No hay respaldos exitosos todavía.", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Crear respaldo ahora", exact: true })).toBeDisabled();
  const observed = await page.evaluate(async () => ({
    backup: await (await fetch("/api/backups")).json(),
    drive: await (await fetch("/api/backups/drive")).json(),
  }));
  expect(observed.backup).not.toHaveProperty("directory");
  expect(observed.backup).not.toHaveProperty("controlToken");
  expect(observed.drive).not.toHaveProperty("controlToken");
  expect(observed.drive.localAccess).toBe(false);
  await expect(panel.getByRole("button", { name: "Conectar con Google", exact: true })).toBeDisabled();
});

test("limpieza de caché usa sesión y MFA reales sin conservar una pantalla de operación sustituta", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({ enrolled: true, permissions: [grant("cache.clear")] });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await expect(page.getByRole("link", { name: "Mi cuenta", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Operación", exact: true })).toHaveCount(0);
  const statuses = await page.evaluate(async () => {
    const session = await (await fetch("/api/auth/session")).json();
    const send = (confirmed) =>
      fetch("/api/cache/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": session.csrfToken },
        body: JSON.stringify({ confirmed }),
      });
    const denied = await send(false);
    const allowed = await send(true);
    return [denied.status, allowed.status, await allowed.json()];
  });
  expect(statuses[0]).toBe(400);
  expect(statuses[1]).toBe(200);
  expect(statuses[2].cleared).toBe(true);
  expect(
    Number(
      (
        await environment
          .db("dmmarket_auth_events")
          .where({ actor_id: user.id, action: "cache.clear_completed" })
          .count("* as n")
          .first()
      ).n,
    ),
  ).toBe(1);
});
