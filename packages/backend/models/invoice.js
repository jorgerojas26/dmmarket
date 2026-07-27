const knex = require("../database");

exports.GET_INVOICES = async ({ from, to, showNoe }) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;

  try {
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
      )
      .from(masterTable)
      .innerJoin(
        slaveTable,
        `${slaveTable}.${idInvoice}`,
        `${masterTable}.${idInvoice}`,
      )
      .innerJoin(
        "productos",
        "productos.IdProducto",
        `${slaveTable}.IdProducto`,
      )
      .innerJoin("grupos", "grupos.IdGrupo", "productos.Grupo")
      .where(`${masterTable}.Anulada`, 0)
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy(
        `${masterTable}.${idInvoice}`,
        `${slaveTable}.IdProducto`,
        `${slaveTable}.Descripcion`,
        `${slaveTable}.Cantidad`,
        `${slaveTable}.Precio`,
      )
      .orderBy(`${masterTable}.${idInvoice}`, "DESC")
      .orderBy("productos.Descripcion", "DESC");

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
      });
    });

    //calculate invoice totals
    Object.keys(invoices).forEach((invoiceId) => {
      const invoice = invoices[invoiceId];
      invoice.total = 0;
      invoice.products.forEach((product) => {
        invoice.total += product.quantity * product.price;
        invoice.total = Number(invoice.total.toFixed(2));
      });
    });

    let invoicesArray = Object.keys(invoices).map((key) => invoices[key]);

    return invoicesArray;
  } catch (error) {
    throw error;
  }
};

exports.GET_SALES_QUERY = async ({ from, to, groupId, showNoe }) => {
  const { masterTable, slaveTable, idInvoice } = showNoe;
  try {
    const response = await knex
      .select(
        "productos.Descripcion as product",
        knex.raw(`ROUND(SUM(${slaveTable}.Cantidad), 3) as quantity`),
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`,
        ),
        knex.raw(
          `ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`,
        ),
        knex.raw(
          `ROUND(AVG((${slaveTable}.Precio - ${slaveTable}.Costo) / ${slaveTable}.Precio * 100), 2) as averageProfitPercent`,
        ),
      )
      .from(slaveTable)
      .innerJoin(masterTable, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`,
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin(
        "productos",
        "productos.IdProducto",
        `${slaveTable}.IdProducto`,
      )
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
      .orderBy("rawProfit", "DESC");

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
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`,
        ),
        knex.raw(
          `ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`,
        ),
      )
      .from(slaveTable)
      .innerJoin(masterTable, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`,
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin(
        "productos",
        "productos.IdProducto",
        `${slaveTable}.IdProducto`,
      )
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

  try {
    const response = await knex
      .select(
        "grupos.Descripcion as categoria",
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as rawProfit`,
        ),
        knex.raw(
          `ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as netProfit`,
        ),
      )
      .from(slaveTable)
      .innerJoin(masterTable, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`,
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin(
        "productos",
        "productos.IdProducto",
        `${slaveTable}.IdProducto`,
      )
      .innerJoin("grupos", "grupos.idGrupo", "productos.Grupo")
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere("grupos.idGrupo", categoryId)
      .groupBy("grupos.idGrupo");

    return response;
  } catch (error) {
    throw error;
  }
};
