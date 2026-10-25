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
  await openModule(page, "Operación");
  const panel = page.getByRole("region", { name: "Estado autorizado de actualización", exact: true });
  await panel.getByRole("button", { name: "Buscar actualizaciones", exact: true }).click();
  await expect(panel.getByText("Última versión publicada: 999.0.0", { exact: true })).toBeVisible();
  await expect(panel.getByText("Release sintética de integración", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Consultar historial de versiones", exact: true }).click();
  await expect(panel.getByRole("list", { name: "Historial de versiones publicadas", exact: true })).toContainText(
    "999.0.0",
  );
  await expect(panel.getByRole("button", { name: "Descargar actualización verificada", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Aplicar actualización y reiniciar", exact: true })).toHaveCount(0);
  expect(environment.updateSource.requests()).toBeGreaterThanOrEqual(2);
});
