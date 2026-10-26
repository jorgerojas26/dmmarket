const { randomUUID } = require("node:crypto");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { seedSales } = require("../../../tests/support/sales-fixtures.cjs");
const { seedCommissions, prepareCommissionWrites } = require("../../../tests/support/commission-fixtures.cjs");
let environment;
let operator;
const grant = (capability, scope = "global") => ({ capability, scope });
const input = (rate = "15.2500") => ({ commissionInfo: { G: rate }, reason: "Cambio sintético autorizado" });
async function actor(permissions, env = environment) {
  const user = await env.seedUser({ permissions, enrolled: true });
  await env.db("dmmarket_auth_user_sellers").insert({ user_id: user.id, seller_id: "A" });
  const client = env.client();
  await client.login(user);
  expect(
    (await client.request("/api/auth/mfa", { method: "POST", body: { token: await env.token(user.secret) } })).status,
  ).toBe(200);
  return { client, user };
}
async function preview(who, payload) {
  const result = await who.client.request("/api/employees/commissionInfo/A/preview", { method: "POST", body: payload });
  expect(result.status).toBe(200);
  return result.body;
}
async function run(who, payload) {
  const plan = await preview(who, payload);
  const body = { ...payload, requestId: randomUUID(), snapshot: plan.snapshot };
  return { response: await who.client.request("/api/employees/commissionInfo/A", { method: "PUT", body }), body };
}
beforeAll(async () => {
  environment = await startEnvironment({ web: true });
  await seedSales(environment.db);
  await seedCommissions(environment.db);
  await prepareCommissionWrites(environment.db);
  operator = await actor([grant("commissions.read", "assigned"), grant("commissions.update"), grant("sales.read")]);
});
afterAll(async () => {
  await environment?.close();
});
beforeEach(async () => {
  await environment.db("dmmarket_commission_operations").del();
  await environment.db("dmmarket_commission_locks").del();
  await environment.db("vendedor_comisiones").where({ vendedorId: "A", grupoId: "G" }).update({ comision: "10.0000" });
});

test("cambia porcentajes actuales con actor, valores anterior/nuevo y auditoría sin alterar captura histórica", async () => {
  expect((await operator.client.request("/api/employees/commissionInfo/A/status")).body.writesAvailable).toBe(true);
  const { response, body } = await run(operator, input());
  expect(response.status).toBe(200);
  expect(response.body.changes).toEqual([{ groupId: "G", after: "15.2500", before: "10.0000" }]);
  expect(response.body.actorId).toBe(operator.user.id);
  expect((await environment.db("vendedor_comisiones").where({ vendedorId: "A", grupoId: "G" }).first()).comision).toBe(
    "15.2500",
  );
  expect(
    Number(
      (await environment.db("fact_vendedor_comisiones").where({ masterfactId: "COM-A", grupoId: "G" }).first())
        .comision,
    ),
  ).toBe(10);
  const row = await environment.db("dmmarket_commission_operations").where("id", body.requestId).first();
  expect(row.actor_id).toBe(operator.user.id);
  expect((typeof row.data === "string" ? JSON.parse(row.data) : row.data).changes[0].before).toBe("10.0000");
  expect(
    await environment
      .db("dmmarket_auth_events")
      .where({ action: "commissions.updated", actor_id: operator.user.id, reason: body.requestId })
      .first(),
  ).toBeTruthy();
});

test("edición global no amplía lectura asignada y actores no autorizados no recuperan replay", async () => {
  const { response, body } = await run(operator, input());
  expect(response.status).toBe(200);
  expect((await operator.client.request("/api/employees/commissionInfo/A", { method: "PUT", body })).body).toEqual(
    response.body,
  );
  expect(
    (await operator.client.request("/api/employees/commissionInfo/B/preview", { method: "POST", body: input() }))
      .status,
  ).toBe(403);
  const readOnly = await actor([grant("commissions.read")]);
  expect((await readOnly.client.request("/api/employees/commissionInfo/A", { method: "PUT", body })).status).toBe(403);
  const other = await actor([grant("commissions.read"), grant("commissions.update")]);
  expect((await other.client.request("/api/employees/commissionInfo/A", { method: "PUT", body })).status).toBe(409);
  expect(Number((await environment.db("dmmarket_commission_operations").count("* as n").first()).n)).toBe(1);
});

test("validaciones decimales, grupos y actor falsificado no cambian tasas", async () => {
  for (const value of ["100.0001", "-1", "1e1", "10.00001", null, {}])
    expect(
      (await operator.client.request("/api/employees/commissionInfo/A/preview", { method: "POST", body: input(value) }))
        .status,
    ).toBe(400);
  expect(
    (
      await operator.client.request("/api/employees/commissionInfo/A/preview", {
        method: "POST",
        body: { ...input(), actorId: randomUUID() },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await operator.client.request("/api/employees/commissionInfo/A/preview", {
        method: "POST",
        body: { ...input(), commissionInfo: { MISSING: "5" } },
      })
    ).status,
  ).toBe(400);
  expect((await environment.db("vendedor_comisiones").where({ vendedorId: "A", grupoId: "G" }).first()).comision).toBe(
    "10.0000",
  );
  expect((await run(operator, input("0"))).response.body.changes[0].after).toBe("0.0000");
});

test("dos cambios concurrentes no confirman contra un porcentaje anterior obsoleto", async () => {
  const one = input("20");
  const two = input("30");
  const [a, b] = await Promise.all([preview(operator, one), preview(operator, two)]);
  const results = await Promise.all(
    [
      [one, a],
      [two, b],
    ].map(([payload, plan]) =>
      operator.client.request("/api/employees/commissionInfo/A", {
        method: "PUT",
        body: { ...payload, requestId: randomUUID(), snapshot: plan.snapshot },
      }),
    ),
  );
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(Number((await environment.db("dmmarket_commission_operations").count("* as n").first()).n)).toBe(1);
});

test("un error de auditoría revierte todos los grupos y el registro de operación", async () => {
  const payload = { ...input(), commissionInfo: { G: "12", "COM-G2": "5" } };
  const plan = await preview(operator, payload);
  await environment.db.schema.renameTable("dmmarket_auth_events", "held_auth_events");
  try {
    const result = await operator.client.request("/api/employees/commissionInfo/A", {
      method: "PUT",
      body: { ...payload, requestId: randomUUID(), snapshot: plan.snapshot },
    });
    expect(result.status).toBe(503);
    expect(
      (await environment.db("vendedor_comisiones").where({ vendedorId: "A", grupoId: "G" }).first()).comision,
    ).toBe("10.0000");
    expect(
      await environment.db("vendedor_comisiones").where({ vendedorId: "A", grupoId: "COM-G2" }).first(),
    ).toBeUndefined();
    expect(Number((await environment.db("dmmarket_commission_operations").count("* as n").first()).n)).toBe(0);
  } finally {
    await environment.db.schema.renameTable("held_auth_events", "dmmarket_auth_events");
  }
});

test("sin decimal exacto o unicidad no se edita ni se prepara automáticamente el almacenamiento", async () => {
  await environment.db.schema.alterTable("vendedor_comisiones", (table) =>
    table.dropUnique(["vendedorId", "grupoId"], "commission_vendor_group_unique"),
  );
  try {
    expect(
      (await operator.client.request("/api/employees/commissionInfo/A/preview", { method: "POST", body: input() }))
        .status,
    ).toBe(503);
  } finally {
    await environment.db.schema.alterTable("vendedor_comisiones", (table) =>
      table.unique(["vendedorId", "grupoId"], "commission_vendor_group_unique"),
    );
  }
  await environment.db.raw("ALTER TABLE vendedor_comisiones MODIFY comision FLOAT NOT NULL");
  try {
    expect((await operator.client.request("/api/employees/commissionInfo/A/status")).body.writesAvailable).toBe(false);
    expect(
      (await operator.client.request("/api/employees/commissionInfo/A/preview", { method: "POST", body: input() }))
        .status,
    ).toBe(503);
  } finally {
    await environment.db.raw("ALTER TABLE vendedor_comisiones MODIFY comision DECIMAL(7,4) NOT NULL");
  }
});

test("CSRF y reautenticación reciente se verifican antes de escribir", async () => {
  const who = await actor([grant("commissions.read"), grant("commissions.update")]);
  const payload = input();
  const plan = await preview(who, payload);
  const body = { ...payload, requestId: randomUUID(), snapshot: plan.snapshot };
  expect(
    (await who.client.request("/api/employees/commissionInfo/A", { method: "PUT", body, csrf: "bad" })).status,
  ).toBe(403);
  await environment
    .db("dmmarket_auth_session_state")
    .where("user_id", who.user.id)
    .update({ password_ms: Date.now() - 300001 });
  expect((await who.client.request("/api/employees/commissionInfo/A", { method: "PUT", body })).status).toBe(403);
});

test("edición disponible sin interruptores y rollback no elimina historial financiero", async () => {
  expect((await run(operator, input())).response.status).toBe(200);
  await expect(require("../migrations/20261027_add_commission_operations").down(environment.db)).rejects.toThrow(
    "historial",
  );
  const prepared = await startEnvironment({ web: true });
  try {
    await seedSales(prepared.db);
    await seedCommissions(prepared.db);
    await prepareCommissionWrites(prepared.db);
    const who = await actor([grant("commissions.read"), grant("commissions.update")], prepared);
    const status = await who.client.request("/api/employees/commissionInfo/A/status");
    expect(status.body.writesAvailable).toBe(true);
    expect(status.body).not.toHaveProperty("writesEnabled");
    const { response } = await run(who, input());
    expect(response.status).toBe(200);
    expect((await prepared.db("vendedor_comisiones").where({ vendedorId: "A", grupoId: "G" }).first()).comision).toBe(
      "15.2500",
    );
  } finally {
    await prepared.close();
  }
});
