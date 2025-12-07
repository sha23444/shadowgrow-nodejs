var express = require("express");
var router = express.Router();

const PackageController = require("../../../controllers/user/account/downloadPackages");
const authenticate = require("../../../middlewars/authenticateToken");

router.get("/", authenticate, PackageController.getPackages);
router.get("/update/current-package", authenticate, PackageController.updateCurrentPackage);
router.get("/usage", authenticate, PackageController.getUserPackageUsage);

module.exports = router;
