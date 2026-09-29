// Cover client history and per-client activity windows in both billing modes.
// InnoDB includes the invoice primary key in each secondary index, so the
// header scan can also join invoice lines without reading the header rows.
const indexes = [
  ["masterfact", "idx_masterfact_anulada_cliente_fecha"],
  ["masternoe", "idx_masternoe_anulada_cliente_fecha"],
];

async function changeIndexes(knex, add) {
  const connection = await knex.client.acquireConnection();
  const query = (sql, bindings = []) => knex.raw(sql, bindings).connection(connection);
  let previousMode;
  try {
    const [[row]] = await query("SELECT @@SESSION.sql_mode as mode");
    previousMode = row.mode;
    // Legacy dumps have zero-date defaults; relax only this connection while
    // altering their tables, then restore its original mode before release.
    await query("SET SESSION sql_mode = ''");
    for (const [table, index] of indexes) {
      const [existing] = await query("SHOW INDEX FROM ?? WHERE Key_name = ?", [table, index]);
      if (add && existing.length === 0) {
        await query("ALTER TABLE ?? ADD INDEX ?? (Anulada, IdCliente, Fecha)", [table, index]);
      } else if (!add && existing.length > 0) {
        await query("ALTER TABLE ?? DROP INDEX ??", [table, index]);
      }
    }
  } finally {
    try {
      if (previousMode !== undefined) await query("SET SESSION sql_mode = ?", [previousMode]);
    } finally {
      await knex.client.releaseConnection(connection);
    }
  }
}

// MySQL DDL commits implicitly; use a dedicated connection, not a transaction.
exports.config = { transaction: false };
exports.up = (knex) => changeIndexes(knex, true);
exports.down = (knex) => changeIndexes(knex, false);
