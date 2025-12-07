var express = require('express');
var router = express.Router();

const AddressController = require('../../../controllers/user/address');
const authenticateUser = require('../../../middlewars/authenticateToken');

router.get('/', authenticateUser, AddressController.getUserAddresses);
router.post('/add', authenticateUser, AddressController.addUserAddress);

module.exports = router;
 