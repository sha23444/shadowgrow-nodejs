var express = require('express');
var router = express.Router();

const DownloadsController = require('../../controllers/admin/downloadsHistory');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/list', authenticateUser, DownloadsController.getDownloadsHistory);
router.get('/file', authenticateUser, DownloadsController.getFileDownloadHistory);
router.delete('/file/delete/:downloadId', authenticateUser, DownloadsController.deleteDownloadHistory);

module.exports = router;

