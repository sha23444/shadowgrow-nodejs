var express = require('express');
var router = express.Router();

const CouponController = require('../../controllers/user/coupon');

router.get('/', CouponController.getCoupons);
router.get('/:couponCode', CouponController.getCoupons);    

module.exports = router;
 