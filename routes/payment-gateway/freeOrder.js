const express = require('express');
const router = express.Router();
const { processFreeOrder } = require('../../controllers/payment-gateway/freeOrder');
const authenticateToken = require("../../middlewars/authenticateToken");

router.post('/process', authenticateToken, processFreeOrder);

module.exports = router;
