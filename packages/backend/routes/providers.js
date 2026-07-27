const router = require("express").Router();
const controller = require("../controllers/providers");

router.route("/list").get(controller.GET_PROVIDERS_LIST);
router.route("/best").get(controller.GET_BEST_PROVIDERS);

router.route("/:providerId/summary").get(controller.GET_PROVIDER_SUMMARY);
router.route("/:providerId/sales").get(controller.GET_PROVIDER_SALES);
router.route("/:providerId/clients").get(controller.GET_PROVIDER_CLIENTS);
router.route("/:providerId/products").get(controller.GET_PROVIDER_PRODUCTS);
router.route("/:providerId/purchases").get(controller.GET_PROVIDER_PURCHASES);
router.route("/:providerId/purchases/:invoiceId").get(controller.GET_PURCHASE_DETAIL);
router.route("/:providerId/sales/:invoiceId").get(controller.GET_SALE_DETAIL);

module.exports = router;
