const { test: base, expect, login, openModule } = require("./fixtures.cjs");
const { startEnvironment } = require("../support/auth-environment.cjs");
const { seedSales } = require("../support/sales-fixtures.cjs");
const { seedReceivables, prepareReceivablesWrites } = require("../support/receivables-fixtures.cjs");
const test = base.extend({
  environment: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") throw new Error("Esta suite requiere Chrome.");
      const environment = await startEnvironment({ web: true });
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
  await page.getByRole("button", { name: "Cliente sintético", exact: true }).click();
  return user;
}
test.beforeEach(async ({ environment }) => {
  for (const table of ["cxc_cierres", "cxc_cruces", "cxc_operaciones", "cxc_movimientos", "dmmarket_receivables_locks"])
    await environment.db(table).del();
  await environment
    .db("cxc_documentos")
    .update({ SaldoActual: environment.db.raw("MontoOriginal"), Estatus: "PENDIENTE" });
});

async function payment(page, amount) {
  await page.getByRole("dialog").getByRole("button", { name: "Registrar abono", exact: true }).click();
  const operation = page.getByRole("form", { name: "Registrar abono", exact: true });
  await operation.getByRole("button", { name: "USD", exact: true }).click();
  await operation.getByLabel("Importe recibido", { exact: true }).fill(amount);
  await operation.getByLabel("Método", { exact: true }).selectOption("EFECTIVO");
  await operation.getByRole("button", { name: "Revisar abono", exact: true }).click();
  await expect(operation.getByRole("button", { name: "Confirmar abono", exact: true })).toBeVisible();
  return operation;
}
async function balance(environment, amount) {
  await expect
    .poll(async () =>
      Number(
        (
          await environment
            .db("cxc_documentos")
            .where("IdCliente", "C")
            .whereIn("IdDocumento", [1, 2])
            .sum("SaldoActual as total")
            .first()
        ).total,
      ),
    )
    .toBe(amount);
}

test("cartera original registra, cierra, reabre y anula con actor real y distribución completa", async ({
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
  const operation = await payment(page, "150");
  await operation.getByRole("button", { name: "Confirmar abono", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Abono registrado", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Listo", exact: true }).click();
  await balance(environment, 150);
  const row = await environment.db("cxc_operaciones").where("Tipo", "ABONO").first();
  expect(row.ActorId).toBe(user.id);
  expect(
    (await environment.db("cxc_cruces").orderBy("IdDocumento")).map((row) => [row.IdDocumento, row.MontoAplicado]),
  ).toEqual([
    [1, "100.0000"],
    [2, "50.0000"],
  ]);
  await page.getByRole("button", { name: "Ver desglose de factura 2", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar deuda de factura 2", exact: true }).click();
  const closure = page.getByRole("form", { name: "Cierre de deuda", exact: true });
  await closure.getByLabel("Motivo del cierre", { exact: true }).fill("Cierre manual E2E autorizado");
  await closure.getByRole("button", { name: "Revisar cierre", exact: true }).click();
  await closure.getByRole("button", { name: "Confirmar cierre", exact: true }).click();
  await balance(environment, 0);
  await page
    .getByRole("group", { name: "Facturas de la cuenta", exact: true })
    .getByRole("button", { name: "Todas", exact: true })
    .click();
  await page.getByRole("button", { name: "Ver desglose de factura 2", exact: true }).click();
  await page.getByRole("button", { name: "Reabrir cierre de factura 2", exact: true }).click();
  const reopen = page.getByRole("form", { name: "Reabrir cierre", exact: true });
  await reopen.getByLabel("Motivo", { exact: true }).pressSequentially("Reapertura E2E autorizada");
  await expect(reopen.getByLabel("Motivo", { exact: true })).toHaveValue("Reapertura E2E autorizada");
  const reviewed = page.waitForResponse((response) => response.url().includes("/api/receivables/C/preview"));
  await reopen.getByRole("button", { name: "Revisar operación", exact: true }).click();
  expect((await reviewed).status()).toBe(200);
  await reopen.getByRole("button", { name: "Confirmar reapertura", exact: true }).click();
  await balance(environment, 150);
  await page.getByRole("button", { name: /Ver detalles: Abono,/ }).click();
  await page.getByRole("button", { name: "Anular abono", exact: true }).click();
  const reversal = page.getByRole("form", { name: "Anulación de abono", exact: true });
  await reversal.getByLabel("Motivo de anulación", { exact: true }).fill("Anulación E2E autorizada");
  await reversal.getByRole("button", { name: "Revisar anulación", exact: true }).click();
  await reversal.getByRole("button", { name: "Confirmar anulación", exact: true }).click();
  await balance(environment, 300);
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

test("permiso exclusivo de abono deshabilita cierres y bloquea cancelación mientras confirma", async ({
  page,
  environment,
}) => {
  await enter(page, environment, [grant("receivables.read"), grant("receivables.payment")]);
  await page.getByRole("button", { name: "Ver desglose de factura 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cerrar deuda de factura 1", exact: true })).toBeDisabled();
  const operation = await payment(page, "5");
  const connection = await environment.db.client.acquireConnection();
  let locked = false;
  try {
    await environment.db.raw("LOCK TABLES cxc_documentos WRITE").connection(connection);
    locked = true;
    await operation.getByRole("button", { name: "Confirmar abono", exact: true }).click();
    await expect(operation.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
    await environment.db.raw("UNLOCK TABLES").connection(connection);
    locked = false;
    await expect(page.getByRole("heading", { name: "Abono registrado", exact: true })).toBeVisible();
    await balance(environment, 295);
  } finally {
    if (locked) await environment.db.raw("UNLOCK TABLES").connection(connection);
    await environment.db.client.releaseConnection(connection);
  }
});

test("abono original confirma identidad reciente sin perder formulario ni duplicar la operación", async ({
  page,
  environment,
}) => {
  const user = await enter(page, environment, [grant("receivables.read"), grant("receivables.payment")]);
  const used = await environment.token(user.secret);
  const operation = await payment(page, "5");
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", user.id)
    .update({ password_ms: Date.now() - 301000, mfa_ms: Date.now() - 301000 });
  await operation.getByRole("button", { name: "Confirmar abono", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirmar identidad", exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByLabel("Contraseña de reautenticación", { exact: true }).fill(user.password);
  await expect.poll(async () => await environment.token(user.secret), { timeout: 35000 }).not.toBe(used);
  await confirmation
    .getByLabel("Código MFA de reautenticación", { exact: true })
    .fill(await environment.token(user.secret));
  await confirmation.getByRole("button", { name: "Confirmar identidad", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Abono registrado", exact: true })).toBeVisible();
  await balance(environment, 295);
  expect(Number((await environment.db("cxc_operaciones").where("ActorId", user.id).count("* as n").first()).n)).toBe(1);
});

test("cartera sin permiso muestra un estado breve junto al registro bloqueado", async ({ page, environment }) => {
  await enter(page, environment, [grant("receivables.read")]);
  const account = page.getByRole("dialog");
  await expect(account.getByRole("status", { name: "Disponibilidad de abonos", exact: true })).toHaveText(
    "Sin permiso",
  );
  await expect(account.getByRole("button", { name: "Registrar abono", exact: true })).toBeDisabled();
});

test("esquema pendiente muestra solo lectura sin convertir tablas desde una consulta", async ({
  page,
  environment,
}) => {
  await environment.db.raw("ALTER TABLE cxc_cruces ENGINE=MyISAM");
  try {
    await enter(page, environment, [grant("receivables.read"), grant("receivables.payment")]);
    const account = page.getByRole("dialog");
    await expect(account.getByRole("status", { name: "Disponibilidad de abonos", exact: true })).toHaveText(
      "Solo lectura",
    );
    await expect(account.getByRole("button", { name: "Registrar abono", exact: true })).toBeDisabled();
    const [rows] = await environment.db.raw("SHOW TABLE STATUS LIKE 'cxc_cruces'");
    expect(rows[0].Engine).toBe("MyISAM");
  } finally {
    await environment.db.raw("ALTER TABLE cxc_cruces ENGINE=InnoDB");
  }
});

test("un fallo de disponibilidad ofrece reintento sin ocultar la cuenta", async ({ page, environment }) => {
  await page.route("**/api/receivables/status", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "No disponible." } }),
    }),
  );
  await enter(page, environment, [grant("receivables.read"), grant("receivables.payment")]);
  const account = page.getByRole("dialog");
  await expect(account.getByRole("status", { name: "Disponibilidad de abonos", exact: true })).toHaveText(
    "No disponible",
  );
  await page.unrouteAll({ behavior: "wait" });
  await account.getByRole("button", { name: "Reintentar disponibilidad", exact: true }).click();
  await expect(account.getByRole("button", { name: "Registrar abono", exact: true })).toBeEnabled();
  await expect(account.getByRole("status", { name: "Disponibilidad de abonos", exact: true })).toHaveCount(0);
});
