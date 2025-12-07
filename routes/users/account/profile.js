var express = require("express");
var router = express.Router();

const ProfileControllers = require("../../../controllers/user/account/profile");
const authenticateUser = require("../../../middlewars/authenticateToken");

router.get("/", authenticateUser,  ProfileControllers.getProfile);

module.exports = router;
