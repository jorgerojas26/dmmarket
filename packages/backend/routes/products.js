const router = require("express").Router();

const controller = require("../controllers/products");

router.route("/").get(controller.GET_PRODUCTS);
router.route("/group").get(controller.GET_BY_GROUP);
router
  .route("/cost-fluctuation/:productId")
  .get(controller.GET_COST_FLUCTUATION);

router.route("/stock/:productId").get(controller.GET_STOCK);
router.route("/cost/group").get(controller.GET_COST_BY_GROUP);

router.route("/price-list").get(controller.GET_PRICE_LIST);
router.route("/price-list/:groupId").get(controller.GET_PRICE_LIST_BY_GROUP);

module.exports = router;
