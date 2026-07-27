const router = require("express").Router();

const controller = require("../controllers/currency_rates");

router.route("/").get(controller.GET_CURRENCY_RATES);

module.exports = router;
