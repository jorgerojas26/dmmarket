const router = require("express").Router();
const controller = require("../controllers/groups");
const showNoe = require("../middlewares/showNoe");

router.route("/").get(controller.GET_GROUPS);
router
  .route("/sales/:groupId")
  .get(showNoe, controller.GET_SALE_PRODUCTS_BY_GROUP);

module.exports = router;
