import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/backend/package.json", import.meta.url));
const container = process.env.MYSQL_CONTAINER;
assert(container?.startsWith("dmmarket-"), "Indica MYSQL_CONTAINER del entorno local de desarrollo");
const [metadata] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
const binding = metadata.NetworkSettings.Ports["3306/tcp"]?.find((entry) => entry.HostIp === "127.0.0.1");
assert(binding, "MySQL debe estar publicado exclusivamente en loopback");
const password = metadata.Config.Env.find((entry) => entry.startsWith("MYSQL_ROOT_PASSWORD="))?.slice(20);
const connection = { host: "127.0.0.1", port: Number(binding.HostPort), user: "root", password };
const knex = require("knex");
const client = require("knex/lib/dialects/mysql2");
const database = `test_cxc_residual_${process.pid}`;
const admin = knex({ client, connection });
const db = knex({ client, connection: { ...connection, database, dateStrings: ["DATE"] }, pool: { min: 0, max: 3 } });
const { createReceivablesService } = require("./receivables");
const service = createReceivablesService({ db, now: () => new Date("2026-10-29T12:00:00Z") });
let created = false;
let sequence = 0;

async function seed(amounts) {
  const id = `C${++sequence}`;
  await db("clientes").insert({ IdCliente: id, Empresa: id, Ruta: "DEBUG" });
  for (const [i, amount] of amounts.entries()) {
    const sale = `${id}-${i}`;
    await db("masterfact").insert({ IdFactura: sale, IdCliente: id, Anulada: 0 });
    await db("cxc_documentos").insert({
      IdFactura: sale,
      IdCliente: id,
      TipoDoc: "FAC",
      MonedaOriginal: "USD",
      Estatus: "PENDIENTE",
      MontoOriginal: amount,
      SaldoActual: amount,
      FechaEmision: "2026-10-01",
      FechaVencimiento: "2026-10-08",
    });
  }
  return id;
}

const payment = (amount, extra = {}) => ({
  type: "payment",
  amount,
  currency: "USD",
  date: "2026-10-29",
  method: "TRANSFERENCIA",
  ...extra,
});
async function execute(id, payload) {
  const preview = await service.preview(id, payload);
  const body = { ...payload, snapshot: preview.snapshot, requestId: randomUUID() };
  return { preview, body, result: await service.execute(id, body) };
}

try {
  await admin.raw("CREATE DATABASE ??", [database]);
  created = true;
  await db.raw(
    "CREATE TABLE clientes (IdCliente VARCHAR(15) PRIMARY KEY, Empresa VARCHAR(100), Rif VARCHAR(30), Ruta VARCHAR(10)) ENGINE=InnoDB",
  );
  await db.raw(
    "CREATE TABLE masterfact (IdFactura VARCHAR(20) PRIMARY KEY, IdCliente VARCHAR(15), Anulada INT) ENGINE=InnoDB",
  );
  await db.raw(
    "CREATE TABLE cxc_documentos (IdDocumento INT PRIMARY KEY AUTO_INCREMENT, IdFactura VARCHAR(20), IdCliente VARCHAR(15), TipoDoc VARCHAR(3), MonedaOriginal VARCHAR(3), Estatus VARCHAR(15), MontoOriginal DECIMAL(18,4), SaldoActual DECIMAL(18,4), FechaEmision DATE, FechaVencimiento DATE) ENGINE=InnoDB",
  );
  await db.raw(
    "CREATE TABLE cxc_movimientos (IdMov INT PRIMARY KEY AUTO_INCREMENT, IdCliente VARCHAR(15), Fecha DATETIME, MontoBase DECIMAL(18,4), MonedaPago VARCHAR(3), TasaCambio DECIMAL(18,6), MontoPago DECIMAL(18,4), FormaPago VARCHAR(30), Referencia VARCHAR(50), Banco VARCHAR(50), Observaciones TEXT) ENGINE=InnoDB",
  );
  await db.raw(
    "CREATE TABLE cxc_cruces (IdCruce INT PRIMARY KEY AUTO_INCREMENT, IdMovimiento INT, IdDocumento INT, MontoAplicado DECIMAL(18,4), FechaCruce DATETIME) ENGINE=InnoDB",
  );
  await db.raw(
    "CREATE TABLE divisas (IdDivisa INT PRIMARY KEY, Simbolo VARCHAR(3), Cambio DECIMAL(18,6)) ENGINE=InnoDB",
  );
  await require("./migrations/20261011_add_receivables_operations").up(db);

  for (const entry of [
    { original: "393.3300", amount: "349000.0000", rate: "887.300000", residual: "0.0019" },
    { original: "81.6000", amount: "72315.5500", rate: "886.230000", residual: "0.0009" },
    { original: "74.7500", amount: "66325.0000", rate: "887.300000", residual: "0.0008" },
  ]) {
    const payload = payment(entry.amount, { currency: "BsS", rate: entry.rate });
    const untouched = await seed([entry.original]);
    const standard = await execute(untouched, payload);
    assert.equal(standard.preview.residualAmount, entry.residual, "La previsualización debe detectar el residuo");
    assert.equal(standard.result.balanceAfter, entry.residual, "Sin aceptación se conserva la deuda");
    assert.equal(standard.result.residualClosure, undefined);
    assert.equal((await service.list({ search: untouched, state: "debt" })).total, 1);

    const id = await seed([entry.original]);
    const selected = await execute(id, { ...payload, closeResidual: true });
    assert.equal(selected.preview.balanceAfter, "0.0000");
    assert.equal(selected.result.balanceAfter, "0.0000");
    assert.equal(selected.result.residualClosure.base, entry.residual);
    assert.equal(selected.result.applied, standard.result.applied, "El cierre no es dinero recibido");
    assert.deepEqual(await service.execute(id, selected.body), selected.result, "El reintento no duplica operaciones");
    const detail = await service.detail(id, { documents: "all" });
    assert.equal(detail.summary.balance, "0.0000");
    assert.equal(detail.documents.data[0].closed, entry.residual);
    assert.equal(detail.documents.data[0].applied, standard.result.applied);
    assert.equal(detail.timeline.data.filter((event) => event.type === "payment").length, 1);
    const closure = detail.timeline.data.find((event) => event.type === "CIERRE");
    assert.equal(closure.data.base, entry.residual);
    assert.equal(closure.data.paymentOperationId, selected.result.operationId);
    assert(closure.reason.includes("residual"));
    assert.equal((await service.list({ search: id, state: "debt" })).total, 0);
    await execute(id, { type: "reopen", id: detail.documents.data[0].id, reason: "Reabrir ajuste de prueba" });
    assert.equal((await service.detail(id)).summary.balance, entry.residual);
  }
  console.log("PASS: tres casos reales, consentimiento, historial, idempotencia y reapertura");

  for (const [original, expected] of [
    ["1.0000", null],
    ["1.0001", "0.0001"],
    ["1.0049", "0.0049"],
    ["1.0050", null],
    ["1.0100", null],
  ]) {
    const id = await seed([original]);
    const preview = await service.preview(id, payment("1"));
    assert.equal(preview.residualAmount || null, expected);
    if (!expected) await assert.rejects(service.preview(id, payment("1", { closeResidual: true })), { status: 400 });
  }
  const aggregate = await seed(["1", "0.0024", "0.0025"]);
  const aggregateResult = await execute(aggregate, payment("1", { closeResidual: true }));
  assert.equal(aggregateResult.result.residualClosure.base, "0.0049");
  assert.equal(aggregateResult.result.residualClosure.applications.length, 2);
  assert.equal((await service.detail(aggregate)).summary.balance, "0.0000");
  const aggregateTooLarge = await seed(["1", "0.0025", "0.0025"]);
  await assert.rejects(service.preview(aggregateTooLarge, payment("1", { closeResidual: true })), { status: 400 });
  console.log("PASS: límites estrictos y suma de residuos por cliente");

  const signed = await seed(["1.0019"]);
  const ordinaryPreview = await service.preview(signed, payment("1"));
  await assert.rejects(
    service.execute(signed, {
      ...payment("1", { closeResidual: true }),
      snapshot: ordinaryPreview.snapshot,
      requestId: randomUUID(),
    }),
    { status: 409 },
  );
  for (const invalid of ["true", 1, null, {}])
    await assert.rejects(service.preview(signed, payment("1", { closeResidual: invalid })), { status: 400 });
  const stale = await service.preview(signed, payment("1", { closeResidual: true }));
  await db("cxc_documentos").where("IdCliente", signed).update({ SaldoActual: "1.0020" });
  await assert.rejects(
    service.execute(signed, {
      ...payment("1", { closeResidual: true }),
      snapshot: stale.snapshot,
      requestId: randomUUID(),
    }),
    { status: 409 },
  );
  console.log("PASS: validación de consentimiento y snapshots obsoletos");

  const reversed = await seed(["1.0019"]);
  const saved = await execute(reversed, payment("1", { closeResidual: true }));
  await execute(reversed, { type: "void", id: saved.result.movementId, reason: "Anulación de prueba" });
  const afterVoid = await service.detail(reversed, { documents: "all" });
  assert.equal(afterVoid.summary.balance, "1.0000");
  assert.equal(afterVoid.documents.data[0].closed, "0.0019");
  await execute(reversed, { type: "reopen", id: afterVoid.documents.data[0].id, reason: "Reapertura de prueba" });
  assert.equal((await service.detail(reversed)).summary.balance, "1.0019");
  console.log("PASS: anular el abono conserva el cierre, que puede reabrirse por separado");

  const rollback = await seed(["1", "0.0024", "0.0025"]);
  await db("cxc_cierres").del();
  await db.raw("ALTER TABLE cxc_cierres ADD UNIQUE INDEX test_single_closure (IdOperacion)");
  await assert.rejects(execute(rollback, payment("1", { closeResidual: true })));
  assert.equal((await db("cxc_movimientos").where("IdCliente", rollback)).length, 0);
  assert.equal((await db("cxc_operaciones").where("IdCliente", rollback)).length, 0);
  assert.equal((await service.detail(rollback)).summary.balance, "1.0049");
  console.log("PASS: error al cerrar revierte también el abono");
} finally {
  await db.destroy();
  if (created) await admin.raw("DROP DATABASE ??", [database]);
  await admin.destroy();
}
