const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startEnvironment } = require("../../../tests/support/auth-environment.cjs");
const { testContainer, dropFixtureDatabase, realDatabase } = require("../../../tests/support/test-database.cjs");
let first;
let second;
afterEach(async () => {
  await first?.close();
  await second?.close();
  first = null;
  second = null;
});

test("dos suites comparten MySQL de Compose sin compartir tablas ni borrar el contenedor", async () => {
  first = await startEnvironment();
  second = await startEnvironment();
  expect(first.container).toBe(second.container);
  expect(first.configuration.DATABASE_NAME).not.toBe(second.configuration.DATABASE_NAME);
  const user = await first.seedUser();
  expect(await second.db("dmmarket_auth_users").where("id", user.id)).toEqual([]);
  await first.close();
  expect((await second.db.raw("SELECT 1 AS alive"))[0][0].alive).toBe(1);
  expect(testContainer().Id).toBe(second.container);
});

test("la limpieza rechaza desarrollo y la copia real", async () => {
  for (const name of ["bdsolser_md_nieto", "dmmarket_real_test", "mysql", "dmmarket_test_unsafe`"])
    await expect(dropFixtureDatabase(name)).rejects.toThrow();
});

test("las credenciales de una suite no pueden leer otra base ni borrar la copia real", async () => {
  first = await startEnvironment();
  second = await startEnvironment();
  await expect(
    first.db.raw("SELECT * FROM ??.dmmarket_auth_users", [second.configuration.DATABASE_NAME]),
  ).rejects.toThrow();
  await expect(first.db.raw("DROP DATABASE dmmarket_real_test")).rejects.toThrow();
});

test("detener desarrollo conserva el contenedor, los fixtures y la copia real de tests", async () => {
  first = await startEnvironment();
  const user = await first.seedUser();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dmmarket-dev-isolation-")));
  const project = `dmmarket-${path.basename(root).toLowerCase().slice(0, 30)}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`;
  const compose = ["compose", "--project-name", project, "--file", path.join(root, "docker-compose.yml")];
  const env = { ...process.env, DMMARKET_DEV_ROOT: root, DMMARKET_DEV_DUMP: path.join(root, "bdsolser_md_nieto.dump") };
  const source = path.resolve(__dirname, "../../..");
  const docker = (args) => execFileSync("docker", [...compose, ...args], { cwd: root, env, stdio: "pipe" });
  try {
    fs.mkdirSync(path.join(root, "scripts"));
    for (const file of ["dev.mjs", "dev-https.mjs", "prepare-caddy.mjs"])
      fs.copyFileSync(path.join(source, "scripts", file), path.join(root, "scripts", file));
    fs.copyFileSync(path.join(source, "docker-compose.yml"), path.join(root, "docker-compose.yml"));
    fs.writeFileSync(env.DMMARKET_DEV_DUMP, "SELECT 1;\n");
    docker(["create", "mysql"]);
    expect(docker(["ps", "--all", "--quiet", "mysql"]).toString().trim()).toBeTruthy();
    execFileSync("bun", ["scripts/dev.mjs", "down"], { cwd: root, stdio: "pipe" });
    expect(docker(["ps", "--all", "--quiet", "mysql"]).toString().trim()).toBe("");
    expect(testContainer().Id).toBe(first.container);
    expect(await first.db("dmmarket_auth_users").where("id", user.id)).toHaveLength(1);
    const db = realDatabase();
    try {
      expect(Number((await db("masterfact").count("* as total").first()).total)).toBeGreaterThan(0);
    } finally {
      await db.destroy();
    }
  } finally {
    try {
      docker(["down", "--volumes", "--remove-orphans"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("la copia real permite consultas pero no escrituras", async () => {
  const db = realDatabase();
  try {
    const [{ total }] = await db("masterfact").count("* as total");
    expect(Number(total)).toBeGreaterThan(0);
    await expect(db("masterfact").whereRaw("1 = 0").del()).rejects.toThrow();
  } finally {
    await db.destroy();
  }
});
