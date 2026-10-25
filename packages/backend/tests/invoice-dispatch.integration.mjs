import assert from "node:assert/strict";
import database from "../database.js";
import model from "../models/invoice.js";

assert.ok(process.env.DATABASE_HOST);
assert.ok(process.env.DATABASE_NAME);

try {
  for (const showNoe of [
    { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" },
    { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" },
  ]) {
    const { masterTable, slaveTable, idInvoice } = showNoe;
    const [{ latest }] = await database(masterTable).max("Fecha as latest");
    const from = process.env.INVOICE_TEST_FROM || `${latest.slice(0, 7)}-01`;
    const to = process.env.INVOICE_TEST_TO || latest;
    for (const sortDir of ["asc", "desc"]) {
      const expected = await database(masterTable)
        .distinct(`${masterTable}.${idInvoice} as invoiceId`)
        .innerJoin(slaveTable, `${slaveTable}.${idInvoice}`, `${masterTable}.${idInvoice}`)
        .where(`${masterTable}.Anulada`, 0)
        .whereBetween(`${masterTable}.Fecha`, [from, to])
        .orderBy(`${masterTable}.${idInvoice}`, sortDir)
        .limit(50);
      assert.ok(expected.length > 0, `No hay datos para ${masterTable}`);
      const result = await model.GET_INVOICES({ from, to, showNoe, sortBy: "invoiceId", sortDir, limit: 50 });
      assert.deepEqual(
        result.data.map((row) => row.invoiceId),
        expected.map((row) => row.invoiceId),
        `${masterTable}: ID ${sortDir}`,
      );
    }
    const paginated = await model.GET_INVOICES({ from, to, showNoe, limit: 1 });
    const all = await model.GET_INVOICES({ from, to, showNoe, limit: 1, all: true });
    assert.ok(paginated.pagination.total > 1);
    assert.equal(all.data.length, paginated.pagination.total, `${masterTable}: selección sin límite obsoleto`);
    assert.equal(new Set(all.data.map((row) => row.invoiceId)).size, all.pagination.total);
  }
  console.log("Orden y selección completa de facturas y notas de entrega: OK");
} finally {
  await database.destroy();
}
