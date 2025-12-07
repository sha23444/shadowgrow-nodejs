const express = require("express");
const router = express.Router();

const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const { authorizeAdmin, buildPermissionKey } = require("../../middlewars/authorizeAdmin");
const PermissionsController = require("../../controllers/admin/permissions");

router.get(
  "/",
  authenticateAdmin,
  authorizeAdmin(buildPermissionKey("admin_roles", "view")),
  PermissionsController.listModulesWithPermissions
);

module.exports = router;


