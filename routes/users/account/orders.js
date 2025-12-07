var express = require("express");
var router = express.Router();

const OrdersController = require("../../../controllers/user/account/orders");
const authenticateUser = require("../../../middlewars/authenticateToken");

router.get("/list", authenticateUser, OrdersController.getAllOrderList);
router.get('/:order_id', authenticateUser,  OrdersController.getOrderDetails);
router.post('/cancel', authenticateUser,  OrdersController.cancelOrder);

module.exports = router;