const { execFileSync } = require("node:child_process");
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
  execFileSync("bun", ["run", "dev:down"], { cwd: path.resolve(__dirname, "../../.."), stdio: "pipe" });
  expect(testContainer().Id).toBe(first.container);
  expect(await first.db("dmmarket_auth_users").where("id", user.id)).toHaveLength(1);
  const db = realDatabase();
  try {
    expect(Number((await db("masterfact").count("* as total").first()).total)).toBeGreaterThan(0);
  } finally {
    await db.destroy();
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
