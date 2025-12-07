const express = require("express");
const router = express.Router();
const coinflexpayController = require("../../controllers/payment-gateway/coinflexpay");
const authenticateToken = require("../../middlewars/authenticateToken");

router.post("/create-order", authenticateToken, coinflexpayController.createOrder);
router.post("/update/order", authenticateToken, coinflexpayController.checkPaymentStatus);

module.exports = router;
