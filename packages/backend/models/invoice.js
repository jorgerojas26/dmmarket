const knex = require("../database");

const buildSortColumn = (sortBy, masterTable, idInvoice) => {
  const map = {
    invoiceId: `${masterTable}.${idInvoice}`,
    client: `${masterTable}.Nombre`,
    createdAt: `${masterTable}.Fecha`,
    rif: `${masterTable}.Rif`,
    utilidad: "inv_util.__utilidad",
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
  ruta,
}) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;
  const offset = (Number(page) - 1) * Number(limit);
  const dbSortColumn = buildSortColumn(sortBy, masterTable, idInvoice);
  // ── Step 1: Get paginated invoice IDs ──
  // El query de ids lleva los MISMOS joins que el Step 2: el limit/paginación/
  // sort y el count deben operar sobre el mismo set de facturas. Los joins a
  // productos/grupos son LEFT: son metadata de display (peso, categoría), no
  // validez — una factura con líneas de un producto sin grupo (o sin fila en
  // productos) es real y despachable; un INNER JOIN la descartaba y el count
  // (solo masterfact) la contaba → total ≠ data y select-all pedía de más.
  const idQuery = knex
    .select(`${masterTable}.${idInvoice} as invoiceId`)
    .distinct()
    .from(masterTable)
    .innerJoin(slaveTable, `${slaveTable}.${idInvoice}`, `${masterTable}.${idInvoice}`)
    .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
    .leftJoin("grupos", "grupos.IdGrupo", "productos.Grupo")
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

  if (ruta) {
    idQuery.leftJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`).where("clientes.Ruta", ruta);
  }

  // Count sobre el mismo query (ya DISTINCT por invoiceId) → total = facturas
  // que el data realmente devuelve.
  const [{ total }] = await knex.count("* as total").from(idQuery.clone().as("sq"));

  // Resumen de todas las facturas filtradas, no solo las de la página actual.
  const filteredInvoiceIds = idQuery.clone().as("filtered_invoices");
  const [totals] = await knex(`${slaveTable} as summary_sf`)
    .innerJoin(filteredInvoiceIds, "filtered_invoices.invoiceId", `summary_sf.${idInvoice}`)
    .select(
      knex.raw("ROUND(COALESCE(SUM(summary_sf.Precio * summary_sf.Cantidad), 0), 2) as total"),
      knex.raw("ROUND(COALESCE(SUM((summary_sf.Precio - summary_sf.Costo) * summary_sf.Cantidad), 0), 2) as utilidad"),
    );

  // Sorting by profit needs the per-invoice profit aggregation joined in.
  // (Applied only to the ordered query so the count above stays cheap.)
  if (sortBy === "utilidad") {
    idQuery.joinRaw(
      `INNER JOIN (SELECT ${slaveTable}.${idInvoice} AS __inv_id, SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad) AS __utilidad FROM ${slaveTable} GROUP BY ${slaveTable}.${idInvoice}) AS inv_util ON inv_util.__inv_id = ${masterTable}.${idInvoice}`,
    );
  }

  // Get paginated invoice IDs
  const invoiceIdRows = await idQuery
    .clone()
    .orderByRaw(`?? ${sortDir === "asc" ? "ASC" : "DESC"}`, [dbSortColumn])
    .limit(Number(limit))
    .offset(offset);

  const invoiceIds = invoiceIdRows.map((r) => r.invoiceId);

  if (invoiceIds.length === 0) {
    return {
      data: [],
      pagination: { page: Number(page), limit: Number(limit), total: Number(total) },
      totals,
    };
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
      `${slaveTable}.Costo`,
      "grupos.Descripcion as group",
      "productos.Peso as peso",
    )
    .from(masterTable)
    .innerJoin(slaveTable, `${slaveTable}.${idInvoice}`, `${masterTable}.${idInvoice}`)
    .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
    .leftJoin("grupos", "grupos.IdGrupo", "productos.Grupo")
    .whereIn(`${masterTable}.${idInvoice}`, invoiceIds)
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
      quantity: Number(invoice.Cantidad),
      price: Number(invoice.Precio),
      cost: Number(invoice.Costo != null ? invoice.Costo : 0),
      group: invoice.group,
      peso: Number(invoice.peso != null ? invoice.peso : 0),
    });
  });

  // Calculate invoice totals and profit
  Object.keys(invoices).forEach((invoiceId) => {
    const invoice = invoices[invoiceId];
    invoice.total = Number(
      invoice.products.reduce((sum, product) => sum + product.quantity * product.price, 0).toFixed(2),
    );
    invoice.utilidad = Number(
      invoice.products.reduce((sum, product) => sum + (product.price - product.cost) * product.quantity, 0).toFixed(2),
    );
  });

  const invoicesArray = Object.keys(invoices).map((key) => invoices[key]);

  return {
    data: invoicesArray,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
    },
    totals,
  };
};

exports.GET_SALES_QUERY = async ({ from, to, groupId, showNoe, sortBy, sortDir, limit, offset }) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;
  try {
    const query = knex
      .select(
        knex.raw(
          `COALESCE(NULLIF(productos.Descripcion, ''), MAX(NULLIF(${slaveTable}.Descripcion, '')), CONCAT('Producto no registrado (', COALESCE(${slaveTable}.IdProducto, 'sin ID'), ')')) as product`,
        ),
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
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .modify((query) => {
        if (groupId) {
          query.leftJoin("grupos", "grupos.idGrupo", "productos.Grupo");
        }
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .modify((query) => {
        if (groupId) {
          query.andWhere("productos.Grupo", groupId);
        }
      })
      .groupBy(`${slaveTable}.IdProducto`)
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
        knex.raw(
          "COALESCE(NULLIF(grupos.Descripcion, ''), CONCAT('Grupo no registrado (', COALESCE(NULLIF(productos.Grupo, ''), 'sin ID'), ')')) as categoria",
        ),
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`),
      )
      .from(slaveTable)
      .innerJoin(masterTable, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("grupos", "grupos.idGrupo", "productos.Grupo")
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy("productos.Grupo");

    return response;
  } catch (error) {
    return error;
  }
};

exports.GET_SALES_BY_CATEGORY = async ({ from, to, categoryId, showNoe }) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;
  const response = await knex
    .select(
      knex.raw(
        "COALESCE(NULLIF(grupos.Descripcion, ''), CONCAT('Grupo no registrado (', COALESCE(NULLIF(productos.Grupo, ''), 'sin ID'), ')')) as categoria",
      ),
      knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`),
      knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`),
    )
    .from(slaveTable)
    .innerJoin(masterTable, function () {
      this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
    })
    .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
    .leftJoin("grupos", "grupos.idGrupo", "productos.Grupo")
    .whereBetween(`${masterTable}.Fecha`, [from, to])
    .andWhere("productos.Grupo", categoryId)
    .groupBy("productos.Grupo");

  return response;
};
