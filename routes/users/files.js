const express = require("express");
const router = express.Router();
const digitalFilesController = require("../../controllers/user/digitalFiles");
const downloadFileController = require("../../controllers/user/downloadFile");

const authenticateUser = require("../../middlewars/authenticateToken");
const { smartCache } = require("../../config/smart-cache");

// Use smart cache middleware for all GET requests
router.get("/folders", smartCache, digitalFilesController.getAllFoldersFiles);
router.get("/folders/files", smartCache, digitalFilesController.getFolderAndFiles);
router.get("/folders/path", smartCache, digitalFilesController.getFolderPath);
router.get("/folder/description", smartCache, digitalFilesController.getFolderDescription);

router.get("/file/path", smartCache, digitalFilesController.getFilePath);
router.get("/file", smartCache, digitalFilesController.getFileByFileSlug);

router.get("/files/recent", smartCache, digitalFilesController.recentFiles);
router.get("/files/paid", smartCache, digitalFilesController.paidFiles);
router.get("/files/free", smartCache, digitalFilesController.freeFiles);
// PUT route - NO CACHE (updates count, should not be cached)
router.put('/file/visit', digitalFilesController.incrementFileVisit);    

// downloads files from the file manager
router.get("/file/download/featured", authenticateUser, downloadFileController.downloadFeaturedFile);
router.get("/file/download/free", authenticateUser, downloadFileController.downloadFreeFile);
router.get("/file/download/paid", authenticateUser, downloadFileController.downloadPaidFile);
router.get("/product/download", authenticateUser, downloadFileController.downloadDigitalProduct);
router.post("/devices/trust", authenticateUser, downloadFileController.trustDevice);

router.get("/file/download/link", authenticateUser, downloadFileController.downloadFile);
router.get("/files/top-recent",  downloadFileController.getTopAndRecentFiles);

module.exports = router;
