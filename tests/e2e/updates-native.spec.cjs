const { test: base, expect, login, openModule } = require("./fixtures.cjs");
const { startEnvironment, until } = require("../support/auth-environment.cjs");
const { buildNativeServer } = require("../support/native-server.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const binary = buildNativeServer();
      let environment;
      try {
        environment = await startEnvironment({
          web: true,
          service: true,
          executablePath: binary.executablePath,
          updateSource: { executablePath: binary.executablePath },
        });
        await use(environment);
      } finally {
        await environment?.close();
        binary.close();
      }
    },
    { scope: "worker" },
  ],
});

test("actualizador autorizado descarga SHA válido, reemplaza ejecutable aislado y conserva acceso al reiniciar", async ({
  page,
  environment,
}) => {
  const user = await environment.seedUser({
    enrolled: true,
    permissions: [
      { capability: "updates.read", scope: "global" },
      { capability: "updates.execute", scope: "global" },
    ],
  });
  await login(page, environment, user);
  await page.getByLabel("Código MFA", { exact: true }).fill(await environment.token(user.secret));
  await page.getByRole("button", { name: "Verificar código", exact: true }).click();
  await openModule(page, "Operación");
  const update = page.getByRole("region", { name: "Estado autorizado de actualización", exact: true });
  await expect(update.getByText("Ejecutable compilado", { exact: true })).toBeVisible();
  await update.getByRole("button", { name: "Buscar actualizaciones", exact: true }).click();
  await expect(update.getByText("Última versión publicada: 999.0.0", { exact: true })).toBeVisible();
  await update.getByLabel("Confirmar descarga de actualización", { exact: true }).check();
  await update.getByRole("button", { name: "Descargar actualización verificada", exact: true }).click();
  await update.getByLabel("Confirmar aplicación y reinicio", { exact: true }).check();
  await update.getByRole("button", { name: "Aplicar actualización y reiniciar", exact: true }).click();
  await until(() => environment.server.exitCode === 0);
  await environment.restartServer();
  await page.reload();
  await expect(page.getByRole("status", { name: "Usuario conectado", exact: true })).toHaveText(user.username);
  const session = await page.evaluate(async () => await (await fetch("/api/auth/session")).json());
  expect(session.user.id).toBe(user.id);
  expect(session.stage).toBe("ready");
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ actor_id: user.id, action: "updates.apply_completed", outcome: "success" })
      .first(),
  ).toBeTruthy();
});
