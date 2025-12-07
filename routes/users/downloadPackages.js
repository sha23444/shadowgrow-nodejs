const express = require('express');
const router = express.Router();
const downloadPackageController = require('../../controllers/user/downloadPackages');
const { smartCache } = require("../../config/smart-cache");

// Cache all GET routes - package details are fetched frequently
router.get('/', smartCache, downloadPackageController.getPackageDetails);
router.get('/:id', smartCache, downloadPackageController.getPackages);

module.exports = router;  