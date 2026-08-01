const knex = require("../database");

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

  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

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

  try {
    // Count
    const countQuery = knex
      .countDistinct(`mf.${idInvoice} as total`)
      .from(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
      .innerJoin("vendedores", "vendedores.idVend", "mf.IdVend")
      .innerJoin("productos", "productos.IdProducto", "sf.IdProducto")
      .innerJoin("grupos", "grupos.idGrupo", "productos.Grupo")
      .whereBetween("mf.Fecha", [from, to])
      .modify((q) => {
        if (clientId) q.andWhere("mf.IdCliente", clientId);
        if (categoryId) q.andWhere("productos.Grupo", categoryId);
        if (employeeId) q.andWhere("mf.IdVend", employeeId);
        if (ruta) q.andWhere("clientes.Ruta", ruta);
        if (proveedorId) q.andWhere("productos.Proveedor", proveedorId);
        if (search) {
          q.andWhere(function () {
            this.where("clientes.Empresa", "like", `%${search}%`).orWhere(`mf.${idInvoice}`, "like", `%${search}%`);
          });
        }
      });

    const [{ total }] = await countQuery;

    // Data query
    const dataQuery = knex
      .select(
        knex.raw(`mf.?? as invoiceId`, [idInvoice]),
        "mf.Fecha as fecha",
        "clientes.Empresa as cliente",
        "vendedores.Empresa as vendedor",
        knex.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2) as monto"),
        knex.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2) as utilidad"),
        knex.raw("ROUND(AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100), 2) as promedio"),
      )
      .from(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
      .innerJoin("vendedores", "vendedores.idVend", "mf.IdVend")
      .innerJoin("productos", "productos.IdProducto", "sf.IdProducto")
      .innerJoin("grupos", "grupos.idGrupo", "productos.Grupo")
      .whereBetween("mf.Fecha", [from, to])
      .modify((q) => {
        if (clientId) q.andWhere("mf.IdCliente", clientId);
        if (categoryId) q.andWhere("productos.Grupo", categoryId);
        if (employeeId) q.andWhere("mf.IdVend", employeeId);
        if (ruta) q.andWhere("clientes.Ruta", ruta);
        if (proveedorId) q.andWhere("productos.Proveedor", proveedorId);
        if (search) {
          q.andWhere(function () {
            this.where("clientes.Empresa", "like", `%${search}%`).orWhere(`mf.${idInvoice}`, "like", `%${search}%`);
          });
        }
      })
      .groupBy(`mf.${idInvoice}`)
      .orderBy(sortCol, sortDirection)
      .limit(Number(limit))
      .offset(Number(offset));

    const data = await dataQuery;

    res.status(200).json({
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
      },
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

  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

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

  try {
    // Count distinct products
    const countQuery = knex
      .countDistinct("productos.IdProducto as total")
      .from(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
      .innerJoin("productos", "productos.IdProducto", "sf.IdProducto")
      .innerJoin("grupos", "grupos.idGrupo", "productos.Grupo")
      .whereBetween("mf.Fecha", [from, to])
      .modify((q) => {
        if (clientId) q.andWhere("mf.IdCliente", clientId);
        if (categoryId) q.andWhere("productos.Grupo", categoryId);
        if (employeeId) q.andWhere("mf.IdVend", employeeId);
        if (ruta) q.andWhere("clientes.Ruta", ruta);
        if (proveedorId) q.andWhere("productos.Proveedor", proveedorId);
        if (search) {
          q.andWhere("productos.Descripcion", "like", `%${search}%`);
        }
      });

    const [{ total }] = await countQuery;

    // Data query
    const dataQuery = knex
      .select(
        "productos.Descripcion as product",
        knex.raw("ROUND(SUM(sf.Cantidad), 3) as quantity"),
        knex.raw("ROUND(SUM(sf.Cantidad * productos.Peso), 3) as peso"),
        knex.raw("ROUND(SUM(sf.Precio * sf.Cantidad), 2) as rawProfit"),
        knex.raw("ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2) as netProfit"),
        knex.raw("ROUND(AVG((sf.Precio - sf.Costo) / NULLIF(sf.Precio, 0) * 100), 2) as averageProfitPercent"),
      )
      .from(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
      .innerJoin("productos", "productos.IdProducto", "sf.IdProducto")
      .innerJoin("grupos", "grupos.idGrupo", "productos.Grupo")
      .whereBetween("mf.Fecha", [from, to])
      .modify((q) => {
        if (clientId) q.andWhere("mf.IdCliente", clientId);
        if (categoryId) q.andWhere("productos.Grupo", categoryId);
        if (employeeId) q.andWhere("mf.IdVend", employeeId);
        if (ruta) q.andWhere("clientes.Ruta", ruta);
        if (proveedorId) q.andWhere("productos.Proveedor", proveedorId);
        if (search) {
          q.andWhere("productos.Descripcion", "like", `%${search}%`);
        }
      })
      .groupBy("productos.IdProducto")
      .orderBy(sortCol, sortDirection)
      .limit(Number(limit))
      .offset(Number(offset));

    const data = await dataQuery;

    res.status(200).json({
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_FACTURAS, GET_PRODUCTOS };
