var express = require("express");
var router = express.Router();

const TestController = require("../../controllers/user/balance-transfer");

router.post("/transfer", TestController.balanceTransfer);

module.exports = router;
