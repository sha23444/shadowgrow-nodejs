const express = require('express');
const router = express.Router();
const downloadPackageController = require('../../controllers/admin/downloadPackage');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.post('/create', authenticateUser, downloadPackageController.addPackage);
router.get('/list', authenticateUser, downloadPackageController.getPackages);
router.put('/update/:packageId', authenticateUser, downloadPackageController.updatePackage)
router.delete('/delete/:packageId', authenticateUser, downloadPackageController.deletePackage);
router.patch('/update-order', authenticateUser, downloadPackageController.changeOrder);
router.get('/all', authenticateUser, downloadPackageController.getPackageList);
router.get('/search', authenticateUser, downloadPackageController.searchPackages);
router.get('/purchases', authenticateUser, downloadPackageController.getPackagePurchaseReport); // New route
router.get('/stats', authenticateUser, downloadPackageController.getPackageStats);

module.exports = router;  