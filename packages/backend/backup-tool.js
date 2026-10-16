const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execute = promisify(execFile);

async function backupOptions(env = process.env) {
  const command = env.BACKUP_DUMP_COMMAND || "mysqldump";
  let help;
  try {
    const result = await execute(command, ["--no-defaults", "--help"], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
    help = result.stdout;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "No se encontró mysqldump. Instala el cliente MySQL o configura BACKUP_DUMP_COMMAND con su ruta.",
      );
    }
    throw new Error("No se pudieron comprobar las opciones de la herramienta de respaldo. Revisa su ruta y permisos.");
  }
  const supported = new Set(
    [...help.matchAll(/^\s*(?:-[A-Za-z?],\s*)?--([a-z][a-z0-9-]*)/gm)].map((match) => match[1]),
  );
  const mode = env.BACKUP_CONSISTENCY || "transactional";
  if (!["transactional", "locked"].includes(mode)) {
    throw new Error("BACKUP_CONSISTENCY debe ser transactional o locked.");
  }
  const connection = await require("mysql2/promise").createConnection({
    host: env.DATABASE_HOST || "localhost",
    port: Number(env.DATABASE_PORT || 3306),
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME,
    charset: "UTF8_GENERAL_CI",
    connectTimeout: 5000,
  });
  let version;
  try {
    const [[server]] = await connection.query("SELECT VERSION() AS version");
    version = server.version;
    if (mode === "transactional") {
      const [tables] = await connection.query(
        "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND (ENGINE IS NULL OR UPPER(ENGINE) <> 'INNODB')",
      );
      if (tables.length > 0) {
        throw new Error(
          "El respaldo sin bloqueo requiere que todas las tablas sean InnoDB. Hay tablas no transaccionales; programa mantenimiento y autoriza el modo locked si corresponde.",
        );
      }
    }
  } finally {
    await connection.end();
  }
  const required = ["protocol", "quick", "routines", "triggers", "hex-blob", "databases"];
  required.push(...(mode === "transactional" ? ["single-transaction", "lock-tables"] : ["lock-all-tables"]));
  const parts = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!parts) throw new Error("No se pudo identificar la versión de MySQL para respaldar sus objetos.");
  const numeric = Number(parts[1]) * 10000 + Number(parts[2]) * 100 + Number(parts[3]);
  const events = numeric >= 50106;
  if (events) required.push("events");
  const missing = required.filter((option) => !supported.has(option));
  if (missing.length > 0) {
    throw new Error(
      `El cliente de respaldo no admite las opciones necesarias: ${missing.join(", ")}. Instala un cliente compatible.`,
    );
  }
  const args = ["--protocol=TCP"];
  args.push(...(mode === "transactional" ? ["--single-transaction", "--skip-lock-tables"] : ["--lock-all-tables"]));
  args.push("--quick", "--routines", "--triggers", "--hex-blob");
  if (events) args.push("--events");
  if (supported.has("no-tablespaces")) args.push("--no-tablespaces");
  if (supported.has("column-statistics")) args.push("--column-statistics=0");
  if (supported.has("set-gtid-purged")) args.push("--set-gtid-purged=OFF");
  if (supported.has("default-character-set")) args.push("--default-character-set=utf8");
  return { command, args, mode };
}

module.exports = { backupOptions };
