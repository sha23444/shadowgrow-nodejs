const express = require("express");
const router = express.Router();

const CashfreeController = require("../../controllers/payment-gateway/cashfree");
const authenticateToken = require("../../middlewars/authenticateToken");

router.post("/create-order", authenticateToken, CashfreeController.createOrder);
router.post("/update/order", authenticateToken, CashfreeController.fetchPayment);
router.get("/webhook", CashfreeController.webhookHandler); // Changed to GET method for webhooks
router.get("/success", CashfreeController.handlePaymentSuccess); // Success callback after payment

module.exports = router;