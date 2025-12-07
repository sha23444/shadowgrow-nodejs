var express = require("express");
var router = express.Router();

const OrdersController = require("../../../controllers/admin/user/orders");
const authenticateUser = require('../../../middlewars/authenticateAdmin');

router.get("/", authenticateUser,  OrdersController.getAllOrderList);

module.exports = router;
