const knex = require("../database");

// Whitelist de columnas ordenables (la del navegador no toca el SQL).
const SORT_COLUMNS = {
  IdProducto: "productos.IdProducto",
  Descripcion: "productos.Descripcion",
  Grupo: "grupos.Descripcion",
  Proveedor: "proveedores.Empresa",
  PrecioA: "productos.PrecioA",
  Existencia: "productos.Existencia",
};

// Lista de productos con su categoría (grupos) y proveedor, con búsqueda,
// filtros de categoría/proveedor, orden y paginación server-side. Sin `limit`
// devuelve todas las filas que matchean (para imprimir el set filtrado completo).
const GET_PRODUCTS = async (req, res) => {
  const {
    search,
    categoryId,
    proveedorId,
    stockOnly,
    page = 1,
    limit,
    sortBy = "Descripcion",
    sortDir = "asc",
  } = req.query;

  try {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit));

    const applyFilters = (query) => {
      if (search) query.where("productos.Descripcion", "like", `%${search}%`);
      if (categoryId) query.where("productos.Grupo", categoryId);
      if (proveedorId) query.where("productos.Proveedor", proveedorId);
      if (stockOnly === "true") query.where("productos.Existencia", ">", 0);
    };

    const countQuery = knex
      .countDistinct({ total: "productos.IdProducto" })
      .from("productos")
      .leftJoin("grupos", "grupos.IdGrupo", "productos.Grupo")
      .leftJoin("proveedores", "proveedores.IdProveedor", "productos.Proveedor");
    applyFilters(countQuery);

    const dataQuery = knex
      .select(
        "productos.IdProducto",
        "productos.Descripcion",
        "productos.Peso",
        "productos.PrecioA",
        "productos.Existencia",
        "grupos.Descripcion as Grupo",
        "proveedores.Empresa as Proveedor",
      )
      .from("productos")
      .leftJoin("grupos", "grupos.IdGrupo", "productos.Grupo")
      .leftJoin("proveedores", "proveedores.IdProveedor", "productos.Proveedor");
    applyFilters(dataQuery);

    const sortColumn = SORT_COLUMNS[sortBy] || "productos.Descripcion";
    const direction = String(sortDir).toUpperCase() === "DESC" ? "desc" : "asc";
    dataQuery.orderBy(sortColumn, direction);

    if (limit) {
      dataQuery.limit(limitNum).offset((pageNum - 1) * limitNum);
    }

    const [{ total }] = await countQuery;
    const data = await dataQuery;

    res.status(200).json({
      data,
      total: Number(total),
      page: limit ? pageNum : 1,
      limit: limit ? limitNum : null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  GET_PRODUCTS,
};
