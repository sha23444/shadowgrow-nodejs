var express = require('express');
var router = express.Router();

const TaxController = require('../../controllers/admin/taxes');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/', authenticateUser, TaxController.getTaxes);
router.post('/create', authenticateUser, TaxController.createTax);
router.patch('/:id/update', authenticateUser, TaxController.updateTax);
router.delete('/delete/:id', authenticateUser, TaxController.deleteTax);
router.patch('/:id/status', authenticateUser, TaxController.updateTaxStatus);
module.exports = router;
 