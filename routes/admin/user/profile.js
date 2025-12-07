var express = require("express");
var router = express.Router();

const ProfileControllers = require("../../../controllers/admin/user/profile");

router.get("/",  ProfileControllers.getProfile);
router.get("/stats", ProfileControllers.getStats)
router.patch("/change-password", ProfileControllers.changePassword);
router.patch("/update", ProfileControllers.updateProfile);
router.delete("/delete", ProfileControllers.deleteProfile);

module.exports = router;
