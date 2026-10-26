const { test: base, expect, login, openModule } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { seedRates } = require("../support/rate-fixtures.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true, rateSource: true });
      try {
        await seedRates(environment.db);
        await environment.db.raw("ALTER TABLE bcv_tasas ENGINE=InnoDB");
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});
const grant = (capability) => ({ capability, scope: "global" });
async function enter(page, environment, permissions) {
  const user = await environment.seedUser({ permissions, enrolled: true });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await openModule(
    page,
    "Configuración",
    permissions.some((grant) => grant.capability === "rates.read") ? "Tasas BCV" : "Respaldos",
  );
  return user;
}

test("sincronización usa HTTP/XLS reales y no modifica referencia de ventas", async ({ page, environment }) => {
  const user = await enter(page, environment, [grant("rates.read"), grant("rates.sync")]);
  const operations = page.getByRole("region", { name: "Configuración", exact: true });
  await operations.getByRole("button", { name: "Consultar BCV", exact: true }).click();
  await expect(operations.getByText("Se actualizaron 1 tasas.", { exact: true })).toBeVisible({ timeout: 30000 });
  expect(environment.rateSource.requests()).toBeGreaterThan(0);
  await expect(operations.getByText("Bs 400,00", { exact: true }).first()).toBeVisible();
  expect(Number((await environment.db("divisas").where("Simbolo", "BsS").first()).Cambio)).toBe(42.125);
  expect(
    await environment.db("dmmarket_auth_events").where({ actor_id: user.id, action: "rates.sync_completed" }).first(),
  ).toBeTruthy();
});

test("respaldo completo con cliente MySQL real se guarda sin entregar ruta o contenido al navegador", async ({
  page,
  environment,
}) => {
  const user = await enter(page, environment, [grant("backups.read"), grant("backups.create")]);
  const operations = page.getByRole("region", { name: "Configuración", exact: true });
  await operations.getByRole("button", { name: "Crear respaldo ahora", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar respaldo", exact: true }).click();
  await expect(operations.getByRole("table")).toContainText(".sql", { timeout: 30000 });
  const result = await page.evaluate(async () => await (await fetch("/api/backups")).json());
  expect(result.lastRequest.actorId).toBe(user.id);
  expect(result).not.toHaveProperty("directory");
  expect(result).not.toHaveProperty("controlToken");
  expect(result.backups[0].name).toContain(result.lastRequest.operationId);
});
