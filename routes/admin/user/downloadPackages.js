var express = require('express');
var router = express.Router();

const DownloadsPackageController = require('../../../controllers/admin/user/downloadPackages');
const authenticateUser = require('../../../middlewars/authenticateAdmin');

router.get('/usage', authenticateUser, DownloadsPackageController.getPackageUsage);
router.patch('/update', authenticateUser, DownloadsPackageController.updateCurrentPackage);
router.get('/',  authenticateUser, DownloadsPackageController.getPackages);
router.post('/add', authenticateUser, DownloadsPackageController.addPackage);
router.get('/list', authenticateUser, DownloadsPackageController.getPackages);

module.exports = router;
