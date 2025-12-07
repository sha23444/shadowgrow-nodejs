var express = require('express');
var router = express.Router();

const CouponController = require('../../controllers/admin/coupons');
const authenticateAdmin = require('../../middlewars/authenticateAdmin');

router.get('/list', authenticateAdmin, CouponController.getCoupons);
router.get('/:id', authenticateAdmin, CouponController.getCoupon);
router.get('/:id/usage', authenticateAdmin, CouponController.getCouponUsage);
router.post('/create', authenticateAdmin, CouponController.addCoupon);
router.put('/:id/update', authenticateAdmin, CouponController.updateCoupon);
router.delete('/:id/delete', authenticateAdmin, CouponController.deleteCoupon);

module.exports = router;