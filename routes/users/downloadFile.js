const express = require("express");
const router = express.Router();

const authenticateUser = require("../../middlewars/authenticateToken");
const downloadFileController = require("../../controllers/user/downloadFile");

router.post(
  "/file/generate-download-link", authenticateUser, downloadFileController.generateDownloadLink);
router.get("/file/download/link", downloadFileController.downloadFile);
