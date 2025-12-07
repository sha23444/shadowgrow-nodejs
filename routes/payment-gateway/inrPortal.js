const express = require("express");
const router = express.Router();
const inrPortalController = require("../../controllers/payment-gateway/inrPortal");
const authenticateToken = require("../../middlewars/authenticateToken");

router.post("/create-order", authenticateToken, inrPortalController.createOrder);
router.post("/update/order", authenticateToken, inrPortalController.checkPaymentStatus);
router.post("/webhook", inrPortalController.webhook);

module.exports = router;
