const router = require("express").Router();
const controller = require("../controllers/dashboard");
const showNoe = require("../middlewares/showNoe");

router.route("/sales").get(showNoe, controller.GET_DASHBOARD_SALES);

module.exports = router;
