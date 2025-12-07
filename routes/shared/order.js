var express = require('express');
var router = express.Router();

const OrderController = require('../../controllers/shared/order');
const authenticate = require('../../middlewars/authenticateToken');

router.post('/check-discount', authenticate,  OrderController.checkDiscount);
router.post('/check-discount-coupon',   OrderController.checkDiscountCoupon);


module.exports = router;
