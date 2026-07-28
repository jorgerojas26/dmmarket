const router = require("express").Router();
const controller = require("../controllers/dashboard");
const showNoe = require("../middlewares/showNoe");

router.route("/sales").get(showNoe, controller.GET_DASHBOARD_SALES);
router.route("/pareto").get(showNoe, controller.GET_DASHBOARD_PARETO);

module.exports = router;
