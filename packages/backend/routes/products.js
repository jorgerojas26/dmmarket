const router = require("express").Router();

const controller = require("../controllers/products");

router.route("/").get(controller.GET_PRODUCTS);

module.exports = router;
