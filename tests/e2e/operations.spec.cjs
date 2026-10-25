const { test, expect, login, openModule } = require("./fixtures.cjs");
const grant = (capability) => ({ capability, scope: "global" });

test("historial BCV distingue publicación futura, tasa vigente y fecha sin publicación", async ({
  page,
  environment,
}) => {
  await require("../support/rate-fixtures.cjs").seedRates(environment.db);
  await login(page, environment, await environment.seedUser({ permissions: [grant("rates.read")] }));
  await openModule(page, "Tasas", "Historial BCV");
  const history = page.getByRole("region", { name: "Historial BCV autorizado", exact: true });
  await expect(history.getByText(/^Última tasa vigente: 300/)).toBeVisible();
  await expect(history.getByText(/^Última tasa publicada: 310/)).toBeVisible();
  await history.getByLabel("Historial BCV desde", { exact: true }).fill("2026-01-01");
  await history.getByLabel("Historial BCV hasta", { exact: true }).fill("2026-01-03");
  await history.getByRole("button", { name: "Consultar historial BCV", exact: true }).click();
  await expect(history.getByRole("cell", { name: "201.1234", exact: true })).toBeVisible();
  await history.getByLabel("Fecha de tasa BCV", { exact: true }).fill("2026-01-03");
  await history.getByRole("button", { name: "Consultar tasa por fecha", exact: true }).click();
  await expect(
    history.getByText(
      "Tasa aplicable al 2026-01-03: 201.1234; fecha publicada: 2026-01-02; última publicación anterior.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("metadatos operativos no habilitan escritura ni filtran rutas o tokens del servidor", async ({
  page,
  environment,
}) => {
  await login(
    page,
    environment,
    await environment.seedUser({ permissions: [grant("backups.read"), grant("updates.read")] }),
  );
  await openModule(page, "Operación");
  const operations = page.getByRole("region", { name: "Operación autorizada del sistema", exact: true });
  await expect(operations.getByText("Respaldos registrados: 0", { exact: true })).toBeVisible();
  await expect(operations.getByText("Ejecución desde código fuente", { exact: true })).toBeVisible();
  await expect(operations.getByRole("button", { name: "Limpiar caché", exact: true })).toHaveCount(0);
  const data = await page.evaluate(async () => await (await fetch("/api/backups")).json());
  expect(data).not.toHaveProperty("directory");
  expect(data).not.toHaveProperty("controlToken");
});

test("limpieza real de caché exige confirmación del operador con MFA y deja auditoría", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({ enrolled: true, permissions: [grant("cache.clear")] });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await openModule(page, "Operación");
  const operations = page.getByRole("region", { name: "Operación autorizada del sistema", exact: true });
  await operations.getByLabel("Confirmar limpieza de caché", { exact: true }).check();
  await operations.getByRole("button", { name: "Limpiar caché", exact: true }).click();
  await expect(operations.getByText(/^Caché limpiada:/)).toBeVisible();
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
  await expect(operations.getByRole("region", { name: "Respaldos autorizados", exact: true })).toHaveCount(0);
});
