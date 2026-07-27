const router = require("express").Router();
const controller = require("../controllers/clients");
const showNoe = require("../middlewares/showNoe");

router.route("/").get(controller.GET_CLIENTS);
router.route("/best").get(showNoe, controller.GET_BEST_CLIENTS);
router
  .route("/best/product/:productId")
  .get(showNoe, controller.GET_BEST_CLIENTS_PER_PRODUCT);
router
  .route("/average/month/:clientId")
  .get(showNoe, controller.MONTHLY_AVERAGE);

router.route("/:clientId/sales").get(showNoe, controller.GET_CLIENT_SALES);
router.route("/:clientId/summary").get(showNoe, controller.GET_CLIENT_SUMMARY);

router.route("/list").get(showNoe, controller.GET_CLIENTS_LIST);

module.exports = router;
