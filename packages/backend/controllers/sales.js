const knex = require("../database");

// Base de las queries de ventas: joins + rango de fechas. Todas las queries de
// un mismo endpoint (count, data, totals) comparten esta base para que nunca se
// desincronicen al añadir/editar joins.
const withSalesBase = (q, { masterTable, slaveTable, idInvoice, from, to }) =>
  q
    .from(`${slaveTable} as sf`)
    .innerJoin(`${masterTable} as mf`, function () {
      this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
    })
    .innerJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
    .innerJoin("vendedores", "vendedores.idVend", "mf.IdVend")
    .innerJoin("productos", "productos.IdProducto", "sf.IdProducto")
    .innerJoin("grupos", "grupos.idGrupo", "productos.Grupo")
    .whereBetween("mf.Fecha", [from, to]);

// Filtros comunes (cliente, categoría, vendedor, ruta, proveedor) + búsqueda.
// `searchExpr` define el bloque de búsqueda específico de cada endpoint.
const applySalesFilters = (q, { clientId, categoryId, employeeId, ruta, proveedorId, search, searchExpr }) => {
  if (clientId) q.andWhere("mf.IdCliente", clientId);
  if (categoryId) q.andWhere("productos.Grupo", categoryId);
  if (employeeId) q.andWhere("mf.IdVend", employeeId);
  if (ruta) q.andWhere("clientes.Ruta", ruta);
  if (proveedorId) q.andWhere("productos.Proveedor", proveedorId);
  if (search && searchExpr) q.andWhere(searchExpr);
};

const searchByFactura = (search, idInvoice) => (q) => {
  q.where("clientes.Empresa", "like", `%${search}%`)
    .orWhere(`mf.${idInvoice}`, "like", `%${search}%`)
    .orWhere("productos.Descripcion", "like", `%${search}%`)
    .orWhere("productos.IdProducto", "like", `%${search}%`);
};

// GET /api/sales/facturas — invoices grouped by invoice ID
const GET_FACTURAS = async (req, res) => {
  const {
    from,
    to,
    clientId,
    categoryId,
    employeeId,
    ruta,
    proveedorId,
    page = 1,
    limit = 20,
    sortBy = "fecha",
    sortDir = "desc",
    search,
  } = req.query;

  const showNoe = req.locals.showNoe;
  const { masterTable, slaveTable, idInvoice } = showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  const offset = (Number(page) - 1) * Number(limit);

  const sortCol = (() => {
    switch (sortBy) {
      case "monto":
        return knex.raw("SUM(sf.Precio * sf.Cantidad)");
      case "utilidad":
        return knex.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad)");
      case "promedio":
        return knex.raw("AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100)");
      case "cliente":
        return "clientes.Empresa";
      case "vendedor":
        return "vendedores.Empresa";
      default:
        return "mf.Fecha";
    }
  })();

  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";
  const filters = { clientId, categoryId, employeeId, ruta, proveedorId, search };

  try {
    const searchExpr = search ? searchByFactura(search, idInvoice) : null;

    // Count
    const [{ total }] = await knex
      .countDistinct(`mf.${idInvoice} as total`)
      .modify(withSalesBase, { masterTable, slaveTable, idInvoice, from, to })
      .modify(applySalesFilters, { ...filters, searchExpr });

    // Data query
    const data = await knex
      .select(
        knex.raw(`mf.?? as invoiceId`, [idInvoice]),
        "mf.Fecha as fecha",
        "clientes.Empresa as cliente",
        "vendedores.Empresa as vendedor",
        knex.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2) as monto"),
        knex.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2) as utilidad"),
        knex.raw("ROUND(AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100), 2) as promedio"),
      )
      .modify(withSalesBase, { masterTable, slaveTable, idInvoice, from, to })
      .modify(applySalesFilters, { ...filters, searchExpr })
      .groupBy(`mf.${idInvoice}`)
      .orderBy(sortCol, sortDirection)
      .limit(Number(limit))
      .offset(Number(offset));

    // Totals: sumas de TODA la data filtrada (independientes de la página), para
    // que el pie de la tabla no dependa de la página visible.
    const [totals] = await knex
      .select(
        knex.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2) as monto"),
        knex.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2) as utilidad"),
      )
      .modify(withSalesBase, { masterTable, slaveTable, idInvoice, from, to })
      .modify(applySalesFilters, { ...filters, searchExpr });

    res.status(200).json({
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
      },
      totals,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/sales/productos — products aggregated by product ID
const GET_PRODUCTOS = async (req, res) => {
  const {
    from,
    to,
    clientId,
    categoryId,
    employeeId,
    ruta,
    proveedorId,
    page = 1,
    limit = 20,
    sortBy = "rawProfit",
    sortDir = "desc",
    search,
  } = req.query;

  const showNoe = req.locals.showNoe;
  const { masterTable, slaveTable, idInvoice } = showNoe;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  const offset = (Number(page) - 1) * Number(limit);

  const sortCol = (() => {
    switch (sortBy) {
      case "quantity":
        return knex.raw("SUM(sf.Cantidad)");
      case "peso":
        return knex.raw("SUM(sf.Cantidad * productos.Peso)");
      case "rawProfit":
        return knex.raw("SUM(sf.Precio * sf.Cantidad)");
      case "netProfit":
        return knex.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad)");
      case "averageProfitPercent":
        return knex.raw("AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100)");
      case "product":
        return "productos.Descripcion";
      default:
        return knex.raw("SUM(sf.Precio * sf.Cantidad)");
    }
  })();

  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";
  const filters = { clientId, categoryId, employeeId, ruta, proveedorId, search };

  try {
    // La búsqueda de productos solo filtra por descripción.
    const searchExpr = search ? (q) => q.andWhere("productos.Descripcion", "like", `%${search}%`) : null;

    // Count distinct products
    const [{ total }] = await knex
      .countDistinct("productos.IdProducto as total")
      .modify(withSalesBase, { masterTable, slaveTable, idInvoice, from, to })
      .modify(applySalesFilters, { ...filters, searchExpr });

    // Data query
    const data = await knex
      .select(
        "productos.Descripcion as product",
        knex.raw("ROUND(SUM(sf.Cantidad), 3) as quantity"),
        knex.raw("ROUND(SUM(sf.Cantidad * productos.Peso), 3) as peso"),
        knex.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2) as rawProfit"),
        knex.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2) as netProfit"),
        knex.raw("ROUND(AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100), 2) as averageProfitPercent"),
      )
      .modify(withSalesBase, { masterTable, slaveTable, idInvoice, from, to })
      .modify(applySalesFilters, { ...filters, searchExpr })
      .groupBy("productos.IdProducto")
      .orderBy(sortCol, sortDirection)
      .limit(Number(limit))
      .offset(Number(offset));

    // Totals: sumas de TODA la data filtrada (independientes de la página).
    const [totals] = await knex
      .select(
        knex.raw("ROUND(SUM(sf.Cantidad), 3) as quantity"),
        knex.raw("ROUND(SUM(sf.Cantidad * productos.Peso), 3) as peso"),
        knex.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2) as rawProfit"),
        knex.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2) as netProfit"),
      )
      .modify(withSalesBase, { masterTable, slaveTable, idInvoice, from, to })
      .modify(applySalesFilters, { ...filters, searchExpr });

    res.status(200).json({
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
      },
      totals,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_FACTURAS, GET_PRODUCTOS };
