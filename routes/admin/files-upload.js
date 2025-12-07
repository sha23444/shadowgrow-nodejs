const express = require('express');
const router = express.Router();
const upload = require('../../config/fileUpload');

const FilesController = require('../../controllers/admin/file-upload');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router
    .route('/upload')
    .post(authenticateUser, upload.files(FilesController.expectedFiles()), FilesController.uploadFiles)

module.exports = router;
