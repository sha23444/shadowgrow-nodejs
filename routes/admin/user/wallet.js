const express = require('express');
const router = express.Router();

const WalletController = require("../../../controllers/admin/user/wallet");

router.post('/transfer-balance', WalletController.transferBalance);
router.get('/transactions',  WalletController.getTransactions);
router.get('/balance', WalletController.getTotalBalance);
router.post('/add-credits', WalletController.addCredit);


module.exports = router;
