var express = require('express');
var router = express.Router();

const DownloadsController = require('../../../controllers/admin/user/downloads');
const authenticateUser = require('../../../middlewars/authenticateAdmin');


router.get('/', authenticateUser , DownloadsController.getDownloadsHistory);

module.exports = router;
