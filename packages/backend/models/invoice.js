const knex = require("../database");

const buildSortColumn = (sortBy, masterTable, idInvoice) => {
  const map = {
    invoiceId: `${masterTable}.${idInvoice}`,
    client: `${masterTable}.Nombre`,
    createdAt: `${masterTable}.Fecha`,
    rif: `${masterTable}.Rif`,
  };
  return map[sortBy] || `${masterTable}.Fecha`;
};

exports.GET_INVOICES = async ({
  from,
  to,
  showNoe,
  page = 1,
  limit = 20,
  sortBy = "createdAt",
  sortDir = "desc",
  search,
}) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;
  const offset = (Number(page) - 1) * Number(limit);
  const dbSortColumn = buildSortColumn(sortBy, masterTable, idInvoice);
  // ── Step 1: Get paginated invoice IDs ──
  const idQuery = knex
    .select(`${masterTable}.${idInvoice} as invoiceId`)
    .from(masterTable)
    .where(`${masterTable}.Anulada`, 0)
    .whereBetween(`${masterTable}.Fecha`, [from, to]);

  if (search) {
    idQuery.where(function () {
      this.where(`${masterTable}.Nombre`, "like", `%${search}%`).orWhere(
        `${masterTable}.${idInvoice}`,
        "like",
        `%${search}%`,
      );
    });
  }

  // Count total distinct invoices
  const [{ total }] = await knex.count("* as total").from(idQuery.clone().as("sq"));

  // Get paginated invoice IDs
  const invoiceIdRows = await idQuery
    .clone()
    .orderByRaw(`?? ${sortDir === "asc" ? "ASC" : "DESC"}`, [dbSortColumn])
    .limit(Number(limit))
    .offset(offset);

  const invoiceIds = invoiceIdRows.map((r) => r.invoiceId);

  if (invoiceIds.length === 0) {
    return { data: [], pagination: { page: Number(page), limit: Number(limit), total: Number(total) } };
  }

  // ── Step 2: Get line items for those invoice IDs ──
  const response = await knex
    .select(
      `${masterTable}.${idInvoice} as invoiceId`,
      `${masterTable}.Nombre as client`,
      `${masterTable}.Rif as rif`,
      `${masterTable}.Fecha as createdAt`,
      `${slaveTable}.IdProducto`,
      `${slaveTable}.Descripcion`,
      `${slaveTable}.Cantidad`,
      `${slaveTable}.Precio`,
      "grupos.Descripcion as group",
      "productos.Peso as peso",
    )
    .from(masterTable)
    .innerJoin(slaveTable, `${slaveTable}.${idInvoice}`, `${masterTable}.${idInvoice}`)
    .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
    .innerJoin("grupos", "grupos.IdGrupo", "productos.Grupo")
    .whereIn(`${masterTable}.${idInvoice}`, invoiceIds)
    .groupBy(
      `${masterTable}.${idInvoice}`,
      `${slaveTable}.IdProducto`,
      `${slaveTable}.Descripcion`,
      `${slaveTable}.Cantidad`,
      `${slaveTable}.Precio`,
      "productos.Peso",
    )
    .orderBy("productos.Descripcion", "DESC");

  // ── Step 3: Group line items into invoices ──
  const invoices = {};

  response.forEach((invoice) => {
    if (!invoices[invoice.invoiceId]) {
      invoices[invoice.invoiceId] = {
        invoiceId: invoice.invoiceId,
        client: invoice.client,
        rif: invoice.rif,
        createdAt: invoice.createdAt,
        products: [],
      };
    }
    invoices[invoice.invoiceId].products.push({
      productId: invoice.IdProducto,
      product: invoice.Descripcion,
      quantity: Number(invoice.Cantidad.toFixed(2)),
      price: Number(invoice.Precio.toFixed(2)),
      group: invoice.group,
      peso: Number(invoice.peso != null ? invoice.peso : 0),
    });
  });

  // Calculate invoice totals
  Object.keys(invoices).forEach((invoiceId) => {
    const invoice = invoices[invoiceId];
    invoice.total = 0;
    invoice.products.forEach((product) => {
      invoice.total += product.quantity * product.price;
      invoice.total = Number(invoice.total.toFixed(2));
    });
  });

  const invoicesArray = Object.keys(invoices).map((key) => invoices[key]);

  return {
    data: invoicesArray,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
    },
  };
};

exports.GET_SALES_QUERY = async ({ from, to, groupId, showNoe, sortBy, sortDir, limit, offset }) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;
  try {
    const query = knex
      .select(
        "productos.Descripcion as product",
        knex.raw(`ROUND(SUM(${slaveTable}.Cantidad), 3) as quantity`),
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`),
        knex.raw(
          `ROUND(AVG((${slaveTable}.Precio - ${slaveTable}.Costo) / ${slaveTable}.Precio * 100), 2) as averageProfitPercent`,
        ),
      )
      .from(slaveTable)
      .innerJoin(masterTable, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .modify((query) => {
        if (groupId) {
          query.innerJoin("grupos", "grupos.idGrupo", "productos.Grupo");
        }
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .modify((query) => {
        if (groupId) {
          query.andWhere("grupos.idGrupo", groupId);
        }
      })
      .groupBy("productos.IdProducto")
      .orderBy(sortBy || "rawProfit", sortDir || "DESC");

    if (limit) query.limit(Number(limit));
    if (offset != null) query.offset(Number(offset));

    const response = await query;
    return response;
  } catch (error) {
    return error;
  }
};

exports.GET_BY_GROUP_QUERY = async ({ from, to, showNoe }) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;

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

    return response;
  } catch (error) {
    return error;
  }
};

exports.GET_SALES_BY_CATEGORY = async ({ from, to, categoryId, showNoe }) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;
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
    .andWhere("grupos.idGrupo", categoryId)
    .groupBy("grupos.idGrupo");

  return response;
};
