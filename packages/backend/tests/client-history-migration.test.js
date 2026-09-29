const migration = require("../migrations/20260929_add_client_history_indexes");

const makeDb = (exists = false, failAlter = false) => {
  const connection = {};
  const db = {
    client: {
      acquireConnection: jest.fn().mockResolvedValue(connection),
      releaseConnection: jest.fn().mockResolvedValue(),
    },
    raw: jest.fn((sql) => ({
      connection: jest.fn((conn) => {
        expect(conn).toBe(connection);
        if (sql.startsWith("SELECT")) return Promise.resolve([[{ mode: "STRICT_TRANS_TABLES,NO_ZERO_DATE" }]]);
        if (sql.startsWith("SHOW")) return Promise.resolve([exists ? [{ Key_name: "existing" }] : []]);
        if (failAlter && sql.startsWith("ALTER")) return Promise.reject(new Error("DDL failed"));
        return Promise.resolve([]);
      }),
    })),
  };
  return db;
};

it("adds both covering header indexes and restores the session mode", async () => {
  const db = makeDb();
  await migration.up(db);
  expect(db.raw).toHaveBeenCalledWith("ALTER TABLE ?? ADD INDEX ?? (Anulada, IdCliente, Fecha)", [
    "masterfact",
    "idx_masterfact_anulada_cliente_fecha",
  ]);
  expect(db.raw).toHaveBeenCalledWith("ALTER TABLE ?? ADD INDEX ?? (Anulada, IdCliente, Fecha)", [
    "masternoe",
    "idx_masternoe_anulada_cliente_fecha",
  ]);
  expect(db.raw).toHaveBeenLastCalledWith("SET SESSION sql_mode = ?", ["STRICT_TRANS_TABLES,NO_ZERO_DATE"]);
  expect(db.client.releaseConnection).toHaveBeenCalledTimes(1);
});

it("is idempotent when the indexes already exist", async () => {
  const db = makeDb(true);
  await migration.up(db);
  expect(db.raw.mock.calls.some(([sql]) => sql.startsWith("ALTER"))).toBe(false);
});

it("can remove both indexes on rollback", async () => {
  const db = makeDb(true);
  await migration.down(db);
  expect(db.raw.mock.calls.filter(([sql]) => sql.startsWith("ALTER"))).toHaveLength(2);
});

it("restores the session and releases the connection even if DDL fails", async () => {
  const db = makeDb(false, true);
  await expect(migration.up(db)).rejects.toThrow("DDL failed");
  expect(db.raw).toHaveBeenLastCalledWith("SET SESSION sql_mode = ?", ["STRICT_TRANS_TABLES,NO_ZERO_DATE"]);
  expect(db.client.releaseConnection).toHaveBeenCalledTimes(1);
});
