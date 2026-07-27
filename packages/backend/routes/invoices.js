const router = require("express").Router();
const controller = require("../controllers/invoices");
const showNoe = require("../middlewares/showNoe");

router.route("/").get(showNoe, controller.GET_INVOICES);
router.route("/sales").get(showNoe, controller.GET_SALES);
router
  .route("/sales/:categoryId")
  .get(showNoe, controller.GET_SALES_BY_CATEGORY);
router.route("/group").get(showNoe, controller.GET_BY_GROUP);

module.exports = router;
