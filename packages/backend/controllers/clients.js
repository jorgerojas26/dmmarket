const knex = require("../database");
const MONTHS = require("../utils/months");

const GET_CLIENTS = async (req, res) => {
  const { filter } = req.query;

  try {
    if (filter) {
      try {
        const response = await knex
          .select("IdCliente", "Empresa as name")
          .from("clientes")
          .where(knex.raw(`Empresa LIKE '%${filter}%'`));
        res.status(200).json(response);
      } catch (error) {
        console.log(error);
      }
    } else {
      try {
        const response = await knex
          .select("IdCliente", "Empresa as name")
          .from("clientes");
        res.status(200).json(response);
      } catch (error) {
        console.log(error);
      }
    }
  } catch (error) {
    console.error(error);
  }
};

const GET_BEST_CLIENTS = async (req, res) => {
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    const response = await knex
      .select(
        "clientes.Empresa as client",
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as total_USD`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy("clientes.IdCliente")
      .orderBy("total_USD", "desc");

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

const GET_BEST_CLIENTS_PER_PRODUCT = async (req, res) => {
  const { productId } = req.params;
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    const response = await knex
      .select(
        "clientes.Empresa as client",
        knex.raw(`ROUND(SUM(${slaveTable}.Cantidad), 2) as quantity_total`),
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as total_USD`
        ),
        knex.raw(
          `ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${slaveTable}.IdProducto`, productId)
      .groupBy("clientes.IdCliente")
      .orderBy("total_USD", "desc");

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

const MONTHLY_AVERAGE = async (req, res) => {
  const { clientId } = req.params;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    let response = await knex
      .select(
        knex.raw(`
          MIN(clientes.Empresa) as client,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 1, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Enero,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 1, ${slaveTable}.${idInvoice}, NULL))  AS Enero_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 2, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Febrero,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 2, ${slaveTable}.${idInvoice}, NULL))  AS Febrero_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 3, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Marzo,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 3, ${slaveTable}.${idInvoice}, NULL))  AS Marzo_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 4, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Abril,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 4, ${slaveTable}.${idInvoice}, NULL))  AS Abril_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 5, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Mayo,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 5, ${slaveTable}.${idInvoice}, NULL))  AS Mayo_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 6, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Junio,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 6, ${slaveTable}.${idInvoice}, NULL))  AS Junio_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 7, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Julio,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 7, ${slaveTable}.${idInvoice}, NULL))  AS Julio_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 8, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2)  AS Agosto,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 8, ${slaveTable}.${idInvoice}, NULL))  AS Agosto_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 9, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2) AS Septiembre,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 9, ${slaveTable}.${idInvoice}, NULL))  AS Septiembre_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 10, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2) AS Octubre,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 10, ${slaveTable}.${idInvoice}, NULL))  AS Octubre_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 11, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2) AS Noviembre,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 11, ${slaveTable}.${idInvoice}, NULL))  AS Noviembre_transactions,
       ROUND(SUM(IF(MONTH(${masterTable}.Fecha) = 12, ${slaveTable}.Precio * ${slaveTable}.Cantidad, NULL)), 2) AS Diciembre,
       COUNT(IF(MONTH(${masterTable}.Fecha) = 12, ${slaveTable}.${idInvoice}, NULL))  AS Diciembre_transactions
            `)
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .where(
        knex.raw(`YEAR(${masterTable}.Fecha)`),
        knex.raw("YEAR(CURDATE())")
      )
      .andWhere(`${masterTable}.IdCliente`, clientId)
      .groupBy(`${masterTable}.IdCliente`);

    response = response.reduce(
      (acc, current) => ({
        id: current.client,
        data: Object.keys(MONTHS).map(
          (month) => ({ x: MONTHS[month], y: current[month] }),
          []
        ),
      }),
      {}
    );
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

const GET_CLIENT_SALES = async (req, res) => {
  const { clientId } = req.params;
  const { from, to, page = 1, limit = 20 } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;
  const offset = (page - 1) * limit;

  try {
    const [{ count }] = await knex
      .countDistinct({ count: `${masterTable}.${idInvoice}` })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdCliente`, clientId);

    const data = await knex
      .select(
        "vendedores.Empresa as vendedor",
        `${masterTable}.Fecha as fecha`,
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as monto`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdCliente`, clientId)
      .groupBy(`${masterTable}.${idInvoice}`)
      .orderBy(`${masterTable}.Fecha`, "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    res.status(200).json({
      data,
      total: Number(count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
  }
};

const GET_CLIENT_SUMMARY = async (req, res) => {
  const { clientId } = req.params;
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    const [aggregate] = await knex
      .select(
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalAmount`
        ),
        knex.raw(
          `COUNT(DISTINCT ${masterTable}.${idInvoice}) as totalCount`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdCliente`, clientId);

    const totalAmount = Number(aggregate.totalAmount) || 0;
    const totalCount = Number(aggregate.totalCount) || 0;
    const avgTicket =
      totalCount > 0
        ? Math.round((totalAmount / totalCount) * 100) / 100
        : null;

    // avgDaysBetweenSales using CTE + window function LAG()
    const saleDatesQuery = knex
      .distinct(`${masterTable}.Fecha as fecha`)
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(
          `${masterTable}.${idInvoice}`,
          `${slaveTable}.${idInvoice}`
        ).andOn(`${masterTable}.Anulada`, 0);
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdCliente`, clientId)
      .orderBy(`${masterTable}.Fecha`, "asc");

    const gapsQuery = knex
      .select(
        knex.raw(
          "DATEDIFF(fecha, LAG(fecha) OVER (ORDER BY fecha)) as gap"
        )
      )
      .from("sale_dates");

    const [avgDaysResult] = await knex
      .with("sale_dates", saleDatesQuery)
      .with("gaps", gapsQuery)
      .select(knex.raw("ROUND(AVG(gap), 1) as avgDaysBetweenSales"))
      .from("gaps")
      .whereNotNull("gap");

    const avgDaysBetweenSales =
      avgDaysResult && avgDaysResult.avgDaysBetweenSales != null
        ? Number(avgDaysResult.avgDaysBetweenSales)
        : null;

    res.status(200).json({
      totalAmount,
      totalCount,
      avgTicket,
      avgDaysBetweenSales,
    });
  } catch (error) {
    console.error(error);
  }
};

const GET_CLIENTS_LIST = async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    // Build data query with LEFT JOINs so clients with 0 sales still appear
    const dataQuery = knex
      .select(
        "clientes.IdCliente",
        "clientes.Empresa",
        knex.raw(
          `COALESCE(ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2), 0) as total_ventas`
        ),
        knex.raw(
          `COUNT(DISTINCT ${masterTable}.${idInvoice}) as num_ventas`
        )
      )
      .from("clientes")
      .leftJoin(masterTable, function () {
        this.on("clientes.IdCliente", `${masterTable}.IdCliente`).andOn(
          `${masterTable}.Anulada`,
          0
        );
      })
      .leftJoin(
        slaveTable,
        `${masterTable}.${idInvoice}`,
        `${slaveTable}.${idInvoice}`
      );

    // Count query (from clientes directly with same search filter)
    const countQuery = knex
      .countDistinct({ total: "clientes.IdCliente" })
      .from("clientes");

    if (search) {
      dataQuery.where("clientes.Empresa", "like", `%${search}%`);
      countQuery.where("clientes.Empresa", "like", `%${search}%`);
    }

    const [{ total }] = await countQuery;

    const data = await dataQuery
      .groupBy("clientes.IdCliente")
      .orderBy("total_ventas", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    res.status(200).json({
      data,
      total: Number(total),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  GET_CLIENTS,
  GET_BEST_CLIENTS,
  GET_BEST_CLIENTS_PER_PRODUCT,
  MONTHLY_AVERAGE,
  GET_CLIENT_SALES,
  GET_CLIENT_SUMMARY,
  GET_CLIENTS_LIST,
};
