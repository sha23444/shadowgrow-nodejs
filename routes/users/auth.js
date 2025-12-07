var express = require("express");
var router = express.Router();

const AuthController = require("../../controllers/user/auth");
const authenticate = require('../../middlewars/authenticateToken');

router.post("/signup", AuthController.signup);
router.post("/login", AuthController.login);
router.post("/otp/verify", AuthController.verifyOtp);
router.post("/otp/resend", AuthController.resendOtp);
router.post("/social-login/google", AuthController.googleSocialLogin);
// Add route to get Google OAuth authorization URL
router.get("/google/auth-url", AuthController.getGoogleAuthUrl);
// Add a GET route for Google OAuth callback
router.get("/google/callback", AuthController.googleOAuthCallback);
router.post("/facebook-login", AuthController.facebookSocialLogin);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
router.post("/check-username-email", AuthController.checkEmailOrUsername);
router.get("/verify-email", AuthController.verifyEmail);
router.post("/resend-verification-email", AuthController.resendVerificationEmail);
router.post("/checkout-login", AuthController.checkoutLogin);
router.post("/refresh-token", AuthController.refreshToken);
router.get("/profile", authenticate,  AuthController.getUserProfile);
router.patch("/add-phone", authenticate, AuthController.updatePhone);
router.post("/update-phone-with-token", AuthController.updatePhoneWithToken);

module.exports = router;
