var express = require('express');
var router = express.Router();

const DownloadReportsController = require('../../controllers/admin/downloadReports');
const authenticateAdmin = require('../../middlewars/authenticateAdmin');

// Route for downloading download history as Excel
router.get('/download-history', authenticateAdmin, DownloadReportsController.downloadHistoryExcel);

// Route for downloading download packages as Excel
router.get('/download-packages', authenticateAdmin, DownloadReportsController.downloadPackagesExcel);

module.exports = router;