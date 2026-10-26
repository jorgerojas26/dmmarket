const { backend } = require("../../../tests/support/auth-environment.cjs");
const { realDatabase } = require("../../../tests/support/test-database.cjs");
const { CAPABILITIES, createAccess } = backend("./auth/capabilities");
const { salesBase } = backend("./auth/sales-reports");
const { purchaseBase } = backend("./auth/purchase-reports");
const access = createAccess(
  Object.keys(CAPABILITIES).map((capability) => ({ capability, scope: "global" })),
  [],
);
let db;

beforeAll(() => {
  db = realDatabase();
});
afterAll(async () => {
  await db?.destroy();
});

async function plan(base, identity) {
  const query = base.select(identity).limit(1).toSQL();
  const [rows] = await db.raw(`EXPLAIN ${query.sql}`, query.bindings);
  return rows.map((row) => ({
    table: String(row.table),
    type: String(row.type),
    key: row.key && String(row.key),
    rows: Number(row.rows),
  }));
}

function expectIndexed(rows, aliases) {
  for (const alias of aliases) {
    const entry = rows.find((row) => row.table === alias);
    expect(entry).toBeDefined();
    expect(["const", "eq_ref", "ref"]).toContain(entry.type);
    expect(entry.key).toBeTruthy();
    expect(entry.rows).toBeLessThan(100);
  }
}

test.each([false, true])(
  "joins de ventas usan índices existentes con la copia real MySQL 5.0 (NOE=%s)",
  async (noe) => {
    const table = noe ? "masternoe" : "masterfact";
    const [{ latest }] = await db(table).max("Fecha as latest");
    const { base, invoice } = salesBase(db, access, { from: latest, to: latest, showNoe: String(noe) });
    const rows = await plan(base, `mf.${invoice}`);
    expectIndexed(rows, ["c", "v", "p"]);
    if (!noe) expectIndexed(rows, ["sf"]);
  },
);

test("joins de compras usan los índices existentes de productos y proveedores", async () => {
  const [{ latest }] = await db("mastercomp").max("Fecha as latest");
  const { base } = purchaseBase(db, access, { from: latest, to: latest }, true);
  expectIndexed(await plan(base, "mc.IdFactura"), ["p", "v"]);
});
