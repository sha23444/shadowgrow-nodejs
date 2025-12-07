const express = require('express');
const router = express.Router();

const PaymentGatewayController = require('../../controllers/user/paymentGateways');

router.get('/', PaymentGatewayController.getPaymentMethod);

module.exports = router;