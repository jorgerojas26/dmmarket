import assert from "node:assert/strict";
import database from "../database.js";
import { invoiceList } from "../controllers/sales.js";
import { createAccess } from "../auth/capabilities.js";

const access = createAccess(
  ["sales.read", "sales.financial", "sales.export"].map((capability) => ({ capability, scope: "global" })),
  [],
);

assert.ok(process.env.DATABASE_HOST);
assert.ok(process.env.DATABASE_NAME);

try {
  for (const showNoe of [
    { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" },
    { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" },
  ]) {
    const { masterTable, slaveTable, idInvoice } = showNoe;
    const [{ latest }] = await database(masterTable)
      .innerJoin(slaveTable, `${slaveTable}.${idInvoice}`, `${masterTable}.${idInvoice}`)
      .where(`${masterTable}.Anulada`, 0)
      .max(`${masterTable}.Fecha as latest`);
    assert.ok(latest, `No hay documentos vigentes con líneas para ${masterTable}`);
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
      const result = await invoiceList(database, access, {
        from,
        to,
        showNoe: String(masterTable === "masternoe"),
        sortBy: "invoiceId",
        sortDir,
        page: 1,
        limit: 50,
      });
      assert.deepEqual(
        result.data.map((row) => row.invoiceId),
        expected.map((row) => row.invoiceId),
        `${masterTable}: ID ${sortDir}`,
      );
    }
    const paginated = await invoiceList(database, access, {
      from,
      to,
      showNoe: String(masterTable === "masternoe"),
      page: 1,
      limit: 1,
      sortDir: "desc",
    });
    const all = await invoiceList(database, access, {
      from,
      to,
      showNoe: String(masterTable === "masternoe"),
      page: 1,
      limit: 5001,
      sortDir: "desc",
    });
    assert.ok(paginated.pagination.total > 0);
    assert.equal(paginated.data.length, 1);
    assert.equal(all.data.length, paginated.pagination.total, `${masterTable}: selección sin límite obsoleto`);
    assert.equal(new Set(all.data.map((row) => row.invoiceId)).size, all.pagination.total);
  }
  console.log("Orden y selección completa de facturas y notas de entrega: OK");
} finally {
  await database.destroy();
}
