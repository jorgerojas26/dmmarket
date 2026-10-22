const router = require("express").Router();

const controller = require("../controllers/currency_rates");

router.route("/").get(controller.GET_CURRENCY_RATES);

router.route("/bcv").get(controller.GET_BCV_RATES);
router.route("/bcv/latest").get(controller.GET_BCV_LATEST);
router.route("/bcv/status").get(controller.GET_BCV_STATUS);
router.route("/bcv/sync").post(controller.POST_BCV_SYNC);
router.route("/bcv/:fecha").get(controller.GET_BCV_RATE_BY_DATE);

module.exports = router;
