const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");
const { createGzip } = require("node:zlib");
const { randomUUID } = require("node:crypto");
const { serviceDirectory } = require("./service");

const RETENTION = 30;
const RETRY_MS = 60 * 60 * 1000;
const BACKUP_NAME =
  /^dmmarket-(\d{4}-\d{2}-\d{2})(?:-manual-\d{9}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?\.sql\.gz$/;

function backupDirectory(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.BACKUP_DIRECTORY) return path.resolve(env.BACKUP_DIRECTORY);
  if (env.DMMARKET_SERVICE === "1") return path.join(serviceDirectory(platform), "backups");
  if (platform === "win32")
    return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local"), "DMMarket", "backups");
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "DMMarket", "backups");
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "dmmarket", "backups");
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function scheduledDate(now) {
  const date = new Date(now);
  if (date.getHours() < 2) date.setDate(date.getDate() - 1);
  return localDate(date);
}

function nextRunAt(now) {
  const date = new Date(now);
  date.setHours(2, 0, 0, 0);
  if (date <= now) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function optionValue(value) {
  const text = String(value ?? "");
  if (/[\0\r\n]/.test(text)) throw new Error("La configuración de MySQL contiene caracteres no válidos.");
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function dumpDatabase(destination, env = process.env, spawnProcess = spawn) {
  if (!env.DATABASE_NAME || env.DATABASE_NAME.startsWith("-") || /[\0\r\n]/.test(env.DATABASE_NAME)) {
    throw new Error("Configura DATABASE_NAME antes de generar respaldos.");
  }
  const temporary = await fsp.mkdtemp(path.join(path.dirname(destination), ".mysql-"));
  const credentials = path.join(temporary, "client.cnf");
  let child;
  let timer;
  try {
    await fsp.chmod(temporary, 0o700);
    const options = {
      host: env.DATABASE_HOST || "localhost",
      port: env.DATABASE_PORT || "3306",
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
    };
    await fsp.writeFile(
      credentials,
      `[client]\n${Object.entries(options)
        .map(([key, value]) => `${key}=${optionValue(value)}`)
        .join("\n")}\n`,
      { mode: 0o600 },
    );
    child = spawnProcess(
      env.BACKUP_DUMP_COMMAND || "mysqldump",
      [
        `--defaults-file=${credentials}`,
        "--protocol=TCP",
        "--lock-all-tables",
        "--quick",
        "--routines",
        "--events",
        "--triggers",
        "--hex-blob",
        "--no-tablespaces",
        "--databases",
        env.DATABASE_NAME,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    child.stderr.resume();
    const completion = new Promise((resolve, reject) => {
      child.once("error", (error) =>
        reject(
          new Error(
            error.code === "ENOENT"
              ? "No se encontró mysqldump. Instala el cliente MySQL o configura BACKUP_DUMP_COMMAND con la ruta de mysqldump/mariadb-dump."
              : "No se pudo iniciar la herramienta de respaldo MySQL.",
          ),
        ),
      );
      child.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                "El respaldo MySQL falló. Revisa la conexión, la versión del cliente y los permisos de lectura, vistas, rutinas, eventos y bloqueo de tablas.",
              ),
            ),
      );
    });
    timer = setTimeout(() => child.kill("SIGKILL"), RETRY_MS);
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(null, chunk);
      },
    });
    const streaming = pipeline(
      child.stdout,
      counter,
      createGzip(),
      fs.createWriteStream(destination, { flags: "wx", mode: 0o600 }),
    );
    let failure;
    const stopOnError = (promise) =>
      promise.catch((error) => {
        failure ||= error;
        child.kill("SIGKILL");
      });
    await Promise.all([stopOnError(completion), stopOnError(streaming)]);
    if (failure) throw failure;
    if (!bytes) throw new Error("MySQL produjo un respaldo vacío.");
  } finally {
    clearTimeout(timer);
    await fsp.rm(temporary, { recursive: true, force: true });
  }
}

function createBackupService({
  directory = backupDirectory(),
  dump = dumpDatabase,
  now = () => new Date(),
  logger = console,
} = {}) {
  let running = false;
  let lastError = null;
  let retentionError = null;
  let lastAttempt = null;
  let timer;

  async function list() {
    let files;
    try {
      files = await fsp.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const backups = [];
    for (const file of files) {
      const match = BACKUP_NAME.exec(file.name);
      if (!match || !file.isFile()) continue;
      try {
        const stat = await fsp.lstat(path.join(directory, file.name));
        if (!stat.isFile() || stat.size === 0) continue;
        backups.push({
          name: file.name,
          scheduledDate: match[1],
          completedAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
        });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return backups.sort(
      (a, b) =>
        b.scheduledDate.localeCompare(a.scheduledDate) ||
        b.completedAt.localeCompare(a.completedAt) ||
        b.name.localeCompare(a.name),
    );
  }

  async function run(manual = false) {
    const date = now();
    const slot = scheduledDate(date);
    if (running || (!manual && lastAttempt?.slot === slot && date.getTime() - lastAttempt.time < RETRY_MS)) return;
    running = true;
    let temporary;
    try {
      if (!manual) {
        const backups = await list();
        if (backups.some((backup) => !backup.name.includes("-manual-") && backup.scheduledDate >= slot)) return;
        lastAttempt = { slot, time: date.getTime() };
      }
      await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
      const time =
        [date.getHours(), date.getMinutes(), date.getSeconds()]
          .map((value) => String(value).padStart(2, "0"))
          .join("") + String(date.getMilliseconds()).padStart(3, "0");
      const name = manual
        ? `dmmarket-${localDate(date)}-manual-${time}-${randomUUID()}.sql.gz`
        : `dmmarket-${slot}.sql.gz`;
      const target = path.join(directory, name);
      temporary = `${target}.${process.pid}.partial`;
      await fsp.rm(temporary, { force: true });
      await dump(temporary);
      const stat = await fsp.stat(temporary);
      if (!stat.size) throw new Error("El respaldo generado está vacío.");
      await fsp.rename(temporary, target);
      temporary = null;
      lastError = null;
      logger.log(`Respaldo completado: ${target} (${stat.size} bytes)`);
      try {
        const completed = await list();
        for (const backup of completed.slice(RETENTION)) await fsp.unlink(path.join(directory, backup.name));
        retentionError = null;
      } catch (error) {
        retentionError = {
          message:
            "El respaldo se guardó, pero no se pudieron eliminar los archivos antiguos. Revisa los permisos de la carpeta.",
          occurredAt: now().toISOString(),
        };
        logger.error("No se pudo aplicar la retención de respaldos:", error.message);
      }
    } catch (error) {
      if (!manual) lastAttempt = { slot, time: now().getTime() };
      lastError = { message: error.message, occurredAt: now().toISOString() };
      logger.error("No se pudo completar el respaldo:", error.message);
    } finally {
      if (temporary) {
        try {
          await fsp.rm(temporary, { force: true });
        } catch (error) {
          logger.error("No se pudo eliminar el respaldo incompleto:", error.message);
        }
      }
      running = false;
    }
  }

  function check() {
    return run();
  }

  function createManual() {
    if (running) {
      throw Object.assign(new Error("Ya hay un respaldo en curso. Espera a que termine."), { code: "BACKUP_RUNNING" });
    }
    void run(true);
  }

  async function status() {
    return {
      directory,
      backups: await list(),
      running,
      lastError,
      retentionError,
      nextRunAt: nextRunAt(now()),
      retention: RETENTION,
    };
  }

  function start() {
    if (timer) return;
    void check();
    timer = setInterval(() => void check(), 60 * 1000);
    timer.unref();
  }

  function stop() {
    clearInterval(timer);
    timer = undefined;
  }

  return { check, createManual, status, list, start, stop };
}

const backupService = createBackupService();
module.exports = {
  BACKUP_NAME,
  backupDirectory,
  scheduledDate,
  nextRunAt,
  dumpDatabase,
  createBackupService,
  backupService,
};
