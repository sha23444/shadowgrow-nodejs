const express = require("express");
const router = express.Router();

const ManualPaymentController = require("../../controllers/payment-gateway/manual-payment");
const authenticateToken = require("../../middlewars/authenticateToken");

router.post("/create-order", authenticateToken, ManualPaymentController.createOrder);
router.post("/confirm-order", authenticateToken, ManualPaymentController.confirmOrder);

module.exports = router;