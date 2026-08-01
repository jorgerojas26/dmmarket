const knex = require("../database");
const model = require("../models/invoice");

const GET_INVOICES = async (req, res) => {
  const { from, to, page = 1, limit = 20, sortBy = "createdAt", sortDir = "desc", search, ruta } = req.query;

  try {
    const response = await model.GET_INVOICES({
      from,
      to,
      showNoe: req.locals.showNoe,
      page: Number(page),
      limit: Number(limit),
      sortBy,
      sortDir,
      search,
      ruta,
    });

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json(error);
    console.error(error);
  }
};

const GET_SALES = async (req, res) => {
  const { from, to, page = 1, limit = 20, sortBy = "rawProfit", sortDir = "desc" } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    // Count query — count distinct products in the grouped result
    const [{ total }] = await knex.count("* as total").from(
      knex
        .select("productos.IdProducto")
        .from(slaveTable)
        .innerJoin(masterTable, function () {
          this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
        })
        .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
        .whereBetween(`${masterTable}.Fecha`, [from, to])
        .groupBy("productos.IdProducto")
        .as("sub"),
    );

    // Data query with sorting and pagination
    const data = await model.GET_SALES_QUERY({
      from,
      to,
      showNoe: req.locals.showNoe,
      sortBy,
      sortDir,
      limit: Number(limit),
      offset: Number(offset),
    });

    // Chart data (no pagination, needed by other consumers)
    const group_sales_chart_data = await model.GET_BY_GROUP_QUERY({
      from,
      to,
      showNoe: req.locals.showNoe,
    });

    res.status(200).json({
      data,
      group_sales_chart_data,
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

const GET_SALES_BY_CATEGORY = async (req, res) => {
  const { from, to } = req.query;
  const { categoryId } = req.params;
  try {
    const sales_by_category_report = await model.GET_SALES_BY_CATEGORY({
      showNoe: req.locals.showNoe,
      from,
      to,
      categoryId,
    });

    console.log("sales_by_category_report", sales_by_category_report);

    res.status(200).json(sales_by_category_report);
  } catch (error) {
    res.status(500).json(error);
    console.error(error);
  }
};

const GET_BY_GROUP = async (req, res) => {
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    const response = await knex
      .select(
        "grupos.Descripcion as categoria",
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`),
      )
      .from(slaveTable)
      .innerJoin(masterTable, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .innerJoin("grupos", "grupos.idGrupo", "productos.Grupo")
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy("grupos.idGrupo");

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

const GET_INVOICE_DETAIL = async (req, res) => {
  const { invoiceId } = req.params;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    const rows = await knex
      .select(
        knex.raw(`mf.?? as idFactura`, [idInvoice]),
        "mf.Fecha as fecha",
        "clientes.Empresa as cliente",
        "vendedores.Empresa as vendedor",
        "sf.Descripcion as descripcion",
        "sf.Cantidad as cantidad",
        "sf.Precio as precio",
        knex.raw("ROUND(sf.Precio * sf.Cantidad, 2) as subtotal"),
      )
      .from(`${slaveTable} as sf`)
      .innerJoin(`${masterTable} as mf`, function () {
        this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", "mf.IdCliente")
      .innerJoin("vendedores", "vendedores.idVend", "mf.IdVend")
      .where(`mf.${idInvoice}`, invoiceId);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const total = rows.reduce((acc, row) => acc + Number(row.subtotal || 0), 0);

    const detail = {
      idFactura: rows[0].idFactura,
      fecha: rows[0].fecha,
      cliente: rows[0].cliente,
      vendedor: rows[0].vendedor,
      total: Math.round(total * 100) / 100,
      productos: rows.map((r) => ({
        descripcion: r.descripcion,
        cantidad: Number(r.cantidad),
        precio: Number(r.precio),
        subtotal: Number(r.subtotal),
      })),
    };

    res.status(200).json(detail);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  GET_INVOICES,
  GET_SALES,
  GET_BY_GROUP,
  GET_SALES_BY_CATEGORY,
  GET_INVOICE_DETAIL,
};
