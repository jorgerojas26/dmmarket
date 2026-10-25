const { salesBase, financialFields } = require("./sales-reports");
const { purchaseBase, metrics } = require("./purchase-reports");
const { sellerSalesScope } = require("./party-reports");
const { reportId } = require("../utils/report-identity");
function fail(status) {
  throw Object.assign(new Error("El agregado de proveedores no está permitido."), { status });
}

async function parties(transaction, access, query, id, sellers) {
  if (!sellers && !access.hasGlobal("clients.read")) fail(403);
  const scope = sellers ? sellerSalesScope(access) : access.scopeFor("sales.read");
  const filtered = { ...query, proveedorId: id };
  const { base, invoice } = salesBase(transaction, access, filtered);
  if (!scope.global) base.whereIn(transaction.raw("BINARY mf.IdVend"), scope.sellerIds);
  const financial = financialFields(access, filtered, scope);
  const identity = sellers ? "mf.IdVend" : "mf.IdCliente";
  const name = transaction.raw("COALESCE(NULLIF(??, ''), CONCAT(?, COALESCE(??, 'sin ID'), ')'))", [
    sellers ? "v.Empresa" : "c.Empresa",
    sellers ? "Vendedor no registrado (" : "Cliente no registrado (",
    identity,
  ]);
  if (query.search)
    base.where(function () {
      this.where(sellers ? "v.Empresa" : "c.Empresa", "like", `%${query.search}%`).orWhere(
        identity,
        "like",
        `%${query.search}%`,
      );
    });
  const sortBy = query.sortBy || "amount";
  if (sortBy === "profit" && !financial) fail(403);
  if (!["name", "amount", "invoiceCount", ...(financial ? ["profit"] : [])].includes(sortBy)) fail(400);
  const [{ total }] = await transaction
    .from(base.clone().select(identity).groupByRaw("BINARY ??", [identity]).as("i"))
    .count("* as total");
  const data = await base
    .clone()
    .select({
      [sellers ? "sellerId" : "clientId"]: identity,
      name,
      amount: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      invoiceCount: transaction.raw("COUNT(DISTINCT BINARY ??)", [`mf.${invoice}`]),
      ...(financial ? { profit: transaction.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)") } : {}),
    })
    .groupByRaw("BINARY ??", [identity])
    .orderBy(sortBy, query.sortDir)
    .orderBy(identity)
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  return {
    data: data.map((row) => ({
      ...row,
      [sellers ? "sellerId" : "clientId"]: reportId(row[sellers ? "sellerId" : "clientId"]),
    })),
    pagination: { total: Number(total), page: query.page, limit: query.limit },
  };
}

async function best(transaction, access, query, mode) {
  const buying = mode === "compras";
  if (!buying && mode !== "ventas") fail(400);
  let base;
  let identity;
  let amount;
  if (buying) {
    if (!access.hasGlobal("purchases.costs")) fail(403);
    base = purchaseBase(transaction, access, query, true).base;
    identity = "mc.IdProveedor";
    amount = metrics(transaction).amount;
  } else {
    base = salesBase(transaction, access, query).base;
    base.leftJoin("proveedores as vprov", function () {
      this.on(transaction.raw("BINARY vprov.IdProveedor = BINARY p.Proveedor"));
    });
    identity = "p.Proveedor";
    amount = transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)");
  }
  const rows = await base
    .select({
      providerId: identity,
      proveedor: transaction.raw(
        "COALESCE(NULLIF(??, ''), CONCAT('Proveedor no registrado (', COALESCE(??, 'sin ID'), ')'))",
        [buying ? "v.Empresa" : "vprov.Empresa", identity],
      ),
      monto: amount,
    })
    .groupByRaw("BINARY ??", [identity])
    .orderBy("monto", "desc")
    .orderBy(identity)
    .limit(5001);
  if (rows.length > 5000) fail(413);
  return rows.map((row) => ({ ...row, providerId: reportId(row.providerId) }));
}
module.exports = { parties, best };
