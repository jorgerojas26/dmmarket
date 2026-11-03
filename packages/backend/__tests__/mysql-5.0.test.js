const integrationTest = process.env.MYSQL_50_TEST === "1" ? test : test.skip;

test("uses a MySQL 5.0 compatible client charset for migrations", () => {
  expect(require("../knexfile").connection.charset).toBe("utf8");
});

integrationTest("preserves accented input and results through the application connection on MySQL 5.0.24", async () => {
  const database = require("../database");
  try {
    const [version] = await database.raw("SELECT VERSION() AS version");
    expect(version[0].version).toBe("5.0.24");
    await database.transaction(async (connection) => {
      await connection.raw(
        "CREATE TEMPORARY TABLE mysql_compat_probe (label varchar(50) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=latin1",
      );
      const label = "áéíóúñ Ñ Ü";
      await connection("mysql_compat_probe").insert({ label });
      const row = await connection("MYSQL_COMPAT_PROBE").where("label", label).first();
      expect(row.label).toBe(label);
      const [charsets] = await connection.raw(
        "SELECT @@character_set_client AS clientCharset, @@character_set_results AS resultsCharset",
      );
      expect(charsets[0]).toEqual({ clientCharset: "utf8", resultsCharset: "utf8" });
      await connection.raw("DROP TEMPORARY TABLE mysql_compat_probe");
    });
  } finally {
    await database.destroy();
  }
});
