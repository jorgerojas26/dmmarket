const { salesBase, invoiceList } = require("./sales");

function fail(status) {
  throw Object.assign(new Error("La selección no está autorizada para exportar."), { status });
}

function aggregate(invoices) {
  const financial = invoices.every((row) => Object.hasOwn(row, "utilidad"));
  const grouped = new Map();
  const add = (left, right) => (left == null || right == null ? null : left + right);
  for (const invoice of invoices)
    for (const product of invoice.products) {
      let row = grouped.get(product.productId);
      if (!row) {
        row = { ...product, quantity: 0, peso: 0, total: 0, ...(financial ? { utilidad: 0 } : {}) };
        grouped.set(product.productId, row);
      }
      const quantity = product.quantity;
      row.quantity = add(row.quantity, quantity);
      row.peso = add(row.peso, quantity == null || product.peso == null ? null : quantity * product.peso);
      row.total = add(row.total, quantity == null || product.price == null ? null : quantity * product.price);
      if (financial)
        row.utilidad = add(
          row.utilidad,
          quantity == null || product.price == null || product.cost == null
            ? null
            : (product.price - product.cost) * quantity,
        );
    }
  const products = [...grouped.values()];
  const total = products.reduce((sum, row) => add(sum, row.total), 0);
  return { products, total };
}

async function dispatchExport(tx, access, input) {
  if (
    !input ||
    Object.keys(input).some((key) => !["invoiceIds", "showNoe"].includes(key)) ||
    ![true, false].includes(input.showNoe) ||
    !Array.isArray(input.invoiceIds) ||
    !input.invoiceIds.length ||
    input.invoiceIds.length > 5000 ||
    input.invoiceIds.some((id) => typeof id !== "string" || !id || id.length > 128 || /[\p{Cc}\p{Cs}]/u.test(id))
  )
    fail(400);
  const ids = [...new Set(input.invoiceIds)];
  const query = { showNoe: String(input.showNoe), page: 1, limit: 5001, sortBy: "fecha", sortDir: "desc" };
  const { base, invoice } = salesBase(tx, access, query);
  const headers = await base
    .whereIn(tx.raw("BINARY ??", [`mf.${invoice}`]), ids)
    .select({ id: `mf.${invoice}`, sellerId: "mf.IdVend" })
    .groupByRaw("BINARY ??, BINARY mf.IdVend", [`mf.${invoice}`]);
  if (new Set(headers.map((row) => String(row.id))).size !== ids.length) fail(404);
  if (!headers.every((row) => access.canRecord("sales.export", row.sellerId))) fail(403);
  const sellers = [...new Set(headers.map((row) => row.sellerId))];
  const selectedAccess = {
    ...access,
    scopeFor: (capability) =>
      capability === "sales.read"
        ? { global: sellers.some((id) => id == null), sellerIds: sellers.filter((id) => id != null) }
        : access.scopeFor(capability),
  };
  const result = await invoiceList(tx, selectedAccess, { ...query, invoiceIds: ids });
  const totals = aggregate(result.data);
  return { invoices: result.data, products: totals.products, total: totals.total };
}

module.exports = { dispatchExport };
