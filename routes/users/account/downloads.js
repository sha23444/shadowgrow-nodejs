var express = require('express');
var router = express.Router();

const DownloadsController = require('../../../controllers/user/account/downloads');
const authenticate = require('../../../middlewars/authenticateToken');


router.get('/', authenticate, DownloadsController.getDownloadsHistory);
router.get('/paid-files', authenticate, DownloadsController.getPaidFilesList);
router.get('/download-file/:fileId', authenticate, DownloadsController.downloadFile);
router.get("/file-password/:fileId",authenticate, DownloadsController.getFilePassword )



module.exports = router;
