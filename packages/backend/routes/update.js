const router = require("express").Router();

const controller = require("../controllers/update");

router.route("/status").get(controller.GET_STATUS);
router.route("/check").post(controller.POST_CHECK);
router.route("/download").post(controller.POST_DOWNLOAD);
router.route("/progress").get(controller.GET_PROGRESS);
router.route("/apply").post(controller.POST_APPLY);

module.exports = router;
