var express = require("express");
var router = express.Router();

const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const { authorizeAdmin, buildPermissionKey } = require("../../middlewars/authorizeAdmin");
const ModulesController = require("../../controllers/admin/modules");

router.get(
  "/",
  authenticateAdmin,
  authorizeAdmin(buildPermissionKey("admin_roles", "view")),
  ModulesController.getAllModules
);

module.exports = router;

