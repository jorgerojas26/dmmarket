const { withReportCache } = require("./report-cache");
const express = require("express");
const { reportId } = require("../utils/report-identity");
const { parameters, salesBase, financialFields } = require("./sales-reports");

function fail(status) {
  const error = new Error("La consulta Pareto no está permitida.");
  error.status = status;
  throw error;
}

function options(input) {
  const baseKeys = ["from", "to", "showNoe", "employeeId", "clientId", "categoryId", "ruta", "proveedorId"];
  const extras = ["modo", "metric", "sortBy", "sortDir", "newSearch", "newSortBy", "newSortDir", "newPage", "newLimit"];
  if (
    Object.keys(input).some((key) => !baseKeys.includes(key) && !extras.includes(key)) ||
    Object.values(input).some((value) => typeof value !== "string" || value.length > 128)
  )
    fail(400);
  const query = {
    ...parameters(Object.fromEntries(Object.entries(input).filter(([key]) => baseKeys.includes(key)))),
    ...Object.fromEntries(extras.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])),
  };
  query.modo ||= "ventas";
  if (!["ventas", "compras-sin-vender"].includes(query.modo)) fail(400);
  for (const key of ["sortDir", "newSortDir"])
    if (query[key] !== undefined && !["asc", "desc"].includes(query[key])) fail(400);
  query.newPage = Number(input.newPage || 1);
  query.newLimit = input.newLimit === undefined ? 0 : Number(input.newLimit);
  if (
    !Number.isInteger(query.newPage) ||
    query.newPage < 1 ||
    query.newPage > 10000 ||
    !Number.isInteger(query.newLimit) ||
    query.newLimit < 0 ||
    query.newLimit > 100
  )
    fail(400);
  return query;
}

function purchases(transaction, query) {
  return transaction("slavecomp as sc")
    .join("mastercomp as mc", function () {
      this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
    })
    .whereBetween("mc.Fecha", [query.from, query.to]);
}

function restrictProducts(transaction, source, column, products, exclude = false) {
  const ids = products.filter((row) => row.productId != null).map((row) => row.productId);
  const includesNull = products.some((row) => row.productId == null);
  source.where(function () {
    const identity = transaction.raw("BINARY ??", [column]);
    if (exclude) {
      this.whereNotIn(identity, ids);
      if (includesNull) this.whereNotNull(column);
      else this.orWhereNull(column);
    } else {
      this.whereIn(identity, ids);
      if (includesNull) this.orWhereNull(column);
    }
  });
}

function sorted(rows, field, direction = "desc") {
  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left == null || right == null)
      return left == null && right == null
        ? String(a.productId).localeCompare(String(b.productId))
        : left == null
          ? 1
          : -1;
    const order = typeof left === "string" ? left.localeCompare(right) : left - right;
    return (direction === "asc" ? order : -order) || String(a.productId).localeCompare(String(b.productId));
  });
}

function classify(rows, valueKey) {
  const total = rows.reduce((sum, row) => sum + row[valueKey], 0);
  const complete = rows.every((row) => typeof row[valueKey] === "number" && Number.isFinite(row[valueKey]));
  const valid = complete && total > 0 && rows.every((row) => row[valueKey] >= 0);
  const cumulativeKey =
    valueKey === "netProfit"
      ? "cumulativeProfit"
      : valueKey === "rawProfit"
        ? "cumulativeRevenue"
        : "cumulativePurchased";
  const percentKey =
    valueKey === "netProfit" ? "profitPercent" : valueKey === "rawProfit" ? "revenuePercent" : "purchasedPercent";
  const summary = {
    totalProducts: rows.length,
    classA: { count: 0, [percentKey]: valid || !rows.length ? 0 : null },
    classB: { count: 0, [percentKey]: valid || !rows.length ? 0 : null },
    classC: { count: 0, [percentKey]: valid || !rows.length ? 0 : null },
  };
  let cumulative = 0;
  const products = sorted(rows, valueKey).map((row, index) => {
    cumulative += row[valueKey];
    const percent = valid ? (cumulative / total) * 100 : null;
    const abcClass = valid ? (percent <= 80 ? "A" : percent <= 95 ? "B" : "C") : null;
    if (abcClass) {
      summary[`class${abcClass}`].count++;
      summary[`class${abcClass}`][percentKey] += (row[valueKey] / total) * 100;
    }
    return {
      ...row,
      rank: index + 1,
      [cumulativeKey]: complete ? Math.round(cumulative * 100) / 100 : null,
      cumulativePercent: percent == null ? null : Math.round(percent * 100) / 100,
      abcClass,
    };
  });
  for (const key of ["classA", "classB", "classC"])
    if (summary[key][percentKey] != null) summary[key][percentKey] = Math.round(summary[key][percentKey] * 100) / 100;
  return { products, summary };
}

async function pareto(transaction, access, query) {
  if (!access.hasGlobal("purchases.read")) fail(403);
  const unsold = query.modo === "compras-sin-vender";
  const financial = financialFields(access, query);
  const inventory = access.hasGlobal("inventory.read") && access.hasGlobal("inventory.costs");
  const valueKey = query.metric || (unsold ? "totalPurchased" : "netProfit");
  if (unsold) {
    if (!access.hasGlobal("sales.read") || !access.hasGlobal("purchases.costs")) fail(403);
    if (["employeeId", "clientId", "ruta"].some((key) => query[key])) fail(400);
    if (valueKey !== "totalPurchased") fail(400);
  } else {
    if (!["rawProfit", "netProfit"].includes(valueKey)) fail(400);
    if (valueKey === "netProfit" && !financial) fail(403);
  }
  const restricted = (field) => {
    if (field === "inventoryValue" && !inventory) fail(403);
    if (field === "netProfit" && (unsold || !financial)) fail(403);
  };
  restricted(query.sortBy);
  restricted(query.newSortBy);
  const sortBy = query.sortBy || valueKey;
  const newSortBy = query.newSortBy || "firstPurchaseDate";
  if (
    !["quantity", valueKey, "cumulativePercent", ...(inventory ? ["inventoryValue"] : [])].includes(sortBy) ||
    !["product", "quantity", valueKey, "firstPurchaseDate", ...(inventory ? ["inventoryValue"] : [])].includes(
      newSortBy,
    )
  )
    fail(400);
  let source;
  let id;
  let quantity;
  let metrics;
  if (unsold) {
    source = purchases(transaction, query).leftJoin("productos as p", "p.IdProducto", "sc.IdProducto");
    const { base: sold } = salesBase(transaction, access, query);
    const soldProducts = await sold
      .select({ productId: transaction.raw("BINARY sf.IdProducto") })
      .groupByRaw("BINARY sf.IdProducto");
    restrictProducts(transaction, source, "sc.IdProducto", soldProducts, true);
    for (const [key, column] of [
      ["categoryId", "p.Grupo"],
      ["proveedorId", "p.Proveedor"],
    ])
      if (query[key]) source.where(column, query[key]);
    id = "sc.IdProducto";
    quantity = "sc.Cantidad";
    metrics = { totalPurchased: transaction.raw("ROUND(SUM(sc.Precio * sc.Cantidad), 2)") };
  } else {
    source = salesBase(transaction, access, query).base;
    const purchasedProducts = await purchases(transaction, query)
      .select({ productId: transaction.raw("BINARY sc.IdProducto") })
      .groupByRaw("BINARY sc.IdProducto");
    restrictProducts(transaction, source, "sf.IdProducto", purchasedProducts);
    id = "sf.IdProducto";
    quantity = "sf.Cantidad";
    metrics = {
      rawProfit: transaction.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2)"),
      ...(financial ? { netProfit: transaction.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2)") } : {}),
    };
  }
  const rows = await source
    .select({
      productId: id,
      product: transaction.raw(
        "COALESCE(NULLIF(p.Descripcion, ''), CONCAT('Producto no registrado (', COALESCE(??, 'sin ID'), ')'))",
        [id],
      ),
      quantity: transaction.raw("ROUND(SUM(??), 3)", [quantity]),
      ...metrics,
      ...(inventory
        ? {
            inventoryValue: transaction.raw(
              "CASE WHEN p.IdProducto IS NOT NULL AND p.PrecioA IS NOT NULL AND p.Existencia IS NOT NULL THEN ROUND(p.PrecioA * p.Existencia, 2) END",
            ),
          }
        : {}),
    })
    .groupByRaw("BINARY ??", [id])
    .limit(5001);
  if (rows.length > 5000) fail(413);
  const firstDates = rows.length
    ? await transaction("slavecomp as sc")
        .join("mastercomp as mc", function () {
          this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
        })
        .whereIn(
          transaction.raw("BINARY sc.IdProducto"),
          rows.map((row) => row.productId).filter((id) => id != null),
        )
        .where("mc.Fecha", "<=", query.to)
        .select({
          productId: "sc.IdProducto",
          firstPurchaseDate: transaction.raw("CAST(DATE_FORMAT(MIN(mc.Fecha), '%Y-%m-%d') AS CHAR)"),
        })
        .groupByRaw("BINARY sc.IdProducto")
    : [];
  const dates = new Map(firstDates.map((row) => [String(row.productId), row.firstPurchaseDate]));
  const cutoff = new Date(`${query.to}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffDate = cutoff.getTime();
  const products = [];
  const recent = [];
  for (const row of rows) {
    const firstPurchaseDate = row.productId == null ? null : dates.get(String(row.productId)) || null;
    const result = {
      productId: reportId(row.productId),
      product: row.product,
      quantity: row.quantity == null ? null : Number(row.quantity),
      ...Object.fromEntries(
        Object.keys(metrics).map((field) => [field, row[field] == null ? null : Number(row[field])]),
      ),
      ...(inventory ? { inventoryValue: row.inventoryValue == null ? null : Number(row.inventoryValue) } : {}),
      firstPurchaseDate,
    };
    if (firstPurchaseDate && Date.parse(firstPurchaseDate) > cutoffDate) recent.push(result);
    else products.push(result);
  }
  const classified = classify(products, valueKey);
  const filtered = query.newSearch
    ? recent.filter((row) => row.product.toLocaleLowerCase("es").includes(query.newSearch.toLocaleLowerCase("es")))
    : recent;
  const newProducts = sorted(filtered, newSortBy, query.newSortDir || "desc");
  return {
    ...classified,
    products: sorted(classified.products, sortBy, query.sortDir || "desc"),
    valueKey,
    newProductsCount: recent.length,
    newProductsTotal: filtered.length,
    ...(inventory
      ? {
          newProductsInventoryTotal: filtered.some((row) => row.inventoryValue == null)
            ? null
            : Math.round(filtered.reduce((sum, row) => sum + row.inventoryValue, 0) * 100) / 100,
        }
      : {}),
    newProducts: query.newLimit
      ? newProducts.slice((query.newPage - 1) * query.newLimit, query.newPage * query.newLimit)
      : newProducts,
  };
}

function createParetoReports({ sessions }) {
  const router = express.Router();
  router.get("/dashboard/pareto", async (req, res, next) => {
    try {
      res.json(
        await withReportCache(req, res, sessions, ({ transaction, access }) =>
          pareto(transaction, access, options(req.query)),
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createParetoReports, classify, pareto, options };
