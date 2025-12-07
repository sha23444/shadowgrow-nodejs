var express = require("express");
var router = express.Router();

const {adminAuthController}  = require("../../controllers/admin/auth");
const authenticateAdmin = require("../../middlewars/authenticateAdmin");

// router.post("/register",  adminAuthController.createAdmin);

// Login flow with 2FA support
router.post("/login", adminAuthController.login); // Updated login endpoint with 2FA support
router.post("/verify-2fa", adminAuthController.verifyMicrosoft2FAToken); // 2FA verification endpoint
router.post("/verify-backup-code", adminAuthController.verifyBackupCode); // Backup code verification endpoint

router.post("/change-password", authenticateAdmin, adminAuthController.changePassword);
router.post("/forgot-password", adminAuthController.forgotPassword);

// Profile routes
router.get("/profile", authenticateAdmin, adminAuthController.getProfile);
router.put("/profile", authenticateAdmin, adminAuthController.updateProfile);

// Email change
router.post("/change-email", authenticateAdmin, adminAuthController.changeEmail);
router.get("/confirm-email-change", adminAuthController.confirmEmailChange);

// Password reset confirmation
router.post("/reset-password", adminAuthController.confirmPasswordReset);

// Microsoft Authenticator 2FA routes
router.get("/microsoft-2fa/status", authenticateAdmin, adminAuthController.getMicrosoft2FAStatus);
router.post("/microsoft-2fa/setup", authenticateAdmin, adminAuthController.setupMicrosoft2FA);
router.post("/microsoft-2fa/verify", authenticateAdmin, adminAuthController.verifyMicrosoft2FASetup);
router.post("/microsoft-2fa/disable", authenticateAdmin, adminAuthController.disableMicrosoft2FA);
router.get("/microsoft-2fa/encourage-setup", authenticateAdmin, adminAuthController.encourage2FASetup);
router.post("/microsoft-2fa/enable", authenticateAdmin, adminAuthController.enable2FA);

// Backup codes routes
router.get("/backup-codes/status", authenticateAdmin, adminAuthController.getBackupCodesStatus);
router.get("/backup-codes/all", authenticateAdmin, adminAuthController.getAllBackupCodes);
router.post("/backup-codes/regenerate", authenticateAdmin, adminAuthController.regenerateBackupCodes);

module.exports = router;        