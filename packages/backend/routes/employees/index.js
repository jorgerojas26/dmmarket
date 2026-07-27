const router = require("express").Router();
const controller = require("../../controllers/employees");
const showNoe = require("../../middlewares/showNoe");

router.route("/").get(controller.GET_EMPLOYEES);

router
  .route("/commissionInfo/:employeeId")
  .get(controller.GET_COMMISSION_INFO)
  .put(controller.UPDATE_COMMISSION_INFO);

router.route("/sales/:employeeId").get(showNoe, controller.GET_SALES);

module.exports = router;
