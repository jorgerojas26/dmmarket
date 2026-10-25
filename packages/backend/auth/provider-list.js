const { salesBase, financialFields } = require("./sales-reports");
const { purchaseBase, metrics } = require("./purchase-reports");
const { reportId } = require("../utils/report-identity");

const identityKey = (value) => JSON.stringify(value == null ? null : String(value));

function fail(status) {
  throw Object.assign(new Error("La consulta de proveedores no está permitida."), { status });
}

async function providerList(tx, access, query) {
  if (!access.hasGlobal("providers.read")) fail(403);
  const sales = access.scopeFor("sales.read");
  const selling = !!query.from && (sales.global || sales.sellerIds.length > 0);
  const buying = !!query.from && access.hasGlobal("purchases.read");
  const financial = selling && financialFields(access, query);
  const costs = buying && access.hasGlobal("purchases.costs");
  const keys = [
    "IdProveedor",
    "Empresa",
    ...(selling ? ["total_ventas", "num_ventas"] : []),
    ...(financial ? ["utilidad"] : []),
    ...(buying ? ["num_compras"] : []),
    ...(costs ? ["total_compras"] : []),
  ];
  const sort = query.sortBy || "Empresa";
  if (["utilidad", "total_compras"].includes(sort) && !keys.includes(sort)) fail(403);
  if (!keys.includes(sort)) fail(400);
  const catalog = tx("proveedores").select("IdProveedor", "Empresa");
  if (query.search)
    catalog.where(function () {
      this.where("Empresa", "like", `%${query.search}%`).orWhere("IdProveedor", "like", `%${query.search}%`);
    });
  if (!selling && !buying) {
    const [{ total }] = await catalog.clone().clearSelect().count("* as total");
    const data = await catalog
      .orderBy(sort, query.sortDir)
      .orderBy("IdProveedor")
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    return { data, total: Number(total), totals: {}, page: query.page, limit: query.limit };
  }
  const entries = await catalog.orderBy("IdProveedor").limit(5001);
  if (entries.length > 5000) fail(413);
  const values = new Map(
    entries.map((row) => [
      identityKey(row.IdProveedor),
      {
        ...row,
        ...Object.fromEntries(keys.filter((key) => !["IdProveedor", "Empresa"].includes(key)).map((key) => [key, 0])),
      },
    ]),
  );
  const apply = (row, buyingRow) => {
    const key = identityKey(row.id);
    if (!values.has(key))
      values.set(key, {
        IdProveedor: reportId(row.id),
        Empresa: `Proveedor no registrado (${row.id ?? "sin ID"})`,
        ...Object.fromEntries(keys.filter((key) => !["IdProveedor", "Empresa"].includes(key)).map((key) => [key, 0])),
      });
    const result = values.get(key);
    if (buyingRow) {
      result.num_compras = Number(row.documents);
      if (costs) result.total_compras = row.amount == null ? null : Number(row.amount);
    } else {
      result.num_ventas = Number(row.documents);
      result.total_ventas = row.amount == null ? null : Number(row.amount);
      if (financial) result.utilidad = row.profit == null ? null : Number(row.profit);
    }
  };
  if (selling) {
    const { base, invoice } = salesBase(tx, access, { ...query, search: undefined });
    if (query.search) {
      base.leftJoin("proveedores as vp", function () {
        this.on("vp.IdProveedor", "=", "p.Proveedor").andOn(tx.raw("BINARY vp.IdProveedor = BINARY p.Proveedor"));
      });
      base.where(function () {
        this.where("vp.Empresa", "like", `%${query.search}%`).orWhere("p.Proveedor", "like", `%${query.search}%`);
      });
    }
    const rows = await base
      .select({
        id: "p.Proveedor",
        amount: tx.raw("CASE WHEN COUNT(*)=COUNT(sf.Precio*sf.Cantidad) THEN ROUND(SUM(sf.Precio*sf.Cantidad),2) END"),
        documents: tx.raw("COUNT(DISTINCT BINARY ??)", [`mf.${invoice}`]),
        ...(financial
          ? {
              profit: tx.raw(
                "CASE WHEN COUNT(*)=COUNT((sf.Precio-sf.Costo)*sf.Cantidad) THEN ROUND(SUM((sf.Precio-sf.Costo)*sf.Cantidad),2) END",
              ),
            }
          : {}),
      })
      .groupByRaw("BINARY p.Proveedor")
      .limit(5001);
    if (rows.length > 5000) fail(413);
    for (const row of rows) apply(row, false);
  }
  if (buying) {
    const { base } = purchaseBase(tx, access, { ...query, search: undefined }, false);
    if (query.search)
      base.where(function () {
        this.where("v.Empresa", "like", `%${query.search}%`).orWhere("mc.IdProveedor", "like", `%${query.search}%`);
      });
    const rows = await base
      .select({
        id: "mc.IdProveedor",
        documents: tx.raw("COUNT(DISTINCT BINARY mc.IdFactura)"),
        ...(costs ? { amount: metrics(tx).amount } : {}),
      })
      .groupByRaw("BINARY mc.IdProveedor")
      .limit(5001);
    if (rows.length > 5000) fail(413);
    for (const row of rows) apply(row, true);
  }
  if (values.size > 5000) fail(413);
  const all = [...values.values()];
  const totals = Object.fromEntries(
    keys
      .filter((key) => !["IdProveedor", "Empresa"].includes(key))
      .map((key) => [
        key,
        all.some((row) => row[key] == null)
          ? null
          : Math.round(all.reduce((sum, row) => sum + row[key], 0) * 100) / 100,
      ]),
  );
  all.sort((a, b) => {
    const left = a[sort],
      right = b[sort];
    const order =
      left == null
        ? right == null
          ? 0
          : -1
        : right == null
          ? 1
          : typeof left === "number"
            ? left - right
            : String(left).localeCompare(String(right), "es");
    return (
      order * (query.sortDir === "asc" ? 1 : -1) || String(a.IdProveedor).localeCompare(String(b.IdProveedor), "es")
    );
  });
  return {
    data: all.slice((query.page - 1) * query.limit, query.page * query.limit),
    total: all.length,
    totals,
    page: query.page,
    limit: query.limit,
  };
}

module.exports = { providerList };
