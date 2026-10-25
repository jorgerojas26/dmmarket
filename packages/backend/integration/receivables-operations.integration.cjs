const { randomUUID } = require("node:crypto");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedReceivables, prepareReceivablesWrites } = require("../../../tests/support/receivables-fixtures.cjs");
let environment;
let operator;
const grant = (capability) => ({ capability, scope: "global" });
const payment = (amount = "150") => ({
  type: "payment",
  amount,
  currency: "USD",
  date: "2026-01-10",
  method: "EFECTIVO",
});
async function actor(permissions) {
  const user = await environment.seedUser({ permissions, enrolled: true });
  const client = environment.client();
  await client.login(user);
  expect(
    (await client.request("/api/auth/mfa", { method: "POST", body: { token: await environment.token(user.secret) } }))
      .status,
  ).toBe(200);
  return { user, client };
}
async function preview(who, payload, id = "C") {
  const result = await who.client.request(`/api/receivables/${id}/preview`, { method: "POST", body: payload });
  expect(result.status).toBe(200);
  return result.body;
}
async function run(who, payload, id = "C") {
  const plan = await preview(who, payload, id);
  const body = { ...payload, requestId: randomUUID(), snapshot: plan.snapshot };
  return {
    response: await who.client.request(`/api/receivables/${id}/operations`, { method: "POST", body }),
    body,
    plan,
  };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true, receivablesWrites: true });
  await seedSales(environment.db);
  await seedReceivables(environment.db);
  await prepareReceivablesWrites(environment.db);
  operator = await actor([
    grant("receivables.read"),
    grant("receivables.payment"),
    grant("receivables.void"),
    grant("receivables.close"),
    grant("receivables.reopen"),
  ]);
});
afterAll(async () => {
  await environment?.close();
});
beforeEach(async () => {
  for (const table of ["cxc_cierres", "cxc_cruces", "cxc_operaciones", "cxc_movimientos", "dmmarket_receivables_locks"])
    await environment.db(table).del();
  await environment
    .db("cxc_documentos")
    .update({ SaldoActual: environment.db.raw("MontoOriginal"), Estatus: "PENDIENTE" });
});

test("esquema validado y abono comparten transacción, usuario real e histórico entre vendedores", async () => {
  const status = await operator.client.request("/api/receivables/status");
  expect(status.body.writesAvailable).toBe(true);
  const { response, body } = await run(operator, payment());
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    actorId: operator.user.id,
    applied: "150.0000",
    excess: "0.0000",
    balanceAfter: "150.0000",
  });
  expect(response.body.applications.map((row) => [row.id, row.amount])).toEqual([
    [1, "100.0000"],
    [2, "50.0000"],
  ]);
  const row = await environment.db("cxc_operaciones").where("IdOperacion", body.requestId).first();
  expect(row.ActorId).toBe(operator.user.id);
  expect(JSON.parse(row.Datos).actorId).toBe(operator.user.id);
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ actor_id: operator.user.id, action: "receivables.payment", reason: body.requestId })
      .first(),
  ).toBeTruthy();
});

test("repetición idempotente no crea un segundo cobro y permiso se verifica antes del replay", async () => {
  const { response, body } = await run(operator, payment("50"));
  expect(response.status).toBe(200);
  const again = await operator.client.request("/api/receivables/C/operations", { method: "POST", body });
  expect(again.status).toBe(200);
  expect(again.body).toEqual(response.body);
  expect(Number((await environment.db("cxc_movimientos").count("* as n").first()).n)).toBe(1);
  const readOnly = await actor([grant("receivables.read")]);
  expect((await readOnly.client.request("/api/receivables/C/operations", { method: "POST", body })).status).toBe(403);
  const another = await actor([grant("receivables.read"), grant("receivables.payment")]);
  expect((await another.client.request("/api/receivables/C/operations", { method: "POST", body })).status).toBe(409);
});

test("actor enviado por cliente y CSRF incorrecto no alteran el saldo", async () => {
  const payload = payment("10");
  expect(
    (
      await operator.client.request("/api/receivables/C/preview", {
        method: "POST",
        body: { ...payload, actorId: randomUUID() },
      })
    ).status,
  ).toBe(400);
  const plan = await preview(operator, payload);
  const body = { ...payload, snapshot: plan.snapshot, requestId: randomUUID() };
  expect(
    (await operator.client.request("/api/receivables/C/operations", { method: "POST", body, csrf: "invalid" })).status,
  ).toBe(403);
  expect((await environment.db("cxc_documentos").where("IdDocumento", 1).first()).SaldoActual).toBe("100.0000");
});

test("cierres, reapertura y anulación conservan saldo y requieren permisos separados", async () => {
  const paid = await run(operator, payment("30"));
  expect(paid.response.status).toBe(200);
  const closed = await run(operator, { type: "close", id: 1, reason: "Cierre sintético conciliado" });
  expect(closed.response.status).toBe(200);
  expect((await environment.db("cxc_documentos").where("IdDocumento", 1).first()).SaldoActual).toBe("0.0000");
  const reopened = await run(operator, { type: "reopen", id: 1, reason: "Reabrir cierre de prueba" });
  expect(reopened.response.status).toBe(200);
  expect((await environment.db("cxc_documentos").where("IdDocumento", 1).first()).SaldoActual).toBe("70.0000");
  const reversed = await run(operator, {
    type: "void",
    id: paid.response.body.movementId,
    reason: "Anular abono sintético",
  });
  expect(reversed.response.status).toBe(200);
  expect((await environment.db("cxc_documentos").where("IdDocumento", 1).first()).SaldoActual).toBe("100.0000");
  const paymentOnly = await actor([grant("receivables.read"), grant("receivables.payment")]);
  for (const type of ["close", "reopen", "void"])
    expect(
      (
        await paymentOnly.client.request("/api/receivables/C/preview", {
          method: "POST",
          body: { type, id: 1, reason: "Sin autorización" },
        })
      ).status,
    ).toBe(403);
});

test("dos confirmaciones concurrentes no aplican dos veces una misma previsualización", async () => {
  const payload = payment("150");
  const plan = await preview(operator, payload);
  const results = await Promise.all(
    [1, 2].map(() =>
      operator.client.request("/api/receivables/C/operations", {
        method: "POST",
        body: { ...payload, snapshot: plan.snapshot, requestId: randomUUID() },
      }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(Number((await environment.db("cxc_movimientos").count("* as n").first()).n)).toBe(1);
});

test("fallo de auditoría revierte abono, cruces, operación y saldos", async () => {
  const payload = payment("25");
  const plan = await preview(operator, payload);
  await environment.db.schema.renameTable("dmmarket_auth_events", "held_auth_events");
  try {
    const result = await operator.client.request("/api/receivables/C/operations", {
      method: "POST",
      body: { ...payload, snapshot: plan.snapshot, requestId: randomUUID() },
    });
    expect(result.status).toBe(503);
    for (const table of ["cxc_movimientos", "cxc_cruces", "cxc_operaciones"])
      expect(Number((await environment.db(table).count("* as n").first()).n)).toBe(0);
    expect((await environment.db("cxc_documentos").where("IdDocumento", 1).first()).SaldoActual).toBe("100.0000");
  } finally {
    await environment.db.schema.renameTable("held_auth_events", "dmmarket_auth_events");
  }
});

test("sin motor transaccional no hay previsualización operativa ni escritura y no se convierte automáticamente", async () => {
  await environment.db.raw("ALTER TABLE cxc_cruces ENGINE=MyISAM");
  try {
    const status = await operator.client.request("/api/receivables/status");
    expect(status.body.writesAvailable).toBe(false);
    expect(
      (await operator.client.request("/api/receivables/C/preview", { method: "POST", body: payment("5") })).status,
    ).toBe(503);
    expect(Number((await environment.db("cxc_movimientos").count("* as n").first()).n)).toBe(0);
  } finally {
    await environment.db.raw("ALTER TABLE cxc_cruces ENGINE=InnoDB");
  }
});

test("reauth vencida y reversión de migración no eliminan atribución ni autorizan mutaciones", async () => {
  const who = await actor([grant("receivables.read"), grant("receivables.payment")]);
  const payload = payment("5");
  const plan = await preview(who, payload);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", who.user.id)
    .update({ password_ms: Date.now() - 300001 });
  expect(
    (
      await who.client.request("/api/receivables/C/operations", {
        method: "POST",
        body: { ...payload, snapshot: plan.snapshot, requestId: randomUUID() },
      })
    ).status,
  ).toBe(403);
  expect((await run(operator, payment("5"))).response.status).toBe(200);
  await expect(require("../migrations/20261026_add_receivables_actor").down(environment.db)).rejects.toThrow(
    "atribución",
  );
});

test("abono en bolívares guarda la tasa indicada y no usa REF actual para un día pasado", async () => {
  const payload = { ...payment("100"), currency: "BsS" };
  expect((await operator.client.request("/api/receivables/C/preview", { method: "POST", body: payload })).status).toBe(
    400,
  );
  const result = await run(operator, { ...payload, rate: "2.000000" });
  expect(result.response.status).toBe(200);
  expect(result.response.body).toMatchObject({
    rate: "2.000000",
    rateSource: "MANUAL",
    base: "50.0000",
    actorId: operator.user.id,
  });
  expect((await environment.db("cxc_movimientos").first()).TasaCambio).toBe("2.000000");
});

test("escrituras deshabilitadas por defecto aunque el esquema y el operador estén preparados", async () => {
  const disabled = await startEnvironment({ web: true });
  try {
    await seedSales(disabled.db);
    await seedReceivables(disabled.db);
    await prepareReceivablesWrites(disabled.db);
    const user = await disabled.seedUser({
      permissions: [grant("receivables.read"), grant("receivables.payment")],
      enrolled: true,
    });
    const client = disabled.client();
    await client.login(user);
    expect(
      (await client.request("/api/auth/mfa", { method: "POST", body: { token: await disabled.token(user.secret) } }))
        .status,
    ).toBe(200);
    expect((await client.request("/api/receivables/status")).body.writesAvailable).toBe(false);
    expect((await client.request("/api/receivables/C/preview", { method: "POST", body: payment("5") })).status).toBe(
      503,
    );
    expect(Number((await disabled.db("cxc_movimientos").count("* as n").first()).n)).toBe(0);
  } finally {
    await disabled.close();
  }
});
