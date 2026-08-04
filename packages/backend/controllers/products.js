const knex = require("../database");

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

module.exports = {
  GET_PRODUCTS,
};
