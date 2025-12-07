var express = require('express');
var router = express.Router();


const CartController = require('../../controllers/user/cart');
const authenticateUser = require('../../middlewars/authenticateToken');
const CartCalculationController = require('../../controllers/user/cartCalculationController');

router.post('/sync', authenticateUser, CartController.syncCart);
router.get('/', authenticateUser, CartController.getCart);
router.post('/calculate', authenticateUser, CartCalculationController.calculateCartTotal);
router.get('/quote', authenticateUser, CartController.getCheckoutQuote);

module.exports = router;
    