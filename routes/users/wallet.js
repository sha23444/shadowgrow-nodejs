const express = require('express');
const router = express.Router();

const WalletController = require("../../controllers/user/wallet");
const authenticateUser = require('../../middlewars/authenticateToken');

router.post('/transfer-balance', authenticateUser, WalletController.transferBalance);
router.get('/transactions', authenticateUser, WalletController.getTransactions);
router.get('/balance', authenticateUser, WalletController.getTotalBalance);


module.exports = router;
