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
        const response = await knex.select("IdCliente", "Empresa as name").from("clientes");
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
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as total_USD`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
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
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as total_USD`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
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
            `),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .where(knex.raw(`YEAR(${masterTable}.Fecha)`), knex.raw("YEAR(CURDATE())"))
      .andWhere(`${masterTable}.IdCliente`, clientId)
      .groupBy(`${masterTable}.IdCliente`);

    response = response.reduce(
      (_acc, current) => ({
        id: current.client,
        data: Object.keys(MONTHS).map((month) => ({ x: MONTHS[month], y: current[month] }), []),
      }),
      {},
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
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdCliente`, clientId);

    const data = await knex
      .select(
        "vendedores.Empresa as vendedor",
        `${masterTable}.Fecha as fecha`,
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as monto`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
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
    res.status(500).json({ error: "Error al obtener las ventas del cliente" });
  }
};

const GET_CLIENT_SUMMARY = async (req, res) => {
  const { clientId } = req.params;
  const { from, to } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    const [aggregate] = await knex
      .select(
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalAmount`),
        knex.raw(`COUNT(DISTINCT ${masterTable}.${idInvoice}) as totalCount`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdCliente`, clientId);

    const totalAmount = Number(aggregate.totalAmount) || 0;
    const totalCount = Number(aggregate.totalCount) || 0;
    const avgTicket = totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : null;

    // avgDaysBetweenSales: promedio de días entre ventas consecutivas del
    // cliente en el período. (MySQL 5.7 no soporta CTEs ni window functions —
    // LAG() es de 8.0+. Se traen las fechas y se promedia en JS, robusto a la
    // versión del motor y sin consultas con sintaxis que 5.7 rechaza.)
    const saleDates = await knex
      .distinct(`${masterTable}.Fecha as fecha`)
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdCliente`, clientId)
      .orderBy(`${masterTable}.Fecha`, "asc");

    const DAY_MS = 86400000;
    // mysql2 devuelve columnas DATE como objetos Date (y a veces string) —
    // new Date() maneja ambos; las fechas DATE sin hora parsean a medianoche UTC.
    const dayOf = (d) => new Date(d).getTime();
    let avgDaysBetweenSales = null;
    if (saleDates.length > 1) {
      let totalGap = 0;
      for (let i = 1; i < saleDates.length; i++) {
        totalGap += (dayOf(saleDates[i].fecha) - dayOf(saleDates[i - 1].fecha)) / DAY_MS;
      }
      avgDaysBetweenSales = Math.round((totalGap / (saleDates.length - 1)) * 10) / 10;
    }

    res.status(200).json({
      totalAmount,
      totalCount,
      avgTicket,
      avgDaysBetweenSales,
    });
  } catch (error) {
    console.error(error);
    // Nunca dejar la petición colgada: ante un error se responde 500 (antes solo
    // se logueaba y el cliente esperaba hasta agotar su timeout).
    res.status(500).json({ error: "Error al obtener el resumen del cliente" });
  }
};

const GET_CLIENT_ROUTES = async (_req, res) => {
  try {
    // innerJoin: solo rutas que tienen nombre oficial en la tabla `rutas`.
    // Los valores sucios en clientes.Ruta (p.ej. '-1', 'G', 'val') no tienen
    // fila en `rutas` y quedan fuera del selector automáticamente.
    const response = await knex
      .select("clientes.Ruta as Id_Ruta", "rutas.Nombre as Nombre", knex.raw("COUNT(*) as clientes"))
      .from("clientes")
      .innerJoin("rutas", "rutas.Id_Ruta", "clientes.Ruta")
      .groupBy("clientes.Ruta")
      .orderBy("clientes.Ruta");

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener las rutas" });
  }
};

const GET_CLIENTS_LIST = async (req, res) => {
  const { search, ruta, from, to, page = 1, limit = 20, sortBy = "total_ventas", sortDir = "desc" } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const offset = (pageNum - 1) * limitNum;

  // Two-pass aggregation (like the dashboard refactor): slavefact joins
  // multiply rows per invoice line, so masterfact counts run on their own
  // pass (1 row per invoice) and money totals on another.
  const sortCol = (() => {
    switch (sortBy) {
      case "IdCliente":
        return "IdCliente";
      case "Empresa":
        return "Empresa";
      case "num_ventas":
        return "num_ventas";
      case "utilidad":
        return "utilidad";
      default:
        return "total_ventas";
    }
  })();

  const sortDirection = sortDir.toUpperCase() === "ASC" ? 1 : -1;

  const applyRange = (query) => {
    if (from && to) query.andWhereBetween("mf.Fecha", [from, to]);
    return query;
  };

  try {
    // 1. Clients matching search/ruta (no pagination: they are the source of
    //    truth for `total` and for keeping clients with 0 sales in the list).
    let clientsQuery = knex("clientes").select("IdCliente", "Empresa");
    if (search) clientsQuery = clientsQuery.where("clientes.Empresa", "like", `%${search}%`);
    if (ruta) clientsQuery = clientsQuery.where("clientes.Ruta", ruta);
    const clients = await clientsQuery;

    if (clients.length === 0) {
      return res.status(200).json({ data: [], total: 0, page: pageNum, limit: limitNum });
    }

    const clientIds = clients.map((c) => c.IdCliente);

    // 2. Invoice counts per client from masterfact only (no row multiplication).
    const masterAgg = await applyRange(
      knex(`${masterTable} as mf`)
        .select("mf.IdCliente")
        .select(knex.raw("MAX(mf.Fecha) as last_factura"))
        .select(knex.raw("COUNT(*) as num_ventas"))
        .whereIn("mf.IdCliente", clientIds)
        .andWhere("mf.Anulada", 0),
    ).groupBy("mf.IdCliente");

    // 3. Money totals per client from slavefact (index-only scan thanks to
    //    idx_slavefact_ventas covering (IdFactura, Precio, Cantidad, Costo)).
    const slaveAgg = await applyRange(
      knex(`${slaveTable} as sf`)
        .innerJoin(`${masterTable} as mf`, function () {
          this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
        })
        .select("mf.IdCliente")
        .select(knex.raw("COALESCE(ROUND(SUM(sf.Precio * sf.Cantidad), 2), 0) as total_ventas"))
        .select(knex.raw("COALESCE(ROUND(SUM((sf.Precio - sf.Costo) * sf.Cantidad), 2), 0) as utilidad"))
        .whereIn("mf.IdCliente", clientIds),
    ).groupBy("mf.IdCliente");

    const masterMap = new Map(masterAgg.map((r) => [r.IdCliente, r]));
    const slaveMap = new Map(slaveAgg.map((r) => [r.IdCliente, r]));

    const rows = clients.map((c) => {
      const m = masterMap.get(c.IdCliente);
      const s = slaveMap.get(c.IdCliente);
      return {
        IdCliente: c.IdCliente,
        Empresa: c.Empresa,
        last_factura: m ? m.last_factura : null,
        total_ventas: Number(s ? s.total_ventas : 0) || 0,
        num_ventas: Number(m ? m.num_ventas : 0) || 0,
        utilidad: Number(s ? s.utilidad : 0) || 0,
      };
    });

    rows.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      const cmp =
        sortCol === "IdCliente" || sortCol === "Empresa"
          ? String(va ?? "").localeCompare(String(vb ?? ""))
          : Number(va || 0) - Number(vb || 0);
      return cmp * sortDirection;
    });

    res.status(200).json({
      data: rows.slice(offset, offset + limitNum),
      total: rows.length,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_CLIENTS_SIN_FACTURAR = async (req, res) => {
  const { from, to, search, ruta, page = 1, limit = 20, sortBy = "revenue_historico", sortDir = "desc" } = req.query;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const offset = (pageNum - 1) * limitNum;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  // Same 2-pass + JS merge pattern as GET_CLIENTS_LIST: the historical
  // aggregates (all-time data) ran as one big LEFT JOIN over every invoice,
  // multiplied by slavefact lines, with a filesort over all clients.
  const sortCol = (() => {
    switch (sortBy) {
      case "IdCliente":
        return "IdCliente";
      case "Empresa":
        return "Empresa";
      case "ruta":
        return "ruta_nombre";
      case "last_factura":
        return "last_factura";
      case "dias_inactivo":
        return "dias_inactivo";
      default:
        return "revenue_historico";
    }
  })();

  const sortDirection = sortDir.toUpperCase() === "ASC" ? 1 : -1;

  try {
    // Clients with at least one invoice in the period (excluded from results)
    const invoicedInPeriod = knex(`${masterTable}`)
      .distinct(`${masterTable}.IdCliente`)
      .whereBetween("Fecha", [from, to])
      .andWhere("Anulada", 0);

    // 1. Clients without invoices in the period (source of truth for `total`).
    let clientsQuery = knex("clientes as c")
      .select("c.IdCliente", "c.Empresa")
      .select(knex.raw("COALESCE(rutas.Nombre, c.Ruta) as ruta_nombre"))
      .leftJoin("rutas", "rutas.Id_Ruta", "c.Ruta")
      .whereNotIn("c.IdCliente", invoicedInPeriod);
    if (search) clientsQuery = clientsQuery.where("c.Empresa", "like", `%${search}%`);
    if (ruta) clientsQuery = clientsQuery.where("c.Ruta", ruta);
    const clients = await clientsQuery;

    if (clients.length === 0) {
      return res.status(200).json({ data: [], total: 0, page: pageNum, limit: limitNum });
    }

    const clientIds = clients.map((c) => c.IdCliente);

    // 2. Historical last invoice and days inactive per client (all history).
    const historyAgg = await knex(`${masterTable} as mh`)
      .select("mh.IdCliente")
      .select(knex.raw("MAX(mh.Fecha) as last_factura"))
      .select(knex.raw("DATEDIFF(?, MAX(mh.Fecha)) as dias_inactivo", [to]))
      .whereIn("mh.IdCliente", clientIds)
      .andWhere("mh.Anulada", 0)
      .groupBy("mh.IdCliente");

    // 3. Historical revenue per client (all history; index-only scan thanks to
    //    idx_slavefact_ventas_cover).
    const revenueAgg = await knex(`${slaveTable} as sh`)
      .innerJoin(`${masterTable} as mh`, function () {
        this.on(`mh.${idInvoice}`, `sh.${idInvoice}`).andOn("mh.Anulada", 0);
      })
      .select("mh.IdCliente")
      .select(knex.raw("COALESCE(ROUND(SUM(sh.Precio * sh.Cantidad), 2), 0) as revenue_historico"))
      .whereIn("mh.IdCliente", clientIds)
      .groupBy("mh.IdCliente");

    const historyMap = new Map(historyAgg.map((r) => [r.IdCliente, r]));
    const revenueMap = new Map(revenueAgg.map((r) => [r.IdCliente, r]));

    const rows = clients.map((c) => {
      const h = historyMap.get(c.IdCliente);
      const rv = revenueMap.get(c.IdCliente);
      return {
        IdCliente: c.IdCliente,
        Empresa: c.Empresa,
        ruta_nombre: c.ruta_nombre,
        last_factura: h ? h.last_factura : null,
        dias_inactivo: h ? h.dias_inactivo : null,
        revenue_historico: Number(rv ? rv.revenue_historico : 0) || 0,
      };
    });

    rows.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      const cmp =
        sortCol === "IdCliente" || sortCol === "Empresa" || sortCol === "ruta_nombre" || sortCol === "last_factura"
          ? String(va ?? "").localeCompare(String(vb ?? ""))
          : Number(va || 0) - Number(vb || 0);
      return cmp * sortDirection;
    });

    res.status(200).json({
      data: rows.slice(offset, offset + limitNum),
      total: rows.length,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const { GET_CLIENTS_DASHBOARD } = require("./clients/dashboard");

module.exports = {
  GET_CLIENTS,
  GET_BEST_CLIENTS,
  GET_BEST_CLIENTS_PER_PRODUCT,
  MONTHLY_AVERAGE,
  GET_CLIENT_SALES,
  GET_CLIENT_SUMMARY,
  GET_CLIENTS_LIST,
  GET_CLIENTS_SIN_FACTURAR,
  GET_CLIENTS_DASHBOARD,
  GET_CLIENT_ROUTES,
};
