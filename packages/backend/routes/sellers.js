const router = require("express").Router();
const controller = require("../controllers/sellers");
const showNoe = require("../middlewares/showNoe");

router.route("/dashboard").get(showNoe, controller.GET_SELLERS_DASHBOARD);
router.route("/list").get(showNoe, controller.GET_SELLERS_LIST);

router.route("/:sellerId/summary").get(showNoe, controller.GET_SELLER_SUMMARY);
router.route("/:sellerId/sales").get(showNoe, controller.GET_SELLER_SALES);

module.exports = router;
