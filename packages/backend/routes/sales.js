const router = require("express").Router();
const controller = require("../controllers/sales");
const showNoe = require("../middlewares/showNoe");

router.route("/facturas").get(showNoe, controller.GET_FACTURAS);
router.route("/productos").get(showNoe, controller.GET_PRODUCTOS);

module.exports = router;
