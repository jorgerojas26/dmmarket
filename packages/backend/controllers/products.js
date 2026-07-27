const knex = require("../database");
const MONTHS = require("../utils/months");

const GET_PRODUCTS = async (req, res) => {
  const { filter } = req.query;
  if (filter) {
    try {
      const response = await knex
        .select()
        .from("productos")
        .where(knex.raw(`Descripcion LIKE '%${filter}%'`));
      res.status(200).json(response);
    } catch (error) {
      console.log(error);
    }
  } else {
    try {
      const response = await knex.select().from("productos");
      res.status(200).json(response);
    } catch (error) {
      console.log(error);
    }
  }
};

const GET_BY_GROUP = async (req, res) => {
  try {
    const response = await knex
      .select(
        "productos.IdProducto as productId",
        "productos.Descripcion as product",
        "PrecioA as price",
        "Existencia as stock",
        "grupos.Descripcion as groupId"
      )
      .from("productos")
      .innerJoin("grupos", "grupos.IdGrupo", "productos.Grupo");

    const grouped = response.reduce((acc, current) => {
      acc[current.groupId] = (acc[current.groupId] || []).concat(current);
      return acc;
    }, {});

    res.status(200).json(grouped);
  } catch (error) {
    res.json(error);
    console.log(error);
  }
};

const GET_COST_FLUCTUATION = async (req, res) => {
  const { productId } = req.params;
  try {
    let response = await knex
      .select(
        knex.raw(`
          MIN(slavecomp.Descripcion) as Descripcion,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 1, slavecomp.Precio, NULL)), 2)  AS Enero,
       COUNT(IF(MONTH(mastercomp.Fecha) = 1, slavecomp.IdFactura, NULL))  AS Enero_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 2, slavecomp.Precio, NULL)), 2)  AS Febrero,
       COUNT(IF(MONTH(mastercomp.Fecha) = 2, slavecomp.IdFactura, NULL))  AS Febrero_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 3, slavecomp.Precio, NULL)), 2)  AS Marzo,
       COUNT(IF(MONTH(mastercomp.Fecha) = 3, slavecomp.IdFactura, NULL))  AS Marzo_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 4, slavecomp.Precio, NULL)), 2)  AS Abril,
       COUNT(IF(MONTH(mastercomp.Fecha) = 4, slavecomp.IdFactura, NULL))  AS Abril_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 5, slavecomp.Precio, NULL)), 2)  AS Mayo,
       COUNT(IF(MONTH(mastercomp.Fecha) = 5, slavecomp.IdFactura, NULL))  AS Mayo_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 6, slavecomp.Precio, NULL)), 2)  AS Junio,
       COUNT(IF(MONTH(mastercomp.Fecha) = 6, slavecomp.IdFactura, NULL))  AS Junio_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 7, slavecomp.Precio, NULL)), 2)  AS Julio,
       COUNT(IF(MONTH(mastercomp.Fecha) = 7, slavecomp.IdFactura, NULL))  AS Julio_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 8, slavecomp.Precio, NULL)), 2)  AS Agosto,
       COUNT(IF(MONTH(mastercomp.Fecha) = 8, slavecomp.IdFactura, NULL))  AS Agosto_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 9, slavecomp.Precio, NULL)), 2) AS Septiembre,
       COUNT(IF(MONTH(mastercomp.Fecha) = 9, slavecomp.IdFactura, NULL))  AS Septiembre_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 10, slavecomp.Precio, NULL)), 2) AS Octubre,
       COUNT(IF(MONTH(mastercomp.Fecha) = 10, slavecomp.IdFactura, NULL))  AS Octubre_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 11, slavecomp.Precio, NULL)), 2) AS Noviembre,
       COUNT(IF(MONTH(mastercomp.Fecha) = 11, slavecomp.IdFactura, NULL))  AS Noviembre_transactions,
       ROUND(AVG(IF(MONTH(mastercomp.Fecha) = 12, slavecomp.Precio, NULL)), 2) AS Diciembre,
       COUNT(IF(MONTH(mastercomp.Fecha) = 12, slavecomp.IdFactura, NULL))  AS Diciembre_transactions
            `)
      )
      .from("slavecomp")
      .innerJoin("mastercomp", function () {
        this.on("mastercomp.IdFactura", "slavecomp.IdFactura").andOn(
          "mastercomp.Anulada",
          0
        );
      })
      .where(knex.raw("YEAR(mastercomp.Fecha)"), knex.raw("YEAR(CURDATE())"))
      .andWhere("slavecomp.IdProducto", productId)
      .groupBy("slavecomp.IdProducto");

    response = response.reduce(
      (acc, current) => ({
        id: current.Descripcion,
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

const GET_STOCK = async (req, res) => {
  const { productId } = req.params;
  try {
    const response = await knex("productos")
      .select("PrecioA as price", "Existencia as stock")
      .where("IdProducto", productId);

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

const GET_PRICE_LIST = async (req, res) => {
  try {
    const response = await knex
      .select("Descripcion as name", "PrecioA as price", "Existencia as stock")
      .from("productos");
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
  }
};

const GET_PRICE_LIST_BY_GROUP = async (req, res) => {
  const { groupId } = req.params;

  try {
    const response = await knex
      .select(
        "Grupo",
        "Descripcion as product",
        "PrecioA as price",
        knex.raw("ROUND(Existencia, 2) as stock")
      )
      .from("productos")
      .where("productos.Grupo", groupId);

    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

const GET_COST_BY_GROUP = async (req, res) => {
  try {
    const response = await knex
      .select(
        knex.raw("MIN(grupos.Descripcion) as group_name"),
        knex.raw("ROUND(SUM(productos.Existencia), 2) as stock"),
        knex.raw(
          "ROUND(SUM(productos.Existencia * productos.Costo), 2) as total_cost"
        )
      )
      .from("grupos")
      .innerJoin("productos", "productos.Grupo", "grupos.IdGrupo")
      .groupBy("grupos.IdGrupo");
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

module.exports = {
  GET_PRODUCTS,
  GET_BY_GROUP,
  GET_COST_FLUCTUATION,
  GET_STOCK,
  GET_PRICE_LIST,
  GET_PRICE_LIST_BY_GROUP,
  GET_COST_BY_GROUP,
};
