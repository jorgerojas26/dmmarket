const { test: base, expect, login, openModule } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedReceivables, prepareReceivablesWrites } = require("../support/receivables-fixtures.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true, receivablesWrites: true });
      try {
        await seedSales(environment.db);
        await seedReceivables(environment.db);
        await prepareReceivablesWrites(environment.db);
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
  await openModule(page, "Cartera");
  await page.getByRole("button", { name: "Abrir cuenta C", exact: true }).click();
  return user;
}
test.beforeEach(async ({ environment }) => {
  for (const table of ["cxc_cierres", "cxc_cruces", "cxc_operaciones", "cxc_movimientos", "dmmarket_receivables_locks"])
    await environment.db(table).del();
  await environment
    .db("cxc_documentos")
    .update({ SaldoActual: environment.db.raw("MontoOriginal"), Estatus: "PENDIENTE" });
});

test("cobranza registra, cierra, reabre y anula con usuario real y distribución completa", async ({
  page,
  environment,
}) => {
  const user = await enter(page, environment, [
    grant("receivables.read"),
    grant("receivables.payment"),
    grant("receivables.close"),
    grant("receivables.reopen"),
    grant("receivables.void"),
  ]);
  const account = page.getByRole("region", { name: "Cuenta de cobranza autorizada", exact: true });
  await account.getByRole("button", { name: "Registrar abono", exact: true }).click();
  const operation = page.getByRole("region", { name: "Operación autorizada de cobranza", exact: true });
  await operation.getByLabel("Importe del abono", { exact: true }).fill("150");
  await operation.getByRole("button", { name: "Previsualizar abono", exact: true }).click();
  await expect(operation.getByText("Saldo después de confirmar (USD): 150.0000", { exact: true })).toBeVisible();
  await operation.getByRole("button", { name: "Confirmar abono", exact: true }).click();
  await expect(account.getByText("Saldo completo del cliente (USD): 150.0000", { exact: true })).toBeVisible();
  const row = await environment.db("cxc_operaciones").where("Tipo", "ABONO").first();
  expect(row.ActorId).toBe(user.id);
  expect(
    (await environment.db("cxc_cruces").orderBy("IdDocumento")).map((row) => [row.IdDocumento, row.MontoAplicado]),
  ).toEqual([
    [1, "100.0000"],
    [2, "50.0000"],
  ]);
  await account.getByRole("button", { name: "Cerrar deuda 2", exact: true }).click();
  await operation
    .getByLabel("Motivo de la operación de cobranza", { exact: true })
    .fill("Cierre manual E2E autorizado");
  await operation.getByRole("button", { name: "Previsualizar cierre", exact: true }).click();
  await operation.getByRole("button", { name: "Confirmar cierre", exact: true }).click();
  await expect(account.getByText("Saldo completo del cliente (USD): 0.0000", { exact: true })).toBeVisible();
  await account.getByLabel("Documentos de cobranza", { exact: true }).selectOption("all");
  await account.getByRole("button", { name: "Reabrir deuda 2", exact: true }).click();
  await operation.getByLabel("Motivo de la operación de cobranza", { exact: true }).fill("Reapertura E2E autorizada");
  await operation.getByRole("button", { name: "Previsualizar reapertura", exact: true }).click();
  await operation.getByRole("button", { name: "Confirmar reapertura", exact: true }).click();
  await expect(account.getByText("Saldo completo del cliente (USD): 150.0000", { exact: true })).toBeVisible();
  const movement = JSON.parse(row.Datos).movementId;
  await account.getByRole("button", { name: `Anular abono ${movement}`, exact: true }).click();
  await operation.getByLabel("Motivo de la operación de cobranza", { exact: true }).fill("Anulación E2E autorizada");
  await operation.getByRole("button", { name: "Previsualizar anulación", exact: true }).click();
  await operation.getByRole("button", { name: "Confirmar anulación", exact: true }).click();
  await expect(account.getByText("Saldo completo del cliente (USD): 300.0000", { exact: true })).toBeVisible();
  expect(
    Number(
      (
        await environment
          .db("dmmarket_auth_events")
          .where("actor_id", user.id)
          .where("action", "like", "receivables.%")
          .count("* as n")
          .first()
      ).n,
    ),
  ).toBe(4);
});

test("permiso exclusivo de abono no muestra cierres y bloquea cancelación mientras confirma", async ({
  page,
  environment,
}) => {
  await enter(page, environment, [grant("receivables.read"), grant("receivables.payment")]);
  const account = page.getByRole("region", { name: "Cuenta de cobranza autorizada", exact: true });
  await expect(account.getByRole("button", { name: "Cerrar deuda 1", exact: true })).toHaveCount(0);
  await account.getByRole("button", { name: "Registrar abono", exact: true }).click();
  const operation = page.getByRole("region", { name: "Operación autorizada de cobranza", exact: true });
  await operation.getByLabel("Importe del abono", { exact: true }).fill("5");
  await operation.getByRole("button", { name: "Previsualizar abono", exact: true }).click();
  await expect(operation.getByRole("button", { name: "Confirmar abono", exact: true })).toBeVisible();
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES cxc_documentos WRITE").connection(connection);
    locked = true;
    await operation.getByRole("button", { name: "Confirmar abono", exact: true }).click();
    await expect(operation.getByRole("button", { name: "Cancelar operación de cobranza", exact: true })).toBeDisabled();
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(account.getByText("Saldo completo del cliente (USD): 295.0000", { exact: true })).toBeVisible();
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
  }
});
