const express = require("express");
const router = express.Router();

const PayPalController = require("../../controllers/payment-gateway/paypal");
const authenticateToken = require("../../middlewars/authenticateToken");

router.post("/create-order", authenticateToken, PayPalController.createPayPalOrder);
router.post("/webhook", PayPalController.handleWebhook); // No authentication for webhooks
router.post("/update/order", authenticateToken, PayPalController.updateOrder); // Manual verification endpoint

module.exports = router;