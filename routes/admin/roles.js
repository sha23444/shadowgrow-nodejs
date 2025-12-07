var express = require("express");
var router = express.Router();

const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const { authorizeAdmin, buildPermissionKey } = require("../../middlewars/authorizeAdmin");
const RolesController = require("../../controllers/admin/roles");

router.use(authenticateAdmin);

router.post(
  "/create",
  authorizeAdmin(buildPermissionKey("admin_roles", "edit")),
  RolesController.createRole
);

router.get(
  "/",
  authorizeAdmin(buildPermissionKey("admin_roles", "list")),
  RolesController.getRoles
);

router.put(
  "/update/:roleId",
  authorizeAdmin(buildPermissionKey("admin_roles", "edit")),
  RolesController.updateRole
);

router.delete(
  "/delete/:roleId",
  authorizeAdmin(buildPermissionKey("admin_roles", "delete")),
  RolesController.deleteRole
);

router.get(
  "/:roleId",
  authorizeAdmin(buildPermissionKey("admin_roles", "view")),
  RolesController.getRoleById
);

router.post(
  "/:roleId/permissions",
  authorizeAdmin(buildPermissionKey("admin_roles", "edit")),
  RolesController.assignPermissions
);

router.get(
  "/:roleId/permissions",
  authorizeAdmin(buildPermissionKey("admin_roles", "view")),
  RolesController.getPermissionsForRole
);

module.exports = router;

