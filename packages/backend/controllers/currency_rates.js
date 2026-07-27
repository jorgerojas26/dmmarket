const knex = require("../database");

const GET_CURRENCY_RATES = async (req, res) => {
  try {
    const currencyRates = await knex("divisas");

    res.json(currencyRates);
  } catch (error) {
    console.log("Currency Rates Error: ", error);

    res.status(500).json({
      error: {
        message: "Error al obtener las divisas",
      },
    });
  }
};

module.exports = {
  GET_CURRENCY_RATES,
};
