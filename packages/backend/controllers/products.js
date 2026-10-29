const { parameters } = require("./sales");
const { productWeightColumn } = require("../product-weight");

function fail(status) {
  const error = new Error("La consulta de inventario no está permitida.");
  error.status = status;
  throw error;
}

function options(input) {
  if (input.stockOnly !== undefined && !["true", "false"].includes(input.stockOnly)) fail(400);
  const query = parameters(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "stockOnly")), {
    range: false,
    keys: ["search", "categoryId", "proveedorId", "page", "limit", "sortBy", "sortDir"],
  });
  return { ...query, stockOnly: input.stockOnly === "true" };
}

async function inventory(transaction, access, query) {
  if (!access.hasGlobal("inventory.read")) fail(403);
  const monetary = access.hasGlobal("inventory.costs");
  const providers = access.hasGlobal("providers.read");
  const sortBy = query.sortBy || "Descripcion";
  if (["PrecioA", "inventoryValue"].includes(sortBy) && !monetary) fail(403);
  if ((sortBy === "Proveedor" || query.proveedorId) && !providers) fail(403);
  const weight = transaction.raw(await productWeightColumn(transaction, "p"));
  const value = transaction.raw("ROUND(p.PrecioA * p.Existencia, 2)");
  const sort = {
    IdProducto: "p.IdProducto",
    Descripcion: "p.Descripcion",
    Grupo: "g.Descripcion",
    Peso: weight,
    Existencia: "p.Existencia",
    ...(monetary ? { PrecioA: "p.PrecioA", inventoryValue: value } : {}),
    ...(providers ? { Proveedor: "v.Empresa" } : {}),
  };
  if (!Object.hasOwn(sort, sortBy)) fail(400);
  const source = transaction("productos as p").leftJoin("grupos as g", function () {
    this.on(transaction.raw("g.IdGrupo = p.Grupo AND BINARY g.IdGrupo = BINARY p.Grupo"));
  });
  if (providers)
    source.leftJoin("proveedores as v", function () {
      this.on(transaction.raw("v.IdProveedor = p.Proveedor AND BINARY v.IdProveedor = BINARY p.Proveedor"));
    });
  if (query.search)
    source.where(function () {
      this.where("p.Descripcion", "like", `%${query.search}%`).orWhere("p.IdProducto", "like", `%${query.search}%`);
    });
  if (query.categoryId) source.whereRaw("BINARY p.Grupo = ?", [query.categoryId]);
  if (query.proveedorId) source.whereRaw("BINARY p.Proveedor = ?", [query.proveedorId]);
  if (query.stockOnly) source.where("p.Existencia", ">", 0);
  const [{ total }] = await source.clone().count("* as total");
  const data = await source
    .clone()
    .select({
      IdProducto: "p.IdProducto",
      Descripcion: "p.Descripcion",
      Peso: weight,
      Existencia: "p.Existencia",
      categoryId: "p.Grupo",
      Grupo: transaction.raw(
        "COALESCE(NULLIF(g.Descripcion, ''), CONCAT('Grupo no registrado (', COALESCE(p.Grupo, 'sin ID'), ')'))",
      ),
      ...(monetary ? { PrecioA: "p.PrecioA", inventoryValue: value } : {}),
      ...(providers
        ? {
            proveedorId: "p.Proveedor",
            Proveedor: transaction.raw(
              "COALESCE(NULLIF(v.Empresa, ''), CONCAT('Proveedor no registrado (', COALESCE(p.Proveedor, 'sin ID'), ')'))",
            ),
          }
        : {}),
    })
    .orderBy(sort[sortBy], query.sortDir)
    .orderBy("p.IdProducto")
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  const totals = await source
    .clone()
    .select({
      existencia: transaction.raw(
        "CASE WHEN COUNT(p.Existencia) = COUNT(*) THEN ROUND(COALESCE(SUM(p.Existencia), 0), 3) END",
      ),
      ...(monetary
        ? {
            inventoryValue: transaction.raw(
              "CASE WHEN COUNT(p.PrecioA * p.Existencia) = COUNT(*) THEN ROUND(COALESCE(SUM(p.PrecioA * p.Existencia), 0), 2) END",
            ),
          }
        : {}),
    })
    .first();
  return { data, total: Number(total), page: query.page, limit: query.limit, totals };
}

module.exports = { inventory, options };
