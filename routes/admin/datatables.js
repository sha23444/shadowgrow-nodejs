var express = require('express');
var router = express.Router();

const UserDownloads = require('../../controllers/admin/user-downloads');

router.get('/users-downloads',  UserDownloads.getList);

module.exports = router;
 