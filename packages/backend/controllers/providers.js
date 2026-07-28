const knex = require("../database");

const GET_PROVIDERS_LIST = async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const showNoe = req.query.showNoe === "true";
  const offset = (Number(page) - 1) * Number(limit);

  const masterTable = showNoe ? "masternoe" : "masterfact";
  const slaveTable = showNoe ? "slavenoe" : "slavefact";
  const idInvoice = showNoe ? "IdNoe" : "IdFactura";

  try {
    // Build data query with subquery LEFT JOINs so metrics don't cross-multiply
    const dataQuery = knex
      .select(
        "p.IdProveedor",
        "p.Empresa",
        knex.raw("COALESCE(purchase_data.total_compras, 0) as total_compras"),
        knex.raw("COALESCE(purchase_data.num_compras, 0) as num_compras"),
        knex.raw("COALESCE(sales_data.total_ventas, 0) as total_ventas"),
        knex.raw("COALESCE(sales_data.num_ventas, 0) as num_ventas")
      )
      .from("proveedores as p")
      .leftJoin(
        knex
          .select(
            "mc.IdProveedor",
            knex.raw(
              "ROUND(SUM(sc.Precio * sc.Cantidad), 2) as total_compras"
            ),
            knex.raw("COUNT(DISTINCT mc.IdFactura) as num_compras")
          )
          .from("mastercomp as mc")
          .leftJoin("slavecomp as sc", "sc.IdFactura", "mc.IdFactura")
          .where("mc.Anulada", 0)
          .groupBy("mc.IdProveedor")
          .as("purchase_data"),
        "purchase_data.IdProveedor",
        "p.IdProveedor"
      )
      .leftJoin(
        knex
          .select(
            "pr.Proveedor",
            knex.raw(
              `ROUND(SUM(sf.Precio * sf.Cantidad), 2) as total_ventas`
            ),
            knex.raw(`COUNT(DISTINCT mf.${idInvoice}) as num_ventas`)
          )
          .from("productos as pr")
          .leftJoin(`${slaveTable} as sf`, "sf.IdProducto", "pr.IdProducto")
          .leftJoin(`${masterTable} as mf`, function () {
            this.on(`mf.${idInvoice}`, `sf.${idInvoice}`).andOn(
              "mf.Anulada",
              0
            );
          })
          .groupBy("pr.Proveedor")
          .as("sales_data"),
        "sales_data.Proveedor",
        "p.IdProveedor"
      );

    // Count query
    const countQuery = knex
      .countDistinct({ total: "p.IdProveedor" })
      .from("proveedores as p");

    if (search) {
      dataQuery.where("p.Empresa", "like", `%${search}%`);
      countQuery.where("p.Empresa", "like", `%${search}%`);
    }

    const [{ total }] = await countQuery;

    const data = await dataQuery
      .orderByRaw("COALESCE(sales_data.total_ventas, 0) DESC")
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

const GET_BEST_PROVIDERS = async (req, res) => {
  const { from, to, mode = "ventas" } = req.query;
  const showNoe = req.query.showNoe === "true";

  try {
    if (mode === "compras") {
      const response = await knex
        .select(
          "proveedores.Empresa as proveedor",
          knex.raw(
            "ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as monto"
          )
        )
        .from("slavecomp")
        .innerJoin("mastercomp", function () {
          this.on("mastercomp.IdFactura", "slavecomp.IdFactura").andOn(
            "mastercomp.Anulada",
            0
          );
        })
        .innerJoin(
          "proveedores",
          "proveedores.IdProveedor",
          "mastercomp.IdProveedor"
        )
        .whereBetween("mastercomp.Fecha", [from, to])
        .groupBy("proveedores.IdProveedor")
        .orderBy("monto", "desc");

      res.status(200).json(response);
    } else {
      // mode === "ventas"
      const masterTable = showNoe ? "masternoe" : "masterfact";
      const slaveTable = showNoe ? "slavenoe" : "slavefact";
      const idInvoice = showNoe ? "IdNoe" : "IdFactura";

      const response = await knex
        .select(
          "proveedores.Empresa as proveedor",
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
        .innerJoin(
          "productos",
          "productos.IdProducto",
          `${slaveTable}.IdProducto`
        )
        .innerJoin(
          "proveedores",
          "proveedores.IdProveedor",
          "productos.Proveedor"
        )
        .whereBetween(`${masterTable}.Fecha`, [from, to])
        .groupBy("proveedores.IdProveedor")
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
        knex.raw(
          "COALESCE(ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2), 0) as totalCompras"
        ),
        knex.raw(
          "COALESCE(COUNT(DISTINCT mastercomp.IdFactura), 0) as numCompras"
        )
      )
      .from("slavecomp")
      .innerJoin("mastercomp", "mastercomp.IdFactura", "slavecomp.IdFactura")
      .where("mastercomp.IdProveedor", providerId)
      .andWhere("mastercomp.Anulada", 0)
      .andWhereBetween("mastercomp.Fecha", [from, to]);

    const [ventasResult] = await knex
      .select(
        knex.raw(
          `COALESCE(ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2), 0) as totalVentas`
        ),
        knex.raw(
          `COALESCE(COUNT(DISTINCT ${masterTable}.${idInvoice}), 0) as numVentas`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const bestSellerResult = await knex
      .select(
        "vendedores.Empresa",
        knex.raw(
          `COALESCE(ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2), 0) as total`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .innerJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy("vendedores.IdVend")
      .orderBy("total", "desc")
      .first();

    res.status(200).json({
      totalCompras: Number(comprasResult.totalCompras) || 0,
      numCompras: Number(comprasResult.numCompras) || 0,
      totalVentas: Number(ventasResult.totalVentas) || 0,
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
  const { from, to, page = 1, limit = 20, search } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };
  const offset = (Number(page) - 1) * Number(limit);

  try {
    const countQuery = knex
      .countDistinct({ count: `${masterTable}.${idInvoice}` })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const dataQuery = knex
      .select(
        `${masterTable}.${idInvoice} as idFactura`,
        "vendedores.Empresa as vendedor",
        `${masterTable}.Fecha as fecha`,
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as monto`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .innerJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy(`${masterTable}.${idInvoice}`)
      .orderBy(`${masterTable}.Fecha`, "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      countQuery.innerJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`);
      countQuery.where(function () {
        this.where(`${masterTable}.${idInvoice}`, "like", `%${search}%`)
          .orWhere("vendedores.Empresa", "like", `%${search}%`);
      });
      dataQuery.where(function () {
        this.where(`${masterTable}.${idInvoice}`, "like", `%${search}%`)
          .orWhere("vendedores.Empresa", "like", `%${search}%`);
      });
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

const GET_PROVIDER_CLIENTS = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };
  const offset = (Number(page) - 1) * Number(limit);

  try {
    const countQuery = knex
      .countDistinct({ count: "clientes.IdCliente" })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .innerJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const dataQuery = knex
      .select(
        "clientes.Empresa as cliente",
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalVentas`
        ),
        knex.raw(
          `ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .innerJoin("clientes", "clientes.IdCliente", `${masterTable}.IdCliente`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy("clientes.IdCliente")
      .orderBy("totalVentas", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      countQuery.where("clientes.Empresa", "like", `%${search}%`);
      dataQuery.where("clientes.Empresa", "like", `%${search}%`);
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

const GET_PROVIDER_PRODUCTS = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search } = req.query;
  const showNoeParam = req.query.showNoe === "true";
  const { masterTable, slaveTable, idInvoice } = showNoeParam
    ? { masterTable: "masternoe", slaveTable: "slavenoe", idInvoice: "IdNoe" }
    : { masterTable: "masterfact", slaveTable: "slavefact", idInvoice: "IdFactura" };
  const offset = (Number(page) - 1) * Number(limit);

  try {
    const countQuery = knex
      .countDistinct({ count: "productos.IdProducto" })
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to]);

    const dataQuery = knex
      .select(
        "productos.Descripcion as producto",
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as totalVentas`
        ),
        knex.raw(
          `ROUND(SUM((${slaveTable}.Precio - ${slaveTable}.Costo) * ${slaveTable}.Cantidad), 2) as utilidad`
        )
      )
      .from(`${slaveTable}`)
      .innerJoin(`${masterTable}`, function () {
        this.on(`${masterTable}.${idInvoice}`, `${slaveTable}.${idInvoice}`)
          .andOn(`${masterTable}.Anulada`, 0);
      })
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .where("productos.Proveedor", providerId)
      .andWhereBetween(`${masterTable}.Fecha`, [from, to])
      .groupBy("productos.IdProducto")
      .orderBy("totalVentas", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (search) {
      countQuery.where("productos.Descripcion", "like", `%${search}%`);
      dataQuery.where("productos.Descripcion", "like", `%${search}%`);
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

const GET_PROVIDER_PURCHASES = async (req, res) => {
  const { providerId } = req.params;
  const { from, to, page = 1, limit = 20, search } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    const countQuery = knex
      .countDistinct({ count: "mastercomp.IdFactura" })
      .from("mastercomp")
      .where("mastercomp.IdProveedor", providerId)
      .andWhere("mastercomp.Anulada", 0)
      .andWhereBetween("mastercomp.Fecha", [from, to]);

    const dataQuery = knex
      .select(
        "mastercomp.IdFactura as idFactura",
        "mastercomp.Fecha as fecha",
        knex.raw(
          "ROUND(SUM(slavecomp.Precio * slavecomp.Cantidad), 2) as monto"
        )
      )
      .from("mastercomp")
      .innerJoin("slavecomp", "slavecomp.IdFactura", "mastercomp.IdFactura")
      .where("mastercomp.IdProveedor", providerId)
      .andWhere("mastercomp.Anulada", 0)
      .andWhereBetween("mastercomp.Fecha", [from, to])
      .groupBy("mastercomp.IdFactura")
      .orderBy("mastercomp.Fecha", "desc")
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
    const [master] = await knex
      .select("IdFactura", "Fecha")
      .from("mastercomp")
      .where("IdFactura", invoiceId);

    if (!master) {
      return res.status(404).json({ error: "Purchase invoice not found" });
    }

    const productos = await knex
      .select(
        "productos.Descripcion as descripcion",
        "slavecomp.Cantidad as cantidad",
        "slavecomp.Precio as precio",
        knex.raw("ROUND(slavecomp.Cantidad * slavecomp.Precio, 2) as subtotal")
      )
      .from("slavecomp")
      .innerJoin("productos", "productos.IdProducto", "slavecomp.IdProducto")
      .where("slavecomp.IdFactura", invoiceId);

    const total = productos.reduce(
      (sum, p) => sum + Number(p.subtotal || 0),
      0
    );

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
      .select(`${masterTable}.${idInvoice} as idFactura`, `${masterTable}.Fecha as fecha`, "vendedores.Empresa as vendedor")
      .from(masterTable)
      .leftJoin("vendedores", "vendedores.IdVend", `${masterTable}.IdVend`)
      .where(`${masterTable}.${idInvoice}`, invoiceId)
      .andWhere(`${masterTable}.Anulada`, 0);

    if (!master) {
      return res.status(404).json({ error: "Sale invoice not found" });
    }

    const productos = await knex
      .select(
        "productos.Descripcion as descripcion",
        `${slaveTable}.Cantidad as cantidad`,
        `${slaveTable}.Precio as precio`,
        knex.raw(`ROUND(${slaveTable}.Cantidad * ${slaveTable}.Precio, 2) as subtotal`)
      )
      .from(slaveTable)
      .innerJoin("productos", "productos.IdProducto", `${slaveTable}.IdProducto`)
      .where(`${slaveTable}.${idInvoice}`, invoiceId)
      .andWhere("productos.Proveedor", providerId);

    const total = productos.reduce(
      (sum, p) => sum + Number(p.subtotal || 0),
      0
    );

    res.status(200).json({
      idFactura: master.idFactura,
      fecha: master.fecha,
      vendedor: master.vendedor,
      productos,
      total: Math.round(total * 100) / 100,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  GET_PROVIDERS_LIST,
  GET_BEST_PROVIDERS,
  GET_PROVIDER_SUMMARY,
  GET_PROVIDER_SALES,
  GET_PROVIDER_CLIENTS,
  GET_PROVIDER_PRODUCTS,
  GET_PROVIDER_PURCHASES,
  GET_PURCHASE_DETAIL,
  GET_SALE_DETAIL,
};
