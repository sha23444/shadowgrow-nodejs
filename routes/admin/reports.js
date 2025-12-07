var express = require('express');
var router = express.Router();

const ReportsController = require('../../controllers/admin/reports');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/transactions', authenticateUser, ReportsController.getTransactions);
router.get('/downloads', authenticateUser, ReportsController.getDownloadsHistory);
router.get('/wallet', authenticateUser, ReportsController.getWalletTransactions);
router.get('/files', authenticateUser, ReportsController.getAllFiles);
router.get('/packages', authenticateUser, ReportsController.getPackages);
router.get('/download-visitors', authenticateUser, ReportsController.getDownladsVisitors);
router.get('/staff-activities', authenticateUser, ReportsController.getStaffActivity);
router.get('/ip-blacklist', authenticateUser, ReportsController.getIpBlacklist);
router.get('/coupons/usage', authenticateUser, ReportsController.getCouponUsageReport);
router.get('/coupons/all', authenticateUser, ReportsController.getAllCouponsReport);
router.get('/coupons/usage/download', authenticateUser, ReportsController.downloadCouponUsageExcel);
router.get('/coupons/all/download',authenticateUser, ReportsController.downloadAllCouponsExcel);

module.exports = router;