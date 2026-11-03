const { test: base, expect, login, openModule } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true, updateSource: true });
      try {
        await use(environment);
      } finally {
        await environment.close();
      }
    },
    { scope: "worker" },
  ],
});

test("consulta de releases usa HTTP real sin conceder instalación ni ejecución desde código fuente", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({ permissions: [{ capability: "updates.read", scope: "global" }] });
  await login(page, environment, user);
  await openModule(page, "Configuración", "Acerca de");
  const panel = page.getByRole("region", { name: "Configuración", exact: true });
  await panel.getByRole("button", { name: "Buscar actualizaciones", exact: true }).click();
  await expect(panel.getByText("Versión 999.0.0 disponible", { exact: true })).toBeVisible();
  await panel.getByText("Notas de la versión", { exact: true }).first().click();
  await expect(panel.getByText("Release sintética de integración", { exact: false }).first()).toBeVisible();
  await expect(panel.locator(".configuracion-about__history")).toContainText("999.0.0");
  await expect(panel.getByRole("button", { name: "Descargar actualización", exact: true })).toBeDisabled();
  expect(environment.updateSource.requests()).toBeGreaterThanOrEqual(2);
});
