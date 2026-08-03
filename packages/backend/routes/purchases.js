const router = require("express").Router();
const controller = require("../controllers/purchases");

router.route("/dashboard").get(controller.GET_DASHBOARD_PURCHASES);
router.route("/pareto").get(controller.GET_PARETO_PURCHASES);
router.route("/invoices").get(controller.GET_INVOICES);
router.route("/products").get(controller.GET_PRODUCTS);

module.exports = router;
