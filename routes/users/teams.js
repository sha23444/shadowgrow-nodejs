var express = require("express");
var router = express.Router();

const TeamController = require("../../controllers/user/teams");

router.get("/", TeamController.getTeamMembers);

module.exports = router;
