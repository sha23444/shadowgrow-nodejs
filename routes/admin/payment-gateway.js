const express = require('express');
const router = express.Router();
const PaymentMethodController = require("../../controllers/admin/payment-gateway");
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/active', authenticateUser, PaymentMethodController.getActivePaymentGateways);
router.get('/all', authenticateUser, PaymentMethodController.getAllPaymentGateways);
router.patch('/install', authenticateUser, PaymentMethodController.installPaymentGateway);
router.patch('/update', authenticateUser, PaymentMethodController.updatePaymentGateway);
router.patch('/uninstall', authenticateUser, PaymentMethodController.uninstallPaymentGateway);
router.patch('/set-default', authenticateUser, PaymentMethodController.setDefaultPaymentGateway);
router.patch('/change-order', authenticateUser, PaymentMethodController.changeOrderPosition);
router.patch('/update-allowed-currencies', authenticateUser, PaymentMethodController.updateAllowedCurrencies);

module.exports = router;
