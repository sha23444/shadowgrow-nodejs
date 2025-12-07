var express = require("express");
var router = express.Router();

const TransactionsController = require("../../../controllers/admin/user/transactions");

router.get("/", TransactionsController.getTransactions);

module.exports = router;
