const express = require("express");
const router = express.Router();

const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const { authorizeAdmin, buildPermissionKey } = require("../../middlewars/authorizeAdmin");
const { adminsController } = require("../../controllers/admin/admins");

const perms = {
  list: buildPermissionKey("admin_accounts", "list"),
  view: buildPermissionKey("admin_accounts", "view"),
  edit: buildPermissionKey("admin_accounts", "edit"),
  delete: buildPermissionKey("admin_accounts", "delete"),
};

router.use(authenticateAdmin);

router.get("/", authorizeAdmin(perms.list), adminsController.list);
router.get("/:id", authorizeAdmin(perms.view), adminsController.getById);
router.post("/create", authorizeAdmin(perms.edit), adminsController.create);
router.put("/:id", authorizeAdmin(perms.edit), adminsController.update);
router.delete("/:id", authorizeAdmin(perms.delete), adminsController.remove);
router.post("/:id/toggle-status", authorizeAdmin(perms.edit), adminsController.setStatus);
router.post("/:id/change-password", authorizeAdmin(perms.edit), adminsController.changePassword);

router.post(
  "/check-username-email",
  authorizeAdmin(perms.edit),
  adminsController.checkUsernameEmail
);

router.get(
  "/:id/backup-codes/download",
  authorizeAdmin(perms.view),
  adminsController.downloadBackupCodes
);
router.post("/:id/2fa/reset", authorizeAdmin(perms.edit), adminsController.reset2FA);
router.post(
  "/:id/backup-codes/reset",
  authorizeAdmin(perms.edit),
  adminsController.resetBackupCodes
);

module.exports = router;

