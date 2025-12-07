var express = require('express');
var router = express.Router();
const smtpController = require("../../controllers/admin/smtp") 

router.post("/smtp", smtpController.saveSmtpConfig);
router.get("/smtp", smtpController.getSmtpConfig);

module.exports = router;
