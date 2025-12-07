var express = require('express');
var router = express.Router();

const RequestFileController = require('../../controllers/user/requestFile');

router.post('/', RequestFileController.createRequestFile);

module.exports = router;
