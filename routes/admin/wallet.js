var express = require('express');
var router = express.Router();

const WalletController = require('../../controllers/admin/wallet');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.post('/add', authenticateUser, WalletController.addWallet);

module.exports = router;
 
