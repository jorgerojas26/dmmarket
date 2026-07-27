const knex = require("../database");
const { GET_SALES_QUERY } = require("../models/invoice");

const GET_GROUPS = async (req, res) => {
  try {
    const response = await knex
      .select("IdGrupo as groupId", "Descripcion as name")
      .from("grupos");
    res.status(200).json(response);
  } catch (error) {
    console.error(error);
  }
};

const GET_SALE_PRODUCTS_BY_GROUP = async (req, res) => {
  const { from, to } = req.query;
  const { groupId } = req.params;

  try {
    const response = await GET_SALES_QUERY({ from, to, groupId, showNoe: req.locals.showNoe });

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json(error);
  }
};

module.exports = {
  GET_GROUPS,
  GET_SALE_PRODUCTS_BY_GROUP,
};
