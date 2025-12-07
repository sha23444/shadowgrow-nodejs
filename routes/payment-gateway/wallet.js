const express = require("express");
const router = express.Router();

const WalletController = require("../../controllers/payment-gateway/wallet");
const authenticateToken = require("../../middlewars/authenticateToken");

router.post("/create-order", authenticateToken,  WalletController.createOrder);

module.exports = router;
