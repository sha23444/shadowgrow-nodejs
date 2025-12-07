var express = require('express');
var router = express.Router();

const InvoiceController = require('../controllers/invoice');
const authenticateToken = require('../../middlewars/authenticateToken');

 router.post('/create', authenticateToken, InvoiceController.create);
 router.get('/invoices', InvoiceController.invoices);

module.exports = router;
 