var express = require("express");
var router = express.Router();

const OverviewControllers = require("../../../controllers/user/account/overview");
const authenticateUser = require("../../../middlewars/authenticateToken");

router.get("/", authenticateUser, OverviewControllers.getOverview);


module.exports = router;
