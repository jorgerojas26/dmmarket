import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const directory = path.join(root, ".dev");
const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
const slug =
  path
    .basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "worktree";
const id = `${slug}-${hash}`;
const project = `dmmarket-${id}`;
const frontend = `${id}.dmmarket`;
const backend = `api.${frontend}`;
const volume = `${project}_mysql_data`;
const configFile = path.join(root, ".dev.local.json");
const settings = existsSync(configFile) ? JSON.parse(readFileSync(configFile, "utf8")) : {};
const command = process.argv[2] || "start";

function environment(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(DATABASE_|BACKUP_|GOOGLE_DRIVE_|DMMARKET_|REACT_APP_|WDS_SOCKET_|PORTLESS_APP_PORT)/.test(key))
      delete env[key];
  }
  for (const key of ["PORT", "HOST", "PORTLESS", "PORTLESS_URL", "COMPOSE_FILE", "COMPOSE_PROJECT_NAME", "NODE_ENV"])
    delete env[key];
  return {
    ...env,
    DATABASE_HOST: "127.0.0.1",
    DATABASE_USER: "root",
    DATABASE_PASSWORD: "root",
    DATABASE_NAME: "bdsolser_md_nieto",
    BACKUP_DIRECTORY: path.join(directory, "backups"),
    BACKUP_DUMP_COMMAND: path.join(root, "scripts/dev-mysqldump.sh"),
    BACKUP_CONSISTENCY: "transactional",
    GOOGLE_DRIVE_CLIENT_ID: "",
    GOOGLE_DRIVE_CLIENT_SECRET: "",
    DMMARKET_SERVICE: "0",
    WEB_MODE: "direct",
    WEB_HOSTNAME: "",
    ...extra,
  };
}

function capture(args, options = {}) {
  const result = Bun.spawnSync(args, {
    cwd: root,
    env: environment(),
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  if (result.exitCode !== 0)
    throw new Error(
      `${args.slice(0, 3).join(" ")}: ${result.stderr.toString().trim() || result.stdout.toString().trim()}`,
    );
  return result.stdout.toString().trim();
}

async function run(args, options = {}) {
  const child = Bun.spawn(args, {
    cwd: root,
    env: environment(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    ...options,
  });
  const stop = (signal) => child.kill(signal);
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const code = await child.exited;
    if (code !== 0) throw new Error(`${args.slice(0, 3).join(" ")} terminó con código ${code}.`);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

function dumpPath() {
  if (settings.dump) return path.resolve(root, settings.dump);
  const local = path.join(root, "bdsolser_md_nieto.dump");
  if (existsSync(local)) return local;
  const common = capture(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return path.resolve(common, "..", "main", "bdsolser_md_nieto.dump");
}

function compose(args) {
  return ["docker", "compose", "--project-name", project, "--file", path.join(root, "docker-compose.yml"), ...args];
}

function composeEnvironment() {
  return environment({ DMMARKET_DEV_ROOT: root, DMMARKET_DEV_DUMP: dumpPath() });
}

function container() {
  const cid = capture(compose(["ps", "--all", "--quiet", "mysql"]), { env: composeEnvironment() });
  if (!cid) throw new Error("MySQL no está preparado. Ejecuta bun run dev.");
  const [info] = JSON.parse(capture(["docker", "inspect", cid]));
  if (info.Config.Labels["io.dmmarket.worktree"] !== root)
    throw new Error("El contenedor no pertenece a este worktree.");
  return info;
}

function databaseEnvironment() {
  const info = container();
  if (!info.State.Running || info.State.Health?.Status !== "healthy")
    throw new Error("MySQL aún no está listo. Ejecuta bun run dev.");
  const bindings = info.NetworkSettings.Ports["3306/tcp"];
  if (bindings?.length !== 1 || bindings[0].HostIp !== "127.0.0.1")
    throw new Error("MySQL debe publicar un único puerto en 127.0.0.1.");
  return environment({ DATABASE_PORT: bindings[0].HostPort, DMMARKET_DEV_CONTAINER: info.Id });
}

function checkRequirements() {
  for (const binary of ["bun", "node", "docker", "portless", "mprocs"])
    if (!Bun.which(binary)) throw new Error(`Falta ${binary} en PATH.`);
  for (const [workspace, dependency] of [
    ["backend", "nodemon"],
    ["frontend", "react-scripts"],
  ]) {
    try {
      createRequire(path.join(root, "packages", workspace, "package.json")).resolve(`${dependency}/package.json`);
    } catch {
      throw new Error("Faltan dependencias. Ejecuta bun install en este worktree.");
    }
  }
  capture(["docker", "info", "--format", "{{.ServerVersion}}"]);
  capture(["docker", "compose", "version"]);
  const dump = dumpPath();
  if (!existsSync(dump) || !statSync(dump).isFile() || statSync(dump).size === 0)
    throw new Error(`El dump debe ser un archivo SQL no vacío: ${dump}. Configura dump en .dev.local.json.`);
  capture(compose(["config", "--quiet"]), { env: composeEnvironment() });
}

async function prepare() {
  checkRequirements();
  mkdirSync(directory, { recursive: true });
  console.log(`Ambiente: ${id}\nCompose: ${project}\nVolumen: ${volume}\nDump: ${dumpPath()}`);
  await run(compose(["up", "--detach", "--wait", "--wait-timeout", "1200", "mysql"]), { env: composeEnvironment() });
  const env = databaseEnvironment();
  await run(["bun", path.join(root, "scripts/dev-migrate.cjs")], { cwd: path.join(root, "packages/backend"), env });
  showStatus();
}

function serviceUrl(name) {
  return capture(["portless", "get", name, "--no-worktree"]);
}

function showStatus() {
  console.log(`Worktree: ${root}\nIdentidad: ${id}\nCompose: ${project}\nVolumen: ${volume}`);
  console.log(`Frontend: ${serviceUrl(frontend)}\nBackend: ${serviceUrl(backend)}`);
  const env = databaseEnvironment();
  console.log(
    `MySQL: ${env.DATABASE_HOST}:${env.DATABASE_PORT}/${env.DATABASE_NAME}\nRespaldos: ${env.BACKUP_DIRECTORY}`,
  );
}

function acquireSession() {
  mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, "session.json");
  if (existsSync(lock)) {
    const previous = JSON.parse(readFileSync(lock, "utf8"));
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
      else throw error;
    }
    if (alive) throw new Error(`Ya hay una sesión de desarrollo activa (PID ${previous.pid}).`);
    rmSync(lock);
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  return () => rmSync(lock, { force: true });
}

async function main() {
  switch (command) {
    case "start": {
      const release = acquireSession();
      try {
        await prepare();
        await run(["mprocs", "--config", path.join(root, "mprocs.yaml")]);
      } finally {
        release();
      }
      break;
    }
    case "prepare": {
      const release = acquireSession();
      try {
        await prepare();
      } finally {
        release();
      }
      break;
    }
    case "backend":
      await run(["portless", "--name", backend, "bun", "run", "start"], {
        cwd: path.join(root, "packages/backend"),
        env: databaseEnvironment(),
      });
      break;
    case "frontend": {
      databaseEnvironment();
      await run(["portless", "--name", frontend, "bun", "run", "start"], {
        cwd: path.join(root, "packages/frontend"),
        env: environment({ DMMARKET_API_URL: serviceUrl(backend), BROWSER: "none" }),
      });
      break;
    }
    case "test:backend":
      await run(["bun", "--filter", "@dmmarket/backend", "test", "--runInBand", ...process.argv.slice(3)], {
        env: databaseEnvironment(),
      });
      break;
    case "logs":
      await run(compose(["logs", "--follow", "--tail", "100", "mysql"]), { env: composeEnvironment() });
      break;
    case "status":
      showStatus();
      break;
    case "doctor":
      checkRequirements();
      showStatus();
      await run(["bun", path.join(root, "scripts/dev-migrate.cjs"), "--check"], {
        cwd: path.join(root, "packages/backend"),
        env: databaseEnvironment(),
      });
      console.log("Configuración, aislamiento y tablas base verificados.");
      break;
    case "down":
    case "reset": {
      const release = acquireSession();
      try {
        if (command === "reset") {
          if (process.argv[3] !== "--confirm" || process.argv[4] !== project)
            throw new Error(
              `Se borrarán SOLO los datos de ${project}. Confirma con: bun run dev:reset --confirm ${project}`,
            );
          const existing = capture(["docker", "volume", "ls", "--quiet", "--filter", `name=^${volume}$`]);
          if (existing) {
            const [info] = JSON.parse(capture(["docker", "volume", "inspect", volume]));
            if (info.Labels?.["io.dmmarket.worktree"] !== root)
              throw new Error("El volumen no pertenece a este worktree. No se borró nada.");
          }
        }
        await run(compose(["down", ...(command === "reset" ? ["--volumes"] : [])]), { env: composeEnvironment() });
      } finally {
        release();
      }
      break;
    }
    default:
      throw new Error(`Comando desconocido: ${command}`);
  }
}

await main().catch((error) => {
  console.error(`Desarrollo: ${error.message}`);
  process.exitCode = 1;
});
