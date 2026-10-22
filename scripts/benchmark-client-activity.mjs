import { createRequire } from "node:module";
import { parseArgs } from "node:util";

const require = createRequire(new URL("../packages/backend/package.json", import.meta.url));
const mysql = require("mysql2/promise");
const bucketNames = ["0-7d", "8-15d", "16-30d", "31-60d", "61-90d", ">90d"];

const connectionSettings = () => ({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT || 3306),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectTimeout: 3000,
  dateStrings: true,
});

const milliseconds = (start) => Math.round(performance.now() - start);
const dayNumber = (date) => {
  if (!date || date.startsWith("0000") || date.slice(5, 7) === "00" || date.slice(8, 10) === "00") return null;
  const n = Date.parse(`${date}T00:00:00Z`) / 86400000;
  return Number.isFinite(n) ? n : null;
};

const chunks = (rows, size) => {
  const result = [];
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size));
  return result;
};

export async function measureClientActivity({
  to,
  ruta,
  showNoe = false,
  batchSize = 100,
  run = false,
  timeoutMs = 5000,
  budgetMs = 15000,
  connection = connectionSettings(),
  report = (event) => console.log(JSON.stringify(event)),
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || new Date(`${to}T00:00:00Z`).toISOString().slice(0, 10) !== to)
    throw new Error("Invalid --to date");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error("Invalid --batch-size (1..500)");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || !Number.isFinite(budgetMs) || budgetMs < timeoutMs)
    throw new Error("Invalid timeout or budget");

  const master = showNoe ? "masternoe" : "masterfact";
  const slave = showNoe ? "slavenoe" : "slavefact";
  const id = showNoe ? "IdNoe" : "IdFactura";
  const database = await mysql.createConnection(connection);
  let control;
  const start = performance.now();
  const memoryBefore = process.memoryUsage();
  const phases = [];

  try {
    control = await mysql.createConnection(connection);
    const [[{ connectionId }]] = await database.query("SELECT CONNECTION_ID() as connectionId");
    if (!Number.isInteger(connectionId)) throw new Error("Invalid connection id");
    const query = async (sql, bindings = []) => {
      if (performance.now() - start > budgetMs) throw new Error("Measurement budget exceeded");
      let expired = false;
      let cancellation;
      const timer = setTimeout(
        () => {
          expired = true;
          cancellation = control.query(`KILL QUERY ${connectionId}`).catch(() => database.destroy());
        },
        Math.min(timeoutMs, budgetMs - (performance.now() - start)),
      );
      try {
        const [rows] = await database.query(sql, bindings);
        if (expired) throw new Error("Query timeout");
        return rows;
      } finally {
        clearTimeout(timer);
        if (cancellation) await cancellation;
      }
    };
    const execute = async (phase, sql, bindings = []) => {
      const before = performance.now();
      const rows = await query(sql, bindings);
      const result = { phase, ms: milliseconds(before), rows: rows.length };
      phases.push(result);
      report(result);
      return rows;
    };
    const status = async () => {
      const rows = await query("SHOW SESSION STATUS");
      return Object.fromEntries(
        rows
          .filter((r) => /^(Handler_read_|Created_tmp_|Select_scan|Sort_merge_passes)/.test(r.Variable_name))
          .map((r) => [r.Variable_name, Number(r.Value)]),
      );
    };
    const explain = async (phase, sql, bindings) => {
      const rows = await query(`EXPLAIN ${sql}`, bindings);
      report({
        phase,
        plan: rows.map(({ select_type, table, type, key, rows, Extra }) => ({
          select_type,
          table,
          type,
          key,
          rows,
          Extra,
        })),
      });
    };

    const [version] = await query("SELECT VERSION() as version");
    report({ mode: run ? "run" : "plan", serverVersion: version.version, to, showNoe, scoped: !!ruta, batchSize });
    const beforeStatus = await status();
    const anchorSql = `SELECT SQL_NO_CACHE LOWER(RTRIM(h.IdCliente)) as clientId,
      CAST(MAX(h.Fecha) AS CHAR) as last,
      CAST(DATE_SUB(MAX(h.Fecha), INTERVAL 12 MONTH) AS CHAR) as windowFrom
      FROM ${master} h
      ${ruta ? "INNER JOIN clientes c ON c.IdCliente = h.IdCliente" : ""}
      WHERE h.Anulada = 0 AND h.Fecha <= ? ${ruta ? "AND c.Ruta = ?" : ""}
      GROUP BY h.IdCliente`;
    const anchorBindings = ruta ? [to, ruta] : [to];
    await explain("anchors-plan", anchorSql, anchorBindings);
    const anchors = (await execute("anchors", anchorSql, anchorBindings)).filter((r) => r.windowFrom != null);
    const batches = chunks(anchors, batchSize);
    const clientData = new Map();
    const missing = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const sql = `SELECT SQL_NO_CACHE LOWER(RTRIM(h.IdCliente)) as clientId,
        CAST(MAX(h.Fecha) AS CHAR) as lastWithLines,
        SUM(sf.Precio * sf.Cantidad) as revenue
        FROM ${master} h INNER JOIN ${slave} sf ON sf.${id} = h.${id}
        WHERE h.Anulada = 0 AND (${batch.map(() => "(h.IdCliente = ? AND h.Fecha BETWEEN ? AND ?)").join(" OR ")})
        GROUP BY h.IdCliente`;
      const bindings = batch.flatMap((r) => [r.clientId, r.windowFrom, r.last]);
      if (i === 0) await explain("windows-plan", sql, bindings);
      if (!run) break;
      const rows = await execute(`windows-${i + 1}`, sql, bindings);
      const found = new Set();
      for (const row of rows) {
        clientData.set(row.clientId, { lastWithLines: row.lastWithLines, revenue: Number(row.revenue || 0) });
        found.add(row.clientId);
      }
      missing.push(...batch.filter((r) => !found.has(r.clientId)));
    }

    if (!run) return { mode: "plan", serverVersion: version.version, clients: anchors.length, phases };

    for (const [i, batch] of chunks(missing, batchSize).entries()) {
      const sql = `SELECT SQL_NO_CACHE LOWER(RTRIM(h.IdCliente)) as clientId,
        CAST(MAX(h.Fecha) AS CHAR) as lastWithLines
        FROM ${master} h INNER JOIN ${slave} sf ON sf.${id} = h.${id}
        WHERE h.Anulada = 0 AND h.Fecha <= ? AND h.IdCliente IN (${batch.map(() => "?").join(",")})
        GROUP BY h.IdCliente`;
      const bindings = [to, ...batch.map((r) => r.clientId)];
      if (i === 0) await explain("older-activity-plan", sql, bindings);
      const rows = await execute(`older-activity-${i + 1}`, sql, bindings);
      for (const row of rows) clientData.set(row.clientId, { lastWithLines: row.lastWithLines, revenue: 0 });
    }

    const aggregateStart = performance.now();
    const buckets = bucketNames.map((bucket) => ({ bucket, count: 0, revenue: 0, risk_amount: 0, risk_clients: 0 }));
    const cutoff = dayNumber(to);
    for (const row of clientData.values()) {
      const lastDay = dayNumber(row.lastWithLines);
      const days = lastDay == null ? null : cutoff - lastDay;
      const index = days == null ? 5 : [7, 15, 30, 60, 90, Infinity].findIndex((limit) => days <= limit);
      const bucket = buckets[index];
      bucket.count++;
      bucket.revenue += row.revenue;
      if (days != null && days > 60) {
        bucket.risk_clients++;
        bucket.risk_amount += row.revenue;
      }
    }
    const activeBuckets = buckets.filter((b) => b.count > 0);
    const aggregateMs = milliseconds(aggregateStart);
    if (activeBuckets.length) {
      const [rounded] = await execute(
        "rounding",
        `SELECT SQL_NO_CACHE ${activeBuckets.map((_, i) => `ROUND(? * 1e0, 2) AS bucket${i}`).join(", ")}`,
        activeBuckets.map((b) => b.revenue),
      );
      activeBuckets.forEach((b, i) => {
        b.revenue = Number(rounded[`bucket${i}`]);
      });
    }
    const afterStatus = await status();
    const memoryAfter = process.memoryUsage();
    const result = {
      serverVersion: version.version,
      to,
      showNoe,
      scoped: !!ruta,
      batchSize,
      elapsedMs: milliseconds(start),
      aggregateMs,
      dataQueryMs: phases.reduce((sum, phase) => sum + phase.ms, 0),
      queries: phases.length,
      clients: clientData.size,
      olderActivityCandidates: missing.length,
      phases,
      sessionWork: Object.fromEntries(
        Object.entries(afterStatus).map(([key, value]) => [key, value - beforeStatus[key]]),
      ),
      memory: {
        rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
        heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      },
      buckets: activeBuckets,
      revenueAtRisk: {
        amount: activeBuckets.reduce((sum, b) => sum + b.risk_amount, 0),
        clients: activeBuckets.reduce((sum, b) => sum + b.risk_clients, 0),
      },
    };
    report({ result });
    return result;
  } finally {
    await Promise.allSettled([database.end(), control?.end()]);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      to: { type: "string" },
      ruta: { type: "string" },
      "show-noe": { type: "boolean", default: false },
      "batch-size": { type: "string", default: "100" },
      "timeout-ms": { type: "string", default: "5000" },
      "budget-ms": { type: "string", default: "15000" },
      run: { type: "boolean", default: false },
    },
  });
  if (!values.to)
    throw new Error(
      "Usage: bun --env-file=packages/backend/.env scripts/benchmark-client-activity.mjs --to YYYY-MM-DD [--run]",
    );
  try {
    await measureClientActivity({
      to: values.to,
      ruta: values.ruta,
      showNoe: values["show-noe"],
      batchSize: Number(values["batch-size"]),
      timeoutMs: Number(values["timeout-ms"]),
      budgetMs: Number(values["budget-ms"]),
      run: values.run,
    });
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message }));
    process.exitCode = 1;
  }
}
