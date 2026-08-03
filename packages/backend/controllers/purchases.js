const knex = require("../database");

const buildDashboardQuery = ({ hasCompare }) => {
  // Statement 1 — KPIs del período actual
  const kpisCurrent = `
    SELECT 
      ROUND(SUM(s.amount), 2) as totalPurchased,
      ROUND(SUM(s.quantity), 3) as totalQuantity,
      COUNT(DISTINCT s.invoiceCount) as totalInvoices,
      ROUND(SUM(s.amount) / NULLIF(COUNT(DISTINCT s.invoiceCount), 0), 2) as avgTicket,
      ROUND(SUM(s.amount) / NULLIF(SUM(s.quantity), 0), 2) as avgUnitCost
    FROM (
      SELECT 
        SUM(slavecomp.Precio * slavecomp.Cantidad) as amount,
        SUM(slavecomp.Cantidad) as quantity,
        mastercomp.IdFactura as invoiceCount
      FROM slavecomp
      INNER JOIN mastercomp ON mastercomp.IdFactura = slavecomp.IdFactura AND mastercomp.Anulada = 0
      WHERE mastercomp.Fecha BETWEEN :from AND :to
      GROUP BY mastercomp.IdFactura
    ) s`;

  // Statement 2 — Mejor proveedor (top 1 por total comprado)
  const bestProvider = `
    SELECT 
      mastercomp.IdProveedor as id,
      proveedores.Empresa as name,
      ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as totalPurchased
    FROM slavecomp
    INNER JOIN mastercomp ON mastercomp.IdFactura = slavecomp.IdFactura AND mastercomp.Anulada = 0
    INNER JOIN proveedores ON proveedores.IdProveedor = mastercomp.IdProveedor
    WHERE mastercomp.Fecha BETWEEN :from AND :to
    GROUP BY mastercomp.IdProveedor
    ORDER BY totalPurchased DESC
    LIMIT 1`;

  // Statement 3 — Top 30 productos por monto comprado
  const topProducts = `
    SELECT 
      productos.Descripcion as product,
      ROUND(SUM(slavecomp.Cantidad), 3) as quantity,
      ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as totalPurchased,
      ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad) / NULLIF(SUM(slavecomp.Cantidad), 0), 2) as avgUnitCost
    FROM slavecomp
    INNER JOIN mastercomp ON mastercomp.IdFactura = slavecomp.IdFactura AND mastercomp.Anulada = 0
    INNER JOIN productos ON productos.IdProducto = slavecomp.IdProducto
    WHERE mastercomp.Fecha BETWEEN :from AND :to
    GROUP BY productos.IdProducto
    ORDER BY totalPurchased DESC
    LIMIT 30`;

  // Statement 4 — Top 30 proveedores por monto comprado
  const topProviders = `
    SELECT 
      proveedores.Empresa as provider,
      ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as totalPurchased
    FROM slavecomp
    INNER JOIN mastercomp ON mastercomp.IdFactura = slavecomp.IdFactura AND mastercomp.Anulada = 0
    INNER JOIN proveedores ON proveedores.IdProveedor = mastercomp.IdProveedor
    WHERE mastercomp.Fecha BETWEEN :from AND :to
    GROUP BY proveedores.IdProveedor
    ORDER BY totalPurchased DESC
    LIMIT 30`;

  // Statement 5 — KPIs comparativos
  const kpisCompare = hasCompare
    ? kpisCurrent.replaceAll(":from", ":compareFrom").replaceAll(":to", ":compareTo")
    : `SELECT NULL as totalPurchased, NULL as totalQuantity, NULL as totalInvoices, NULL as avgTicket, NULL as avgUnitCost`;

  // Statement 6 — Gráfico de categorías (torta) por monto comprado
  const groupPurchases = `
    SELECT 
      grupos.Descripcion as categoria,
      ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as totalPurchased
    FROM slavecomp
    INNER JOIN mastercomp ON mastercomp.IdFactura = slavecomp.IdFactura AND mastercomp.Anulada = 0
    INNER JOIN productos ON productos.IdProducto = slavecomp.IdProducto
    INNER JOIN grupos ON grupos.IdGrupo = productos.Grupo
    WHERE mastercomp.Fecha BETWEEN :from AND :to
    GROUP BY grupos.IdGrupo`;

  return [kpisCurrent, bestProvider, topProducts, topProviders, kpisCompare, groupPurchases].join(";");
};

const formatKpis = (currentResultSet, compareResultSet) => {
  const c = currentResultSet?.[0] ? currentResultSet[0] : {};
  const p = compareResultSet?.[0] ? compareResultSet[0] : {};

  return {
    totalPurchased: Number(c.totalPurchased) || 0,
    totalQuantity: Number(c.totalQuantity) || 0,
    totalInvoices: Number(c.totalInvoices) || 0,
    avgTicket: Number(c.avgTicket) || 0,
    avgUnitCost: Number(c.avgUnitCost) || 0,
    comparePurchased: p.totalPurchased != null ? Number(p.totalPurchased) : null,
    compareQuantity: p.totalQuantity != null ? Number(p.totalQuantity) : null,
    compareInvoices: p.totalInvoices != null ? Number(p.totalInvoices) : null,
  };
};

const GET_DASHBOARD_PURCHASES = async (req, res) => {
  const { from, to, compareFrom, compareTo } = req.query;

  // Validar parámetros obligatorios
  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const hasCompare = !!(compareFrom && compareTo);

    // Construir SQL multi-statement con named bindings (:from, :to, :compareFrom, :compareTo)
    const sql = buildDashboardQuery({ hasCompare });

    // Pasar solo los bindings que el SQL realmente usa
    const bindings = { from, to };
    if (hasCompare) {
      bindings.compareFrom = compareFrom;
      bindings.compareTo = compareTo;
    }

    // Una sola llamada a MySQL. knex reemplaza :from/:to/:compareFrom/:compareTo con ? + escaping.
    const [results] = await knex.raw(sql, bindings);

    const response = {
      kpis: formatKpis(results[0], results[4]),
      bestProvider: results[1][0] || null,
      topProducts: results[2] || [],
      topProviders: results[3] || [],
      groupPurchasesChart: results[5] || [],
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PARETO_PURCHASES = async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  try {
    const rows = await knex
      .select(
        "productos.Descripcion as product",
        knex.raw(`ROUND(SUM(slavecomp.Cantidad), 3) as quantity`),
        knex.raw(`ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as totalPurchased`),
      )
      .from("slavecomp")
      .innerJoin("mastercomp", function () {
        this.on("mastercomp.IdFactura", "slavecomp.IdFactura").andOn("mastercomp.Anulada", 0);
      })
      .innerJoin("productos", "productos.IdProducto", "slavecomp.IdProducto")
      .whereBetween("mastercomp.Fecha", [from, to])
      .groupBy("productos.IdProducto")
      .orderBy("totalPurchased", "DESC");

    // Calcular acumulados en JS
    const total = rows.reduce((sum, r) => sum + Number(r.totalPurchased || 0), 0);
    let cumulative = 0;
    const products = rows.map((r, i) => {
      cumulative += Number(r.totalPurchased || 0);
      const cumulativePercent = total > 0 ? Math.round((cumulative / total) * 10000) / 100 : 0;
      return {
        ...r,
        rank: i + 1,
        cumulativeProfit: Math.round(cumulative * 100) / 100,
        cumulativePercent,
        abcClass: cumulativePercent <= 80 ? "A" : cumulativePercent <= 95 ? "B" : "C",
      };
    });

    // Resumen ABC
    const classA = products.filter((d) => d.abcClass === "A");
    const classB = products.filter((d) => d.abcClass === "B");
    const classC = products.filter((d) => d.abcClass === "C");

    const lastA = classA.length > 0 ? classA[classA.length - 1].cumulativePercent : 0;
    const lastB = classB.length > 0 ? classB[classB.length - 1].cumulativePercent : lastA;

    res.status(200).json({
      products,
      summary: {
        classA: {
          count: classA.length,
          profitPercent: lastA,
        },
        classB: {
          count: classB.length,
          profitPercent: Math.round((lastB - lastA) * 100) / 100,
        },
        classC: {
          count: classC.length,
          profitPercent: Math.round((100 - lastB) * 100) / 100,
        },
        totalProducts: products.length,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/purchases/invoices — purchase invoices grouped by invoice ID
const GET_INVOICES = async (req, res) => {
  const { from, to, proveedorId, groupId, sortBy = "fecha", sortDir = "desc", search } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  // Sanitizar page/limit: "" o texto no numérico caen a los defaults (1 y 20), nunca OFFSET negativo
  const limit = Number(req.query.limit) || 20;
  const page = Number(req.query.page) || 1;
  const offset = (page - 1) * limit;

  const sortCol = (() => {
    switch (sortBy) {
      case "numero":
        return "mc.IdFactura";
      case "proveedor":
        return "proveedores.Empresa";
      case "monto":
        return knex.raw("SUM(sc.Precio * sc.Cantidad)");
      case "unidades":
        return knex.raw("SUM(sc.Cantidad)");
      default:
        return "mc.Fecha";
    }
  })();

  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";

  try {
    const buildFilters = (q) => {
      if (proveedorId) q.andWhere("mc.IdProveedor", proveedorId);
      if (groupId) q.andWhere("productos.Grupo", groupId);
      if (search) {
        q.andWhere(function () {
          this.where("mc.IdFactura", "like", `%${search}%`).orWhere("proveedores.Empresa", "like", `%${search}%`);
        });
      }
    };

    // Count
    const [{ total }] = await knex
      .countDistinct("mc.IdFactura as total")
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .innerJoin("proveedores", "proveedores.IdProveedor", "mc.IdProveedor")
      .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
      .whereBetween("mc.Fecha", [from, to])
      .modify(buildFilters);

    // Data query
    const data = await knex
      .select(
        "mc.IdFactura as invoiceId",
        "proveedores.Empresa as proveedor",
        "mc.Fecha as fecha",
        knex.raw("ROUND(SUM(sc.Precio * sc.Cantidad), 2) as monto"),
        knex.raw("ROUND(SUM(sc.Cantidad), 3) as unidades"),
      )
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .innerJoin("proveedores", "proveedores.IdProveedor", "mc.IdProveedor")
      .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
      .whereBetween("mc.Fecha", [from, to])
      .modify(buildFilters)
      .groupBy("mc.IdFactura")
      .orderBy(sortCol, sortDirection)
      .limit(limit)
      .offset(offset);

    res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total: Number(total),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/purchases/products — purchased products aggregated by product ID
const GET_PRODUCTS = async (req, res) => {
  const { from, to, proveedorId, groupId, sortBy = "monto", sortDir = "desc", search } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to are required" });
  }

  // Sanitizar page/limit: "" o texto no numérico caen a los defaults (1 y 20), nunca OFFSET negativo
  const limit = Number(req.query.limit) || 20;
  const page = Number(req.query.page) || 1;
  const offset = (page - 1) * limit;

  const sortCol = (() => {
    switch (sortBy) {
      case "product":
        return "productos.Descripcion";
      case "quantity":
        return knex.raw("SUM(sc.Cantidad)");
      case "avgUnitCost":
        return knex.raw("SUM(sc.Precio * sc.Cantidad) / NULLIF(SUM(sc.Cantidad), 0)");
      default:
        return knex.raw("SUM(sc.Precio * sc.Cantidad)");
    }
  })();

  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";

  try {
    const buildFilters = (q) => {
      if (proveedorId) q.andWhere("mc.IdProveedor", proveedorId);
      if (groupId) q.andWhere("productos.Grupo", groupId);
      if (search) q.andWhere("productos.Descripcion", "like", `%${search}%`);
    };

    // Count distinct products
    const [{ total }] = await knex
      .countDistinct("productos.IdProducto as total")
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .innerJoin("proveedores", "proveedores.IdProveedor", "mc.IdProveedor")
      .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
      .whereBetween("mc.Fecha", [from, to])
      .modify(buildFilters);

    // Data query
    const data = await knex
      .select(
        "productos.Descripcion as product",
        knex.raw("ROUND(SUM(sc.Cantidad), 3) as quantity"),
        knex.raw("ROUND(SUM(sc.Precio * sc.Cantidad), 2) as monto"),
        knex.raw("ROUND(SUM(sc.Precio * sc.Cantidad) / NULLIF(SUM(sc.Cantidad), 0), 2) as avgUnitCost"),
      )
      .from("slavecomp as sc")
      .innerJoin("mastercomp as mc", function () {
        this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
      })
      .innerJoin("proveedores", "proveedores.IdProveedor", "mc.IdProveedor")
      .innerJoin("productos", "productos.IdProducto", "sc.IdProducto")
      .whereBetween("mc.Fecha", [from, to])
      .modify(buildFilters)
      .groupBy("productos.IdProducto")
      .orderBy(sortCol, sortDirection)
      .limit(limit)
      .offset(offset);

    res.status(200).json({
      data,
      pagination: {
        page,
        limit,
        total: Number(total),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { GET_DASHBOARD_PURCHASES, GET_PARETO_PURCHASES, GET_INVOICES, GET_PRODUCTS };
