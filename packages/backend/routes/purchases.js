const router = require("express").Router();
const controller = require("../controllers/purchases");

router.route("/dashboard").get(controller.GET_DASHBOARD_PURCHASES);
router.route("/pareto").get(controller.GET_PARETO_PURCHASES);

module.exports = router;
