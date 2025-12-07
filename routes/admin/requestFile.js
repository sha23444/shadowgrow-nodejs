var express = require('express');
var router = express.Router();

const RequestFileController = require('../../controllers/admin/requestFile');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.post('/create', authenticateUser, RequestFileController.createRequestFile);
router.get('/list', authenticateUser, RequestFileController.getRequestFiles);
router.put('/update/:id', authenticateUser, RequestFileController.updateRequestFile);  

module.exports = router;
