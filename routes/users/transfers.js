var express = require('express');
var router = express.Router();

const TransferController = require('../controllers/transfer');

router.get('/transfers',  TransferController.transfer);


module.exports = router;
 