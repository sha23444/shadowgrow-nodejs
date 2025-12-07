var express = require('express');
var router = express.Router();

const EmailerController = require('../controllers/emailer');

 router.post('/send-email', EmailerController.sendEmail);

module.exports = router;
 