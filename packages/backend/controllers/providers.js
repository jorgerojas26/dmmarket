const knex = require("../database");
const { reportId, identityKey, missingName, filterIdentity, searchText } = require("../utils/report-identity");

// Los selectores solo necesitan nombres: no calcular todo el historial del reporte.
const GET_PROVIDER_OPTIONS = async (req, res) => {
  try {
    const query = knex("proveedores")
      .select("IdProveedor", "Empresa")
      .orderBy("Empresa", "asc")
      .orderBy("IdProveedor", "asc")
      .limit(20);
    if (req.query.search) query.where("Empresa", "like", `%${req.query.search}%`);
    const providers = await query;
    res.status(200).json(providers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PROVIDERS_LIST = async (req, res) => {
  const { search, from, to, page = 1, limit = 20, sortBy = "total_ventas", sortDir = "desc" } = req.query;
  const showNoe = req.query.showNoe === "true";
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const offset = (pageNum - 1) * limitNum;

  const masterTable = showNoe ? "masternoe" : "masterfact";
  const slaveTable = showNoe ? "slavenoe" : "slavefact";
  const idInvoice = showNoe ? "IdNoe" : "IdFactura";

  // Two-pass aggregation + JS merge (same pattern as GET_CLIENTS_LIST): the
  // derived subqueries were materialized by MySQL without indexes, which made
  // full-history loads crawl. Now each metric runs as its own bounded query.
  const sortCol = (() => {
    switch (sortBy) {
      case "IdProveedor":
        return "IdProveedor";
      case "Empresa":
        return "Empresa";
      case "total_compras":
        return "total_compras";
      case "num_compras":
        return "num_compras";
      case "num_ventas":
        return "num_ventas";
      case "utilidad":
        return "utilidad";
      default:
        return "total_ventas";
    }
  })();

  const sortDirection = sortDir.toUpperCase() === "ASC" ? 1 : -1;

  const applyRange = (query, column) => {
    if (from && to) query.andWhereBetween(column, [from, to]);
    return query;
  };

  try {
    const providers = await knex("proveedores as p").select("p.IdProveedor", "p.Empresa");

    // 2. Purchases: invoice counts from mastercomp (1 row per purchase invoice)
    //    and money totals from the slavecomp join.
    const purchasesCounts = await applyRange(
      knex("mastercomp as mc")
        .select("mc.IdProveedor")
        .select(knex.raw("COUNT(*) as num_compras"))
        .andWhere("mc.Anulada", 0),
      "mc.Fecha",
    ).groupBy("mc.IdProveedor");

    const purchasesTotals = await applyRange(
      knex("slavecomp as sc")
        .innerJoin("mastercomp as mc", function () {
          this.on("mc.IdFactura", "sc.IdFactura").andOn("mc.Anulada", 0);
        })
        .select("mc.IdProveedor")
        .select(knex.raw("SUM(sc.Precio * sc.Cantidad) as total_compras")),
      "mc.Fecha",
    ).groupBy("mc.IdProveedor");

    const salesCounts = await applyRange(
      knex(`${slaveTable} as sf`)
        .leftJoin("productos as pr", "pr.IdProducto", "sf.IdProducto")
        .innerJoin(`${masterTable} as mf`, function () {
          this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
        })
        .select("pr.Proveedor")
        .select(knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as num_ventas`)),
      "mf.Fecha",
    ).groupBy("pr.Proveedor");

    const salesTotals = await applyRange(
      knex(`${slaveTable} as sf`)
        .leftJoin("productos as pr", "pr.IdProducto", "sf.IdProducto")
        .innerJoin(`${masterTable} as mf`, function () {
          this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn("mf.Anulada", 0);
        })
        .select("pr.Proveedor")
        .select(knex.raw("SUM(sf.Precio * sf.Cantidad) as total_ventas"))
        .select(knex.raw("SUM((sf.Precio - sf.Costo) * sf.Cantidad) as utilidad")),
      "mf.Fecha",
    ).groupBy("pr.Proveedor");

    const toMap = (rows, key) => new Map(rows.map((row) => [identityKey(row[key]), row]));
    const purchasesCountsMap = toMap(purchasesCounts, "IdProveedor");
    const purchasesTotalsMap = toMap(purchasesTotals, "IdProveedor");
    const salesCountsMap = toMap(salesCounts, "Proveedor");
    const salesTotalsMap = toMap(salesTotals, "Proveedor");
    const identities = new Map(providers.map((provider) => [identityKey(provider.IdProveedor), provider]));
    for (const [rows, field] of [
      [purchasesCounts, "IdProveedor"],
      [salesCounts, "Proveedor"],
    ]) {
      for (const row of rows) {
        const key = identityKey(row[field]);
        if (!identities.has(key))
          identities.set(key, {
            IdProveedor: reportId(row[field]),
            Empresa: missingName("Proveedor", row[field]),
          });
      }
    }
    const rows = [...identities]
      .filter(([, provider]) => !search || searchText(provider.Empresa).includes(searchText(search)))
      .map(([key, provider]) => {
        const pc = purchasesCountsMap.get(key);
        const pt = purchasesTotalsMap.get(key);
        const sc = salesCountsMap.get(key);
        const st = salesTotalsMap.get(key);
        return {
          IdProveedor: provider.IdProveedor,
          Empresa: provider.Empresa,
          total_compras: Number(pt?.total_compras || 0),
          num_compras: Number(pc?.num_compras || 0),
          total_ventas: Number(st?.total_ventas || 0),
          utilidad: Number(st?.utilidad || 0),
          num_ventas: Number(sc?.num_ventas || 0),
        };
      });

    rows.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      const cmp =
        sortCol === "IdProveedor" || sortCol === "Empresa"
          ? String(va ?? "").localeCompare(String(vb ?? ""))
          : Number(va || 0) - Number(vb || 0);
      return cmp * sortDirection;
    });

    // Totales globales: `rows` ya es el set COMPLETO filtrado (la paginación es
    // un slice en JS), así que la suma sobre `rows` cubre todas las páginas.
    const totals = rows.reduce(
      (acc, r) => ({
        total_compras: acc.total_compras + r.total_compras,
        num_compras: acc.num_compras + r.num_compras,
        total_ventas: acc.total_ventas + r.total_ventas,
        num_ventas: acc.num_ventas + r.num_ventas,
        utilidad: acc.utilidad + r.utilidad,
      }),
      { total_compras: 0, num_compras: 0, total_ventas: 0, num_ventas: 0, utilidad: 0 },
    );
    totals.total_compras = Math.round(totals.total_compras * 100) / 100;
    totals.total_ventas = Math.round(totals.total_ventas * 100) / 100;
    totals.utilidad = Math.round(totals.utilidad * 100) / 100;

    res.status(200).json({
      data: rows.slice(offset, offset + limitNum),
      total: rows.length,
      page: pageNum,
      limit: limitNum,
      totals,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_BEST_PROVIDERS = async (req, res) => {
  const { from, to, mode = "ventas" } = req.query;
  const showNoe = req.query.showNoe === "true";

  try {
    if (mode === "compras") {
      const response = await knex
        .select(
          knex.raw(
            "COALESCE(NULLIF(proveedores.Empresa, ''), CONCAT('Proveedor no registrado (', COALESCE(NULLIF(mastercomp.IdProveedor, ''), 'sin ID'), ')')) as proveedor",
          ),
          knex.raw("ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as monto"),
        )
        .from("slavecomp")
        .innerJoin("mastercomp", function () {
          this.on("mastercomp.IdFactura", "slavecomp.IdFactura").andOn("mastercomp.Anulada", 0);
        })
        .leftJoin("proveedores", "proveedores.IdProveedor", "mastercomp.IdProveedor")
        .whereBetween("mastercomp.Fecha", [from, to])
        .groupBy("mastercomp.IdProveedor")
        .orderBy("monto", "desc");

      res.status(200).json(response);
    } else {
      // mode === "ventas"
      const masterTable = showNoe ? "masternoe" : "masterfact";
      const slaveTable = showNoe ? "slavenoe" : "slavefact";
      const idInvoice = showNoe ? "IdNoe" : "IdFactura";

      const response = await knex
        .select(
          knex.raw(
            "COALESCE(NULLIF(proveedores.Empresa, ''), CONCAT('Proveedor no registrado (', COALESCE(NULLIF(productos.Proveedor, ''), 'sin ID'), ')')) as proveedor",
          ),
          knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as monto`),
        )
        .from(`${slaveTable}`)
        .innerJoin(`${masterTable}`, function () {
          this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
        })
        .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
        .leftJoin("proveedores", "proveedores.IdProveedor", "productos.Proveedor")
        .whereBetween(`${masterTable}.Fecha`, [from, to])
        .groupBy("productos.Proveedor")
        .orderBy("monto", "desc");

      res.status(200).json(response);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PROVIDER_SUMMARY = async (req, res) => {
  const { providerId } = req.params;
  const { from, to } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };

  try {
    const [comprasResult] = await knex
      .select(
        knex.raw("COALESCE(ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2), 0) as totalCompras"),
        knex.raw("COALESCE(COUNT(DISTINCT mastercomp.IdFactura), 0) as numCompras"),
      )
      .from("slavecomp")
      .innerJoin("mastercomp", "mastercomp.IdFactura", "slavecomp.IdFactura")
      .modify((query) => filterIdentity(query, "mastercomp.IdProveedor", providerId))
      .andWhere("mastercomp.Anulada", 0)
      .andWhereBetween("mastercomp.Fecha", [from, to]);

    const [ventasResult] = await knex
      .select(
        knex.raw(`COALESCE(ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2), 0) as totalVentas`),
        knex.raw(
          `COALESCE(ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2), 0) as utilidad`,
        ),
        knex.raw(`COALESCE(COUNT(DISTINCT ${masterTable}.${idInvoice}), 0) as numVentas`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const bestSellerResult = await knex
      .select(
        knex.raw(
          `COALESCE(NULLIF(vendedores.Empresa, ''), CONCAT('Vendedor no registrado (', COALESCE(NULLIF(${masterTable}.IdVend, ''), 'sin ID'), ')')) as Empresa`,
        ),
        knex.raw(`COALESCE(ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2), 0) as total`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy(`${masterTable}.IdVend`)
      .orderBy("total", "desc")
      .first();

    res.status(200).json({
      totalCompras: Number(comprasResult.totalCompras) || 0,
      numCompras: Number(comprasResult.numCompras) || 0,
      totalVentas: Number(ventasResult.totalVentas) || 0,
      utilidad: Number(ventasResult.utilidad) || 0,
      numVentas: Number(ventasResult.numVentas) || 0,
      bestSeller: bestSellerResult ? bestSellerResult.Empresa : null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PROVIDER_SALES = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search, sortBy = "fecha", sortDir = "desc" } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };
  const offset = (Number(page) - 1) * Number(limit);

  const sortCol = (() => {
    switch (sortBy) {
      case "idFactura":
        return `${masterTable}.${idInvoice}`;
      case "cliente":
        return "clientes.Empresa";
      case "vendedor":
        return "vendedores.Empresa";
      case "cantidad":
        return "cantidad";
      case "monto":
        return knex.raw(`SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad)`);
      case "utilidad":
        return knex.raw(`SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad)`);
      default:
        return `${masterTable}.Fecha`;
    }
  })();
  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";

  try {
    const countQuery = knex
      .countDistinct({ count: `${masterTable}.${idInvoice}` })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const dataQuery = knex
      .select(
        `${masterTable}.${idInvoice} as idFactura`,
        knex.raw("COALESCE(clientes.Empresa, 'Sin cliente') as cliente"),
        knex.raw("COALESCE(vendedores.Empresa, 'Sin vendedor') as vendedor"),
        `${masterTable}.Fecha as fecha`,
        knex.raw(`COALESCE(SUM(${slaveTable}.Cantidad), 0) as cantidad`),
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as monto`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy(`${masterTable}.${idInvoice}`)
      .orderBy(sortCol, sortDirection)
      .orderBy(`${masterTable}.${idInvoice}`, "asc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      countQuery.leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`);
      countQuery.where(function () {
        this.where(`${masterTable}.${idInvoice}`, "like", `%${search}%`)
          .orWhere("clientes.Empresa", "like", `%${search}%`)
          .orWhere("vendedores.Empresa", "like", `%${search}%`);
      });
      dataQuery.where(function () {
        this.where(`${masterTable}.${idInvoice}`, "like", `%${search}%`)
          .orWhere("clientes.Empresa", "like", `%${search}%`)
          .orWhere("vendedores.Empresa", "like", `%${search}%`);
      });
    }

    const totalsQuery = knex
      .select(
        knex.raw(`COALESCE(SUM(${slaveTable}.Cantidad), 0) as cantidad`),
        knex.raw(`ROUND(COALESCE(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 0), 2) as monto`),
        knex.raw(
          `ROUND(COALESCE(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 0), 2) as utilidad`,
        ),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);
    if (search) {
      totalsQuery.where(function () {
        this.where(`${masterTable}.${idInvoice}`, "like", `%${search}%`)
          .orWhere("clientes.Empresa", "like", `%${search}%`)
          .orWhere("vendedores.Empresa", "like", `%${search}%`);
      });
    }

    for (const query of [countQuery, dataQuery, totalsQuery]) {
      if (req.query.productId) filterIdentity(query, `${slaveTable}.IdProducto`, req.query.productId);
      if (req.query.sellerId != null) filterIdentity(query, `${masterTable}.IdVend`, req.query.sellerId);
      if (req.query.clientId != null) filterIdentity(query, `${masterTable}.IdCliente`, req.query.clientId);
    }

    const [{ count }] = await countQuery;
    const data = await dataQuery;
    const [totals] = await totalsQuery;

    res.status(200).json({
      data,
      totals,
      total: Number(count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PROVIDER_CLIENTS = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search, sortBy = "totalVentas", sortDir = "desc" } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };
  const { productId } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const sortCol = (() => {
    switch (sortBy) {
      case "vendedor":
        return productId ? "vendedores.Empresa" : "clientes.Empresa";
      case "cliente":
        return "clientes.Empresa";
      case "totalVentas":
        return "totalVentas";
      case "cantidad":
        return "cantidad";
      case "numVentas":
        return "numVentas";
      case "utilidad":
        return "utilidad";
      default:
        return "totalVentas";
    }
  })();
  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";

  try {
    const countQuery = knex
      .countDistinct({ count: knex.raw(`COALESCE(${masterTable}.IdCliente, '__none__')`) })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const dataQuery = knex
      .select(
        knex.raw(
          `CASE WHEN ${masterTable}.IdCliente IS NULL THEN '__none__' WHEN ${masterTable}.IdCliente = '' THEN '__empty__' ELSE ${masterTable}.IdCliente END as clientId`,
        ),
        knex.raw("COALESCE(clientes.Empresa, 'Sin cliente') as cliente"),
        knex.raw(`COALESCE(SUM(${slaveTable}.Cantidad), 0) as cantidad`),
        knex.raw(`COUNT(DISTINCT ${masterTable}.${idInvoice}) as numVentas`),
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalVentas`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy(`${masterTable}.IdCliente`)
      .orderBy(sortCol, sortDirection)
      .orderBy(`${masterTable}.IdCliente`, "asc")
      .limit(Number(limit))
      .offset(Number(offset));

    const totalsQuery = knex
      .select(
        knex.raw(`COALESCE(SUM(${slaveTable}.Cantidad), 0) as cantidad`),
        knex.raw(`COUNT(DISTINCT ${masterTable}.${idInvoice}) as numVentas`),
        knex.raw(`ROUND(COALESCE(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 0), 2) as totalVentas`),
        knex.raw(
          `ROUND(COALESCE(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 0), 2) as utilidad`,
        ),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);
    if (productId) {
      countQuery
        .clearSelect()
        .select(
          knex.raw(
            `COUNT(DISTINCT COALESCE(${masterTable}.IdCliente, '__none__'), COALESCE(${masterTable}.IdVend, '__none__')) as count`,
          ),
        );
      dataQuery
        .select(
          knex.raw(
            `CASE WHEN ${masterTable}.IdVend IS NULL THEN '__none__' WHEN ${masterTable}.IdVend = '' THEN '__empty__' ELSE ${masterTable}.IdVend END as sellerId`,
          ),
          knex.raw("COALESCE(vendedores.Empresa, 'Sin vendedor') as vendedor"),
        )
        .groupBy(`${masterTable}.IdVend`)
        .orderBy(`${masterTable}.IdVend`, "asc");
    }

    for (const query of [countQuery, dataQuery, totalsQuery]) {
      if (productId) {
        filterIdentity(query, `${slaveTable}.IdProducto`, productId).leftJoin(
          "vendedores",
          "vendedores.IdVend",
          `${masterTable}.IdVend`,
        );
      }
      if (search) {
        query.where(function () {
          this.where("clientes.Empresa", "like", `%${search}%`);
          if (productId) this.orWhere("vendedores.Empresa", "like", `%${search}%`);
        });
      }
      if (req.query.sellerId != null) filterIdentity(query, `${masterTable}.IdVend`, req.query.sellerId);
    }

    const [{ count }] = await countQuery;
    const data = await dataQuery;
    const [totals] = await totalsQuery;

    res.status(200).json({
      data,
      totals,
      total: Number(count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PROVIDER_SELLERS = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search, sortBy = "totalVentas", sortDir = "desc" } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };
  const offset = (Number(page) - 1) * Number(limit);

  const sortCol = (() => {
    switch (sortBy) {
      case "vendedor":
        return "vendedores.Empresa";
      case "totalVentas":
        return "totalVentas";
      case "cantidad":
        return "cantidad";
      case "numClientes":
        return "numClientes";
      case "utilidad":
        return "utilidad";
      default:
        return "totalVentas";
    }
  })();
  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";

  try {
    const countQuery = knex
      .countDistinct({ count: knex.raw(`COALESCE(${masterTable}.IdVend, '__none__')`) })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const dataQuery = knex
      .select(
        knex.raw(
          `CASE WHEN ${masterTable}.IdVend IS NULL THEN '__none__' WHEN ${masterTable}.IdVend = '' THEN '__empty__' ELSE ${masterTable}.IdVend END as sellerId`,
        ),
        knex.raw("COALESCE(vendedores.Empresa, 'Sin vendedor') as vendedor"),
        knex.raw(`COUNT(DISTINCT ${masterTable}.IdCliente) as numClientes`),
        knex.raw(`COALESCE(SUM(${slaveTable}.Cantidad), 0) as cantidad`),
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalVentas`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy(`${masterTable}.IdVend`)
      .orderBy(sortCol, sortDirection)
      .orderBy(`${masterTable}.IdVend`, "asc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      countQuery.where("vendedores.Empresa", "like", `%${search}%`);
      dataQuery.where("vendedores.Empresa", "like", `%${search}%`);
    }

    const totalsQuery = knex
      .select(
        knex.raw(`COUNT(DISTINCT ${masterTable}.IdCliente) as numClientes`),
        knex.raw(`COALESCE(SUM(${slaveTable}.Cantidad), 0) as cantidad`),
        knex.raw(`ROUND(COALESCE(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 0), 2) as totalVentas`),
        knex.raw(
          `ROUND(COALESCE(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 0), 2) as utilidad`,
        ),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);
    if (search) totalsQuery.where("vendedores.Empresa", "like", `%${search}%`);

    if (req.query.productId) {
      for (const query of [countQuery, dataQuery, totalsQuery]) {
        filterIdentity(query, `${slaveTable}.IdProducto`, req.query.productId);
      }
    }

    const [{ count }] = await countQuery;
    const data = await dataQuery;
    const [totals] = await totalsQuery;

    res.status(200).json({
      data,
      totals,
      total: Number(count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PROVIDER_PRODUCTS = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search, sortBy = "totalVentas", sortDir = "desc" } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };
  const offset = (Number(page) - 1) * Number(limit);

  const sortCol = (() => {
    switch (sortBy) {
      case "producto":
        return "productos.Descripcion";
      case "cantidad":
        return "cantidad";
      case "totalVentas":
        return "totalVentas";
      case "utilidad":
        return "utilidad";
      default:
        return "totalVentas";
    }
  })();
  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";

  try {
    const countQuery = knex
      .countDistinct({ count: knex.raw(`COALESCE(${slaveTable}.IdProducto, '__none__')`) })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const dataQuery = knex
      .select(
        knex.raw(
          `CASE WHEN ${slaveTable}.IdProducto IS NULL THEN '__none__' WHEN ${slaveTable}.IdProducto = '' THEN '__empty__' ELSE ${slaveTable}.IdProducto END as productId`,
        ),
        knex.raw(
          `COALESCE(NULLIF(productos.Descripcion, ''), MAX(NULLIF(${slaveTable}.Descripcion, '')), CONCAT('Producto no registrado (', COALESCE(${slaveTable}.IdProducto, 'sin ID'), ')')) as producto`,
        ),
        knex.raw(`ROUND(SUM(${slaveTable}.Cantidad), 2) as cantidad`),
        knex.raw(`ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalVentas`),
        knex.raw(`ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy(`${slaveTable}.IdProducto`)
      .orderBy(sortCol, sortDirection)
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      countQuery.where("productos.Descripcion", "like", `%${search}%`);
      dataQuery.where("productos.Descripcion", "like", `%${search}%`);
    }

    const totalsQuery = knex
      .select(
        knex.raw(`ROUND(COALESCE(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 0), 2) as totalVentas`),
        knex.raw(
          `ROUND(COALESCE(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 0), 2) as utilidad`,
        ),
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`).andOn(`${masterTable}.Anulada`, 0);
      })
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId))
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);
    if (search) totalsQuery.where("productos.Descripcion", "like", `%${search}%`);

    const [{ count }] = await countQuery;
    const data = await dataQuery;
    const [totals] = await totalsQuery;

    res.status(200).json({
      data,
      totals,
      total: Number(count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PROVIDER_PURCHASES = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search, sortBy = "fecha", sortDir = "desc" } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const sortCol = (() => {
    switch (sortBy) {
      case "idFactura":
        return "mastercomp.IdFactura";
      case "monto":
        return knex.raw("SUM(slavecomp.Precio * slavecomp.Cantidad)");
      default:
        return "mastercomp.Fecha";
    }
  })();
  const sortDirection = sortDir.toUpperCase() === "ASC" ? "asc" : "desc";

  try {
    const countQuery = knex
      .countDistinct({ count: "mastercomp.IdFactura" })
      .from("mastercomp")
      .modify((query) => filterIdentity(query, "mastercomp.IdProveedor", providerId))
      .andWhere("mastercomp.Anulada", 0)
      .andWhereBetween("mastercomp.Fecha", [from, to]);

    const dataQuery = knex
      .select(
        "mastercomp.IdFactura as idFactura",
        "mastercomp.Fecha as fecha",
        knex.raw("ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as monto"),
      )
      .from("mastercomp")
      .innerJoin("slavecomp", "slavecomp.IdFactura", "mastercomp.IdFactura")
      .modify((query) => filterIdentity(query, "mastercomp.IdProveedor", providerId))
      .andWhere("mastercomp.Anulada", 0)
      .andWhereBetween("mastercomp.Fecha", [from, to])
      .groupBy("mastercomp.IdFactura")
      .orderBy(sortCol, sortDirection)
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      countQuery.where("mastercomp.IdFactura", "like", `%${search}%`);
      dataQuery.where("mastercomp.IdFactura", "like", `%${search}%`);
    }

    const [{ count }] = await countQuery;
    const data = await dataQuery;

    res.status(200).json({
      data,
      total: Number(count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_PURCHASE_DETAIL = async (req, res) => {
  const { invoiceId } = req.params;

  try {
    const [master] = await knex.select("IdFactura", "Fecha").from("mastercomp").where("IdFactura", invoiceId);

    if (!master) {
      return res.status(404).json({ error: "Purchase invoice not found" });
    }

    const productos = await knex
      .select(
        knex.raw(
          "COALESCE(NULLIF(productos.Descripcion, ''), NULLIF(slavecomp.Descripcion, ''), CONCAT('Producto no registrado (', COALESCE(slavecomp.IdProducto, 'sin ID'), ')')) as descripcion",
        ),
        "slavecomp.Cantidad as cantidad",
        "slavecomp.Precio as precio",
        knex.raw("ROUND(slavecomp.Cantidad * slavecomp.Precio, 2) as subtotal"),
      )
      .from("slavecomp")
      .leftJoin("productos", "productos.IdProducto", "slavecomp.IdProducto")
      .where("slavecomp.IdFactura", invoiceId);

    const total = productos.reduce((sum, p) => sum + Number(p.subtotal || 0), 0);

    res.status(200).json({
      idFactura: master.IdFactura,
      fecha: master.Fecha,
      productos,
      total: Math.round(total * 100) / 100,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const GET_SALE_DETAIL = async (req, res) => {
  const { providerId, invoiceId } = req.params;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };

  try {
    const [master] = await knex
      .select(
        `${masterTable}.${idInvoice} as idFactura`,
        `${masterTable}.Fecha as fecha`,
        "vendedores.Empresa as vendedor",
      )
      .from(masterTable)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .where(`${masterTable}.${idInvoice}`, invoiceId)
      .andWhere(`${masterTable}.Anulada`, 0);

    if (!master) {
      return res.status(404).json({ error: "Sale invoice not found" });
    }

    const productos = await knex
      .select(
        knex.raw(
          `COALESCE(NULLIF(productos.Descripcion, ''), NULLIF(${slaveTable}.Descripcion, ''), CONCAT('Producto no registrado (', COALESCE(${slaveTable}.IdProducto, 'sin ID'), ')')) as descripcion`,
        ),
        `${slaveTable}.Cantidad as cantidad`,
        `${slaveTable}.Precio as precio`,
        knex.raw(`ROUND(${slaveTable}.Cantidad * ${slaveTable}.Precio, 2) as subtotal`),
        knex.raw(`ROUND((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad, 2) as utilidad`),
      )
      .from(slaveTable)
      .leftJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .where(`${slaveTable}.${idInvoice}`, invoiceId)
      .modify((query) => filterIdentity(query, "productos.Proveedor", providerId));

    const total = productos.reduce((sum, p) => sum + Number(p.subtotal || 0), 0);
    const utilidad = productos.reduce((sum, p) => sum + Number(p.utilidad || 0), 0);

    res.status(200).json({
      idFactura: master.idFactura,
      fecha: master.fecha,
      vendedor: master.vendedor,
      productos,
      total: Math.round(total * 100) / 100,
      utilidad: Math.round(utilidad * 100) / 100,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  GET_PROVIDER_OPTIONS,
  GET_PROVIDERS_LIST,
  GET_BEST_PROVIDERS,
  GET_PROVIDER_SUMMARY,
  GET_PROVIDER_SALES,
  GET_PROVIDER_CLIENTS,
  GET_PROVIDER_SELLERS,
  GET_PROVIDER_PRODUCTS,
  GET_PROVIDER_PURCHASES,
  GET_PURCHASE_DETAIL,
  GET_SALE_DETAIL,
};
