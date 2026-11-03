const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { execFileSync, spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const backend = createRequire(path.resolve(__dirname, "../../packages/backend/package.json"));
const root = fs.realpathSync(path.resolve(__dirname, "../.."));
const directory = path.join(root, ".dev");
const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
const slug =
  path
    .basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "worktree";
const project = `dmmarket-${slug}-${hash}`;
const realName = "dmmarket_real_test";
const manifestFile = path.join(directory, "test-database.json");
const fixtureName = /^dmmarket_test_[a-f0-9]{32}$/;

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function compose(args) {
  const settingsFile = path.join(root, ".dev.local.json");
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, "utf8")) : {};
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dump = settings.dump
    ? path.resolve(root, settings.dump)
    : fs.existsSync(path.join(root, "bdsolser_md_nieto.dump"))
      ? path.join(root, "bdsolser_md_nieto.dump")
      : path.resolve(common, "..", "main", "bdsolser_md_nieto.dump");
  execFileSync(
    "docker",
    ["compose", "--project-name", project, "--file", path.join(root, "docker-compose.yml"), ...args],
    {
      cwd: root,
      env: { ...process.env, DMMARKET_DEV_ROOT: root, DMMARKET_DEV_DUMP: dump },
      stdio: "inherit",
    },
  );
}

function testContainer() {
  const ids = docker(
    "ps",
    "--all",
    "--quiet",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--filter",
    "label=com.docker.compose.service=mysql-tests",
  )
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length !== 1) throw new Error("Prepara MySQL de tests con bun run test:prepare.");
  const [info] = JSON.parse(docker("inspect", ids[0]));
  const labels = info.Config.Labels || {};
  const bindings = info.NetworkSettings.Ports["3306/tcp"];
  if (
    labels["io.dmmarket.worktree"] !== root ||
    labels["io.dmmarket.test"] !== "true" ||
    info.Config.Image !== "dmmarket/mysql:5.0.24" ||
    !info.State.Running ||
    info.State.Paused ||
    bindings?.length !== 1 ||
    bindings[0].HostIp !== "127.0.0.1"
  )
    throw new Error("MySQL de tests no pertenece al worktree, no está listo o no está aislado.");
  return info;
}

function prepareDatabase() {
  compose(["up", "--detach", "--wait", "--wait-timeout", "120", "mysql-tests"]);
  return testContainer();
}

function connection(database, user = "root", password = "root") {
  const info = testContainer();
  return {
    host: "127.0.0.1",
    port: Number(info.NetworkSettings.Ports["3306/tcp"][0].HostPort),
    user,
    password,
    database,
    charset: "UTF8_GENERAL_CI",
    dateStrings: ["DATE"],
    multipleStatements: true,
  };
}

function database(configuration) {
  return backend("knex")({
    client: backend("knex/lib/dialects/mysql2"),
    connection: configuration,
    pool: { min: 0, max: 6 },
    acquireConnectionTimeout: 5000,
  });
}

async function createFixtureDatabase() {
  const name = `dmmarket_test_${randomUUID().replaceAll("-", "")}`;
  const user = `dmtest_${name.slice(-9)}`;
  const password = randomBytes(32).toString("hex");
  const admin = database(connection());
  try {
    await admin.raw("CREATE DATABASE ?? CHARACTER SET utf8 COLLATE utf8_bin", [name]);
    await admin.raw("CREATE USER ?@'%' IDENTIFIED BY ?", [user, password]);
    await admin.raw("GRANT ALL PRIVILEGES ON ??.* TO ?@'%'", [name, user]);
    return { name, user, password, container: testContainer().Id, connection: connection(name, user, password) };
  } catch (error) {
    await dropFixtureDatabase(name);
    throw error;
  } finally {
    await admin.destroy();
  }
}

async function dropFixtureDatabase(name) {
  if (!fixtureName.test(name)) throw new Error("Solo se permite borrar una base temporal de tests.");
  const admin = database(connection());
  try {
    await admin.raw("DROP DATABASE IF EXISTS ??", [name]);
    const user = `dmtest_${name.slice(-9)}`;
    if (await admin("mysql.user").where({ User: user, Host: "%" }).first()) await admin.raw("DROP USER ?@'%'", [user]);
  } finally {
    await admin.destroy();
  }
}

function realDatabase() {
  const info = testContainer();
  if (!fs.existsSync(manifestFile))
    throw new Error("Falta la copia real. Ejecuta bun run test:copy --source-container NOMBRE --source-database BASE.");
  const saved = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (saved.container !== info.Id || saved.database !== realName)
    throw new Error("La copia real no pertenece al contenedor actual. Vuelve a ejecutar test:copy.");
  return database(connection(realName, saved.user, saved.password));
}

function completed(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`El proceso SQL terminó con ${signal || code}.`)),
    );
  });
}

async function copyRealDatabase(sourceContainer, sourceDatabase, confirm, consistency = "transactional") {
  if (!["transactional", "locked"].includes(consistency)) throw new Error("Consistencia de copia no válida.");
  if (process.versions.bun) throw new Error("Ejecuta la copia con bun run test:copy para usar el stream de Node.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(sourceContainer || "") || !/^[a-zA-Z0-9_]+$/.test(sourceDatabase || ""))
    throw new Error("Indica --source-container y --source-database explícitamente.");
  const [source] = JSON.parse(docker("inspect", sourceContainer));
  const labels = source.Config.Labels || {};
  if (
    !source.State.Running ||
    labels["com.docker.compose.service"] !== "mysql" ||
    !labels["io.dmmarket.worktree"] ||
    labels["io.dmmarket.test"] === "true" ||
    source.Config.Image !== "dmmarket/mysql:5.0.24"
  )
    throw new Error("El origen debe ser el MySQL de desarrollo de un worktree, nunca un servicio instalado.");
  const destination = prepareDatabase();
  if (source.Id === destination.Id) throw new Error("Origen y destino deben ser distintos.");
  const admin = database(connection());
  const reader = "dm_real_reader";
  const password = randomBytes(32).toString("hex");
  let created = false;
  try {
    const exists = await admin("information_schema.SCHEMATA").where("SCHEMA_NAME", realName).first();
    if (exists && confirm !== realName)
      throw new Error(`Para reemplazar SOLO la copia de tests, añade --confirm ${realName}.`);
    const engines = docker(
      "exec",
      "--env",
      "MYSQL_PWD=root",
      source.Id,
      "mysql",
      "--user=root",
      "--batch",
      "--skip-column-names",
      "--execute",
      `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${sourceDatabase}' AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB'`,
    );
    if (engines !== "0" && consistency !== "locked")
      throw new Error(
        "El origen contiene tablas no transaccionales; autoriza --consistency locked para copiar con bloqueo global.",
      );
    const tables = docker(
      "exec",
      "--env",
      "MYSQL_PWD=root",
      source.Id,
      "mysql",
      "--user=root",
      "--batch",
      "--skip-column-names",
      "--execute",
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='${sourceDatabase}' ORDER BY TABLE_NAME`,
    )
      .split("\n")
      .filter(Boolean);
    for (const name of ["masterfact", "slavefact", "masternoe", "slavenoe", "productos"])
      if (!tables.includes(name)) throw new Error(`Falta ${name} en el origen.`);
    if (fs.existsSync(manifestFile)) fs.unlinkSync(manifestFile);
    await admin.raw("DROP DATABASE IF EXISTS ??", [realName]);
    await admin.raw("CREATE DATABASE ??", [realName]);
    created = true;
    const dump = spawn(
      "docker",
      [
        "exec",
        "--env",
        "MYSQL_PWD=root",
        source.Id,
        "mysqldump",
        "--user=root",
        consistency === "locked" ? "--lock-all-tables" : "--single-transaction",
        "--quick",
        "--routines",
        "--hex-blob",
        sourceDatabase,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    const restore = spawn(
      "docker",
      ["exec", "-i", "--env", "MYSQL_PWD=root", destination.Id, "mysql", "--user=root", realName],
      { stdio: ["pipe", "ignore", "inherit"] },
    );
    try {
      await Promise.all([completed(dump), completed(restore), pipeline(dump.stdout, restore.stdin)]);
    } catch (error) {
      dump.kill("SIGTERM");
      restore.kill("SIGTERM");
      throw error;
    }
    const imported = await admin("information_schema.TABLES")
      .where("TABLE_SCHEMA", realName)
      .orderBy("TABLE_NAME")
      .pluck("TABLE_NAME");
    if (JSON.stringify(tables) !== JSON.stringify(imported))
      throw new Error("La copia no contiene las mismas tablas del origen.");
    if (await admin("mysql.user").where({ User: reader, Host: "%" }).first())
      await admin.raw("DROP USER ?@'%'", [reader]);
    await admin.raw("CREATE USER ?@'%' IDENTIFIED BY ?", [reader, password]);
    await admin.raw("GRANT SELECT ON ??.* TO ?@'%'", [realName, reader]);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      manifestFile,
      JSON.stringify({
        container: destination.Id,
        database: realName,
        user: reader,
        password,
        sourceContainer: source.Id,
        sourceDatabase,
        copiedAt: new Date().toISOString(),
        tables: tables.length,
      }),
      { mode: 0o600 },
    );
    console.log(`Copia real lista: ${realName}, ${tables.length} tablas. El origen no se modificó.`);
  } catch (error) {
    if (created) await admin.raw("DROP DATABASE IF EXISTS ??", [realName]);
    throw error;
  } finally {
    await admin.destroy();
  }
}

module.exports = {
  prepareDatabase,
  testContainer,
  createFixtureDatabase,
  dropFixtureDatabase,
  realDatabase,
  copyRealDatabase,
};
