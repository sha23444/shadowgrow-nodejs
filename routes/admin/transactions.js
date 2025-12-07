const express = require('express');
const router = express.Router();
const { getAllTransactionList } = require('../../controllers/admin/transactions');

const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/', authenticateUser, getAllTransactionList)

module.exports = router;
