import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";

const require = createRequire(new URL("../packages/backend/package.json", import.meta.url));
const knex = require("knex");
const dotenv = require("dotenv");
const { createReceivablesService } = require("./receivables");
const { Money, fixed, total } = require("./utils/receivables-money");
const reason = "Cierre manual masivo por saneamiento de cartera autorizado por el responsable del negocio";
const writes = ["cxc_documentos", "cxc_operaciones", "cxc_cierres"];
const required = [...writes, "clientes", "masterfact", "cxc_movimientos", "cxc_cruces"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const equal = isDeepStrictEqual;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function writePrivate(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

function usage() {
  console.log(`Uso desde la raíz del repositorio:
  bun scripts/close-receivables.mjs plan --env RUTA.env --out PLAN.json
  bun scripts/close-receivables.mjs rehearse --env RUTA.env --plan PLAN.json --confirm SHA256 --maintenance
  bun scripts/close-receivables.mjs apply --env RUTA.env --plan PLAN.json --confirm SHA256 --maintenance --backup-confirmed

plan solo lee. rehearse ejecuta el lote y hace ROLLBACK. apply hace COMMIT.
El plan incluye toda la deuda vigente detectada, sin exigir una cantidad fija de clientes.
--report RUTA.json permite elegir el recibo; por defecto se crea junto al plan.
--backup-confirmed confirma que ya hiciste y verificaste el respaldo manual. No se generan respaldos.
No se crean tablas, no se registran pagos ni se modifica cxcmoves.
`);
}

async function target(db, configuration) {
  const [[row]] = await db.raw(
    "SELECT DATABASE() AS databaseName, @@hostname AS serverHost, @@port AS serverPort, @@server_id AS serverId, VERSION() AS version",
  );
  return {
    host: configuration.DATABASE_HOST,
    port: Number(configuration.DATABASE_PORT),
    ...row,
  };
}

async function validateSchema(db) {
  const [[{ databaseName }]] = await db.raw("SELECT DATABASE() AS databaseName");
  const tables = await db("information_schema.TABLES")
    .where("TABLE_SCHEMA", databaseName)
    .whereIn("TABLE_NAME", required)
    .select("TABLE_NAME as name", "ENGINE as engine");
  for (const name of required) {
    check(
      tables.some((table) => table.name === name),
      `Falta ${name}. Revisa la guía; no se ejecutan migraciones.`,
    );
    check(tables.find((table) => table.name === name).engine === "InnoDB", `${name} debe usar InnoDB.`);
  }
  const triggers = await db("information_schema.TRIGGERS")
    .where("TRIGGER_SCHEMA", databaseName)
    .whereIn("EVENT_OBJECT_TABLE", writes)
    .select("TRIGGER_NAME as name");
  check(!triggers.length, "Hay triggers en las tablas a modificar. Requieren revisión antes de usar este script.");
}

function pending(db) {
  return db("cxc_documentos as d")
    .join("masterfact as f", "f.IdFactura", "d.IdFactura")
    .whereRaw("f.IdCliente = d.IdCliente")
    .where("d.TipoDoc", "FAC")
    .where("d.MonedaOriginal", "USD")
    .whereNot("d.Estatus", "ANULADO")
    .where("f.Anulada", 0)
    .where("d.SaldoActual", ">", 0);
}

async function makePlan(db, destination, previous) {
  const rows = await pending(db).distinct("d.IdCliente as id").orderBy("d.IdCliente");
  const service = createReceivablesService({ db });
  const clients = [];
  for (const { id } of rows) {
    check(typeof id === "string" && id.length > 0, "Hay un cliente sin identificador válido.");
    const client = await db("clientes").where("IdCliente", id).first();
    check(client, `Cliente ${id} no registrado. Requiere revisión manual.`);
    const preview = await service.preview(id, { type: "close", reason });
    check(new Money(preview.balanceAfter).eq(0), `El cliente ${id} no quedaría en cero. Requiere conciliación.`);
    check(
      preview.applications.every((a) => new Money(a.amount).gt(0)),
      `Importe inválido en ${id}.`,
    );
    clients.push({
      id,
      name: client.Empresa,
      requestId: previous?.clients.find((entry) => entry.id === id)?.requestId || randomUUID(),
      preview,
    });
  }
  return {
    format: "dmmarket-close-receivables-v1",
    target: destination,
    reason,
    expectedClients: clients.length,
    summary: {
      clients: clients.length,
      documents: clients.reduce((sum, client) => sum + client.preview.applications.length, 0),
      amountUSD: fixed(total(clients.map((client) => client.preview.base))),
    },
    clients,
  };
}

async function lockPortfolio(db) {
  await db("cxc_documentos").select("IdDocumento").orderBy("IdDocumento").forUpdate();
  const rows = await db("cxc_documentos").select("IdCliente", "IdFactura");
  const clientIds = [...new Set(rows.map((row) => row.IdCliente))];
  const saleIds = [...new Set(rows.map((row) => row.IdFactura))];
  if (clientIds.length) await db("clientes").whereIn("IdCliente", clientIds).select("IdCliente").forUpdate();
  if (saleIds.length) await db("masterfact").whereIn("IdFactura", saleIds).select("IdFactura").forUpdate();
  await db("cxc_cierres").select("IdCierre").orderBy("IdCierre").forUpdate();
}

async function alreadyApplied(db, plan) {
  const operations = await db("cxc_operaciones")
    .whereIn(
      "IdOperacion",
      plan.clients.map((client) => client.requestId),
    )
    .select("*");
  if (!operations.length) return false;
  check(operations.length === plan.clients.length, "El plan está parcialmente registrado. No se modifica nada.");
  for (const client of plan.clients) {
    const operation = operations.find((row) => row.IdOperacion === client.requestId);
    const data = typeof operation.Datos === "string" ? JSON.parse(operation.Datos) : operation.Datos;
    const { registeredAt, operationId, ...preview } = data;
    check(
      operation.Tipo === "CIERRE" &&
        operation.IdCliente === client.id &&
        operation.Motivo === plan.reason &&
        operationId === client.requestId &&
        registeredAt &&
        equal(preview, client.preview),
      "Un identificador ya corresponde a otra operación. No se modifica nada.",
    );
  }
  return true;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      env: { type: "string" },
      out: { type: "string" },
      plan: { type: "string" },
      confirm: { type: "string" },
      "backup-confirmed": { type: "boolean" },
      report: { type: "string" },
      maintenance: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) return usage();
  const [command] = positionals;
  check(
    positionals.length === 1 && ["plan", "rehearse", "apply"].includes(command),
    "Usa plan, rehearse o apply; consulta --help.",
  );
  check(values.env, "Indica --env explícitamente. No se usa el .env automático de Bun.");
  const configuration = dotenv.parse(fs.readFileSync(path.resolve(values.env)));
  for (const key of ["DATABASE_HOST", "DATABASE_PORT", "DATABASE_USER", "DATABASE_NAME"])
    check(configuration[key], `Falta ${key} en el archivo indicado.`);
  check(
    /^\d+$/.test(configuration.DATABASE_PORT) &&
      Number(configuration.DATABASE_PORT) > 0 &&
      Number(configuration.DATABASE_PORT) <= 65535,
    "DATABASE_PORT inválido.",
  );
  let approved;
  let planHash;
  let reportFile;
  if (command === "plan") {
    check(values.out, "plan requiere --out con un archivo nuevo.");
    check(!fs.existsSync(values.out), "El archivo de salida ya existe; no se sobrescribe.");
  } else {
    check(
      values.plan && values.confirm && values.maintenance,
      "Se requieren --plan, --confirm SHA256 y --maintenance.",
    );
    const bytes = fs.readFileSync(values.plan);
    planHash = sha256(bytes);
    check(values.confirm === planHash, "La huella no coincide con el archivo del plan.");
    approved = JSON.parse(bytes);
    check(
      approved.format === "dmmarket-close-receivables-v1" && approved.reason === reason,
      "Formato o motivo del plan inválido.",
    );
    check(Number.isSafeInteger(approved.expectedClients) && approved.expectedClients >= 0, "Conteo del plan inválido.");
    check(approved.clients?.length === approved.expectedClients, "Lista de clientes inválida.");
    check(
      new Set(approved.clients.map((client) => client.id)).size === approved.expectedClients,
      "Clientes duplicados.",
    );
    check(
      new Set(approved.clients.map((client) => client.requestId)).size === approved.expectedClients,
      "Solicitudes duplicadas.",
    );
    if (command === "apply")
      check(values["backup-confirmed"], "Confirma el respaldo manual previo con --backup-confirmed.");
    reportFile = values.report || `${values.plan}.${command}-${randomUUID()}.json`;
    check(!fs.existsSync(reportFile), "El recibo ya existe; usa otro --report.");
  }
  const db = knex({
    client: require("knex/lib/dialects/mysql2"),
    connection: {
      host: configuration.DATABASE_HOST,
      port: Number(configuration.DATABASE_PORT),
      user: configuration.DATABASE_USER,
      password: configuration.DATABASE_PASSWORD || "",
      database: configuration.DATABASE_NAME,
      charset: "UTF8_GENERAL_CI",
      dateStrings: ["DATE"],
      connectTimeout: 10000,
      multipleStatements: false,
    },
    pool: { min: 0, max: 1 },
  });
  let receipt;
  const rollback = new Error("Ensayo revertido deliberadamente");
  try {
    await db.raw("SET SESSION innodb_lock_wait_timeout = 15");
    await db.raw("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await validateSchema(db);
    const destination = await target(db, configuration);
    console.log("Destino:", JSON.stringify(destination));
    if (command === "plan") {
      await db.raw("SET TRANSACTION READ ONLY");
      const plan = await db.transaction((transaction) => makePlan(transaction, destination));
      writePrivate(values.out, plan);
      console.log("Plan sin cambios:", JSON.stringify(plan.summary));
      console.log("Archivo:", path.resolve(values.out));
      console.log("SHA256:", sha256(fs.readFileSync(values.out)));
      return;
    }
    check(
      equal(destination, approved.target),
      "La conexión no corresponde al destino del plan. Genera un plan en este servidor.",
    );
    receipt = {
      status: "prepared",
      command,
      startedAt: new Date().toISOString(),
      target: destination,
      planFile: path.resolve(values.plan),
      planSHA256: planHash,
      backupConfirmed: values["backup-confirmed"] === true,
      summary: approved.summary,
      operationIds: approved.clients.map((client) => client.requestId),
    };
    writePrivate(reportFile, receipt);
    try {
      await db.transaction(async (transaction) => {
        await lockPortfolio(transaction);
        if (await alreadyApplied(transaction, approved)) {
          receipt.status = "already-applied";
          return;
        }
        const current = await makePlan(transaction, destination, approved);
        check(
          equal(current, approved),
          "La cartera cambió desde el plan. No se aplica: genera y revisa un plan nuevo.",
        );
        const service = createReceivablesService({ db: transaction });
        for (const client of approved.clients) {
          await service.execute(client.id, {
            type: "close",
            reason,
            snapshot: client.preview.snapshot,
            requestId: client.requestId,
          });
        }
        const remaining = await pending(transaction).count("* as count").first();
        check(Number(remaining.count) === 0, "Quedó deuda visible pendiente: se revierte todo el lote.");
        const closures = await transaction("cxc_cierres").whereIn("IdOperacion", receipt.operationIds).select("Monto");
        check(
          closures.length === approved.summary.documents &&
            fixed(total(closures.map((row) => row.Monto))) === approved.summary.amountUSD,
          "El historial no coincide con el plan: se revierte todo el lote.",
        );
        if (command === "rehearse") throw rollback;
      });
      if (receipt.status !== "already-applied") receipt.status = "committed";
    } catch (error) {
      if (error !== rollback) throw error;
      receipt.status = "rolled-back";
    }
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    console.log("Resultado:", receipt.status);
    console.log("Resumen:", JSON.stringify(approved.summary));
    console.log("Recibo:", path.resolve(reportFile));
  } catch (error) {
    if (receipt)
      console.error(
        "El recibo queda prepared: verifica el resultado en la base antes de repetir. Reutiliza el mismo plan.",
      );
    throw error;
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
