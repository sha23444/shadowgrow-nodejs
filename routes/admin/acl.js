var express = require('express');
var router = express.Router();

const ACLController = require('../../controllers/admin/acl');

router.get('/users', ACLController.getUserList);

module.exports = router;
 