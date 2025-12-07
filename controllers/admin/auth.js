const { pool, secretKey } = require("../../config/database");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { DATE } = require("sequelize");
const { sendEmail } = require("../../email-service/email-service");
const crypto = require("crypto");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { buildAdminAuthPayload } = require("./helpers/rbac");

const EMAIL_CHANGE_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

// Generate 10 backup codes for 2FA security reset
function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate 12-character alphanumeric code
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

async function generateAuthResponse(adminRow, extra = {}) {
  const payload = await buildAdminAuthPayload(adminRow);
  const tokenPayload = {
    id: payload.id,
    username: payload.username,
    email: payload.email,
    role_key: payload.role_key,
  };
  const token = jwt.sign(tokenPayload, secretKey, { expiresIn: "1d" });

  return {
    status: "success",
    token,
    ...payload,
    ...extra,
  };
}

const adminAuthController = {
  async createAdmin(req, res) {
    const { username, password, email, fullName, phone } = req.body;

    if (!username || !password || !email) {
      return res
        .status(400)
        .json({ error: "Please fill all required fields." });
    }

    try {
      const [existingUser] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ?",
        [username]
      );

      if (existingUser.length > 0) {
        return res.status(409).json({
          message: "Username already exists, please try another username",
        });
      }

      const [existingEmail] = await pool.execute(
        "SELECT * FROM res_admins WHERE email = ?",
        [email]
      );

      if (existingEmail.length > 0) {
        return res.status(409).json({
          message:
            "Email already registered, if this yours try forget password. ",
        });
      }

      const hashedPassword = await bcrypt.hashSync(password, 10);

      const [data] = await pool.execute(
        "INSERT INTO res_admins (username, password, email, fullName, phone) VALUES (?, ?, ?, ?, ?)",
        [username, hashedPassword, email, fullName, phone]
      );


      const [user] = await pool.execute(
        "SELECT * FROM res_admins WHERE id = ?",
        [data.insertId]
      );

      return user;
    } catch (error) {
      throw error;
    }
  },

  async login(req, res, next) {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    try {
      const [rows] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ?",
        [username]
      );


      if (rows.length === 0) {
        return res.status(400).json({ error: "Invalid username or password" });
      }

      // Block disabled/inactive admins
      const accountStatus = rows[0].status;
      const isDisabledAccount = (() => {
        if (accountStatus === undefined || accountStatus === null) return false;
        const s = String(accountStatus).toLowerCase();
        return s === 'disabled' || s === 'inactive' || s === '0' || s === 'false';
      })();

      if (isDisabledAccount) {
        return res.status(403).json({ error: "Your admin account is disabled. Please contact the administrator." });
      }

      const storedHashedPassword = rows[0].password;
      const passwordMatch = await bcrypt.compare(
        password,
        storedHashedPassword
      );

      if (!passwordMatch) {
        return res.status(400).json({ error: "Invalid password" });
      }

      const adminRow = rows[0];

      // Check if 2FA is enabled
      if (adminRow.two_fa_enabled) {
        // Don't generate token, just return 2FA required response
        return res.status(200).json({
          status: "2fa_required",
          message: "2FA code required from your authenticator app",
          requires2FA: true,
          email: adminRow.email,
          username: adminRow.username
        });
      }

      // Generate QR code and security suggestion for users without 2FA
      let securitySuggestion = null;
      if (!adminRow.two_fa_enabled) {
        try {
      // Generate a new secret for TOTP authenticator apps
      const secret = speakeasy.generateSecret({
        name: `${adminRow.first_name || 'Admin'} (${adminRow.email})`,
        issuer: process.env.APP_NAME || 'ShadowGrow Admin',
        length: 32
      });

          // Store the secret temporarily (not enabled yet)
          await pool.execute(
            "UPDATE res_admins SET two_fa_secret = ? WHERE username = ?",
            [secret.base32, username]
          );
          adminRow.two_fa_secret = secret.base32;

          // Generate QR code
          const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

          // Generate backup codes for preview (not stored yet)
          const previewBackupCodes = generateBackupCodes();

          securitySuggestion = {
            enabled: false,
            message: "Consider enabling 2FA for enhanced security",
            qrCode: qrCodeUrl,
            secret: secret.base32,
            manualEntryKey: secret.base32,
            backupCodes: previewBackupCodes,
            backupCodesNote: "These backup codes will be saved when you enable 2FA. Save them securely!",
            instructions: {
              title: "Enable Two-Factor Authentication",
              subtitle: "Secure your account with any authenticator app",
              steps: [
                "1. Download any authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.)",
                "2. Scan the QR code below with the app",
                "3. Or manually enter the secret key if scanning fails",
                "4. Enter the 6-digit code from the app to verify",
                "5. Your account will be secured with 2FA and backup codes will be saved"
              ],
              benefits: [
                "Protects against unauthorized access",
                "Required for sensitive operations",
                "Industry standard security practice",
                "Works with any TOTP-compatible authenticator app",
                "Includes backup codes for account recovery"
              ],
              compatibleApps: [
                "Google Authenticator",
                "Microsoft Authenticator", 
                "Authy",
                "1Password",
                "Bitwarden",
                "LastPass Authenticator",
                "Any TOTP-compatible app"
              ]
            }
          };
          console.log(`[ADMIN LOGIN] 2FA suggestion generated for '${username}'`);
        } catch (error) {
          console.warn(`[ADMIN LOGIN] Failed to prepare 2FA suggestion for '${username}': ${error.message}`);
        }
      }

      const responsePayload = await generateAuthResponse(adminRow, {
        message: "You have successfully logged in.",
        securitySuggestion: securitySuggestion,
      });

      return res.status(200).json(responsePayload);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 1. Get admin profile
  async getProfile(req, res) {
    try {
      const username = req.user.username;

      const [[admin]] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ?",
        [username]
      );
      if (!admin) return res.status(404).json({ error: "Admin not found" });
      res.status(200).json({ status: "success", data: admin });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 2. Update admin profile
  async updateProfile(req, res) {
    try {
      const adminId = req.user.username;
      const { first_name, last_name, phone, avatar } = req.body;
      await pool.execute(
        "UPDATE res_admins SET first_name = ?, last_name = ?, phone = ?, avatar = ?, updated_at = NOW() WHERE username = ?",
        [first_name, last_name, phone, avatar, adminId]
      );
      res.status(200).json({ status: "success", message: "Profile updated" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 3. Change password
  async changePassword(req, res) {
    try {
      const username = req.user.username;
      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) {
        return res.status(400).json({ error: "Current and new password required" });
      }
      const [[admin]] = await pool.execute(
        "SELECT password FROM res_admins WHERE username = ?",
        [username]
      );
      if (!admin) return res.status(404).json({ error: "Admin not found" });
      const match = await bcrypt.compare(current_password, admin.password);
      if (!match) return res.status(400).json({ error: "Current password is incorrect" });
      const hashed = await bcrypt.hash(new_password, 10);
      await pool.execute(
        "UPDATE res_admins SET password = ?, updated_at = NOW() WHERE username = ?",
        [hashed, username]
      );
      res.status(200).json({ status: "success", message: "Password changed" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 4. Change email (send confirmation)
  async changeEmail(req, res) {
    try {
      const username = req.user.username;
      const { current_email, new_email, password } = req.body;
      if (!new_email) return res.status(400).json({ error: "New email required" });

      // check if current email is the same as the new email
      if (current_email === new_email) {
        return res.status(400).json({ error: "Current email and new email cannot be the same" });
      }

      // get admin id from the username
      const [[adminRow]] = await pool.execute(
        "SELECT id FROM res_admins WHERE username = ?",
        [username]
      );
      const adminId = adminRow.id;

      // check if new email is already in use
      const [existing] = await pool.execute(
        "SELECT id FROM res_admins WHERE email = ?",
        [new_email]
      );
      if (existing.length > 0) return res.status(409).json({ error: "Email already in use" });

      // Fetch current admin
      const [[admin]] = await pool.execute(
        "SELECT email, password FROM res_admins WHERE id = ?",
        [adminId]
      );
      if (!admin) return res.status(404).json({ error: "Admin not found" });
      if (current_email && admin.email !== current_email) {
        return res.status(400).json({ error: "Current email does not match" });
      }
      // Verify password
      if (password && !(await bcrypt.compare(password, admin.password))) {
        return res.status(400).json({ error: "Password is incorrect" });
      }
      // Generate token
      const token = crypto.randomBytes(32).toString("hex");
      const expires = Date.now() + EMAIL_CHANGE_TOKEN_EXPIRY;
      // Save token and new email in DB (temp fields)
      await pool.execute(
        "UPDATE res_admins SET email_change_token = ?, email_change_expires = ?, email_change_new = ? WHERE id = ?",
        [token, expires, new_email, adminId]
      );
      // Send confirmation email
      const confirmUrl = `${process.env.APP_BASE_URL}/admin/confirm-email-change?token=${token}`;
      await sendEmail(new_email, "Confirm your new email", "email-verification", {
        username,
        verificationLink: confirmUrl,
      });
      res.status(200).json({ status: "success", message: "Confirmation email sent" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email required" });

      // check if email is in use
      const [[admin]] = await pool.execute(
        "SELECT id FROM res_admins WHERE email = ?",
        [email]
      );

      if (!admin) return res.status(404).json({ error: "Admin not found" });

      // generate token
      const token = crypto.randomBytes(32).toString("hex");
      const expires = Date.now() + EMAIL_CHANGE_TOKEN_EXPIRY;

      // save token and email in DB
      await pool.execute(
        "UPDATE res_admins SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?",
        [token, expires, admin.id]
      );

      // send email with token
      const resetUrl = `${process.env.ADMIN_BASE_URL}/reset-password?token=${token}`;
      await sendEmail(email, "Reset your password", "password-reset", {
        username: admin.username,
        resetUrl,
      });

      res.status(200).json({ status: "success", message: "Reset password email sent" });

    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 5. Confirm email change
  async confirmEmailChange(req, res) {
    try {
      const { token } = req.query;
      if (!token) return res.status(400).json({ error: "Token required" });
      const [[admin]] = await pool.execute(
        "SELECT id, email_change_new, email_change_expires FROM res_admins WHERE email_change_token = ?",
        [token]
      );
      // Debug logs

      if (!admin) return res.status(400).json({ error: "Invalid or expired token" });
      if (Date.now() > Number(admin.email_change_expires)) {
        return res.status(400).json({ error: "Token expired" });
      }
      await pool.execute(
        "UPDATE res_admins SET email = ?, email_change_token = NULL, email_change_expires = NULL, email_change_new = NULL WHERE id = ?",
        [admin.email_change_new, admin.id]
      );
      res.status(200).json({ status: "success", message: "Email updated" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },


  async confirmPasswordReset(req, res) {
    try {
      const { token, password } = req.body; 
      if (!token || !password) return res.status(400).json({ error: "Token and password required" });
      const [[admin]] = await pool.execute(
        "SELECT id, password_reset_expires FROM res_admins WHERE password_reset_token = ?",
        [token]
      );
      
      if (!admin) return res.status(400).json({ error: "Invalid or expired token" });
      if (Date.now() > Number(admin.password_reset_expires)) {
        return res.status(400).json({ error: "Token expired" });
      }
      const hashed = await bcrypt.hash(password, 10);
      await pool.execute(
        "UPDATE res_admins SET password = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?",
        [hashed, admin.id]
      );
      res.status(200).json({ status: "success", message: "Password reset" });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Universal TOTP 2FA Methods (works with any authenticator app)

  // 1. Setup TOTP 2FA - Generate QR Code
  async setupMicrosoft2FA(req, res) {
    try {
      const username = req.user.username;
      
      // Get admin details
      const [[admin]] = await pool.execute(
        "SELECT id, email, first_name, last_name FROM res_admins WHERE username = ?",
        [username]
      );
      
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Generate a new secret for TOTP authenticator apps
      const secret = speakeasy.generateSecret({
        name: `${admin.first_name || 'Admin'} (${admin.email})`,
        issuer: process.env.APP_NAME || 'ShadowGrow Admin',
        length: 32
      });

      // Store the secret temporarily (not enabled yet) using existing two_fa_secret column
      await pool.execute(
        "UPDATE res_admins SET two_fa_secret = ? WHERE username = ?",
        [secret.base32, username]
      );

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      res.status(200).json({
        status: "success",
        qrCode: qrCodeUrl,
        secret: secret.base32,
        manualEntryKey: secret.base32,
        message: "Scan the QR code with any authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.)"
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 2. Verify Microsoft Authenticator 2FA Setup
  async verifyMicrosoft2FASetup(req, res) {
    try {
      const username = req.user.username;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Verification code is required" });
      }

      // Get the stored secret using existing two_fa_secret column
      const [[admin]] = await pool.execute(
        "SELECT two_fa_secret FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin || !admin.two_fa_secret) {
        return res.status(400).json({ error: "Microsoft 2FA not initialized. Please setup first." });
      }

      // Verify the token
      const verified = speakeasy.totp.verify({
        secret: admin.two_fa_secret,
        encoding: 'base32',
        token: code,
        window: 2 // Allow 2 time steps tolerance
      });

      if (!verified) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes();
      const backupCodesJson = JSON.stringify(backupCodes);

      // Enable Microsoft 2FA and store backup codes using existing columns
      await pool.execute(
        "UPDATE res_admins SET two_fa_enabled = 1, two_fa_backup_codes = ? WHERE username = ?",
        [backupCodesJson, username]
      );

      res.status(200).json({
        status: "success",
        message: "Microsoft Authenticator 2FA enabled successfully",
        backupCodes: backupCodes,
        warning: "Please save these backup codes in a secure location. They can be used to access your account if you lose your authenticator device."
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 3. Get Microsoft 2FA Status
  async getMicrosoft2FAStatus(req, res) {
    try {
      const username = req.user.username;

      const [[admin]] = await pool.execute(
        "SELECT two_fa_enabled, two_fa_secret FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      res.status(200).json({
        status: "success",
        enabled: !!admin.two_fa_enabled,
        isSetup: !!admin.two_fa_secret
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 4. Disable Microsoft 2FA
  async disableMicrosoft2FA(req, res) {
    try {
      const username = req.user.username;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: "Password is required to disable 2FA" });
      }

      // Verify password
      const [[admin]] = await pool.execute(
        "SELECT password FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: "Invalid password" });
      }

      // Disable Microsoft 2FA using existing columns
      await pool.execute(
        "UPDATE res_admins SET two_fa_enabled = 0, two_fa_secret = NULL WHERE username = ?",
        [username]
      );

      res.status(200).json({
        status: "success",
        message: "Microsoft Authenticator 2FA disabled successfully"
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 5. Verify Backup Code and Complete Login
  async verifyBackupCode(req, res) {
    try {
      const { username, backupCode } = req.body;

      if (!username || !backupCode) {
        return res.status(400).json({ error: "Username and backup code are required" });
      }

      // Get admin details
      const [[admin]] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled || !admin.two_fa_backup_codes) {
        return res.status(400).json({ error: "Backup codes are not available for this account" });
      }

      // Parse backup codes from JSON
      let backupCodes;
      try {
        backupCodes = JSON.parse(admin.two_fa_backup_codes);
      } catch (error) {
        return res.status(500).json({ error: "Invalid backup codes format" });
      }

      // Check if the provided backup code exists
      const codeIndex = backupCodes.indexOf(backupCode.toUpperCase());
      if (codeIndex === -1) {
        return res.status(400).json({ error: "Invalid backup code" });
      }

      // Remove the used backup code
      backupCodes.splice(codeIndex, 1);
      const updatedBackupCodesJson = JSON.stringify(backupCodes);

      // Update the database with remaining backup codes
      await pool.execute(
        "UPDATE res_admins SET two_fa_backup_codes = ? WHERE username = ?",
        [updatedBackupCodesJson, username]
      );

      const [[updatedAdmin]] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ? LIMIT 1",
        [username]
      );

      const responsePayload = await generateAuthResponse(updatedAdmin, {
        message: "Backup code verification successful. You are now logged in.",
        remainingBackupCodes: backupCodes.length,
        warning: backupCodes.length < 3 ? "You have fewer than 3 backup codes remaining. Consider regenerating them." : null,
      });

      res.status(200).json(responsePayload);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 6. Verify Microsoft 2FA Token and Complete Login
  async verifyMicrosoft2FAToken(req, res) {
    try {
      const { username, code } = req.body;

      if (!username || !code) {
        return res.status(400).json({ error: "Username and code are required" });
      }

      // Get admin details using existing columns
      const [[admin]] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled || !admin.two_fa_secret) {
        return res.status(400).json({ error: "Microsoft 2FA is not enabled for this account" });
      }

      // Verify the code
      const verified = speakeasy.totp.verify({
        secret: admin.two_fa_secret,
        encoding: 'base32',
        token: code,
        window: 2 // Allow 2 time steps tolerance
      });

      if (!verified) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      const responsePayload = await generateAuthResponse(admin, {
        message: "2FA verification successful. You are now logged in."
      });

      res.status(200).json(responsePayload);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 6. Enhanced Login with Microsoft 2FA Support
  async loginWith2FA(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    try {
      const [rows] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ?",
        [username]
      );

      if (rows.length === 0) {
        return res.status(400).json({ error: "Invalid username or password" });
      }

      // Block disabled/inactive admins
      const accountStatus = rows[0].status;
      const isDisabledAccount = (() => {
        if (accountStatus === undefined || accountStatus === null) return false;
        const s = String(accountStatus).toLowerCase();
        return s === 'disabled' || s === 'inactive' || s === '0' || s === 'false';
      })();
      if (isDisabledAccount) {
        return res.status(403).json({ error: "Your admin account is disabled. Please contact the administrator." });
      }

      const storedHashedPassword = rows[0].password;
      const passwordMatch = await bcrypt.compare(password, storedHashedPassword);

      if (!passwordMatch) {
        return res.status(400).json({ error: "Invalid password" });
      }

      const user = {
        id: rows[0].id,
        username: rows[0].username,
        email: rows[0].email,
        first_name: rows[0].first_name,
        last_name: rows[0].last_name,
        phone: rows[0].phone,
        avatar: rows[0].avatar,
        two_fa_enabled: rows[0].two_fa_enabled,
        two_fa_secret: rows[0].two_fa_secret,
      };

      // Check if Microsoft 2FA is enabled using existing two_fa_enabled column
      if (user.two_fa_enabled) {
        // Don't generate token, just return 2FA required response
        return res.status(200).json({
          status: "2fa_required",
          message: "Microsoft Authenticator 2FA code required",
          requires2FA: true,
          email: user.email,
          username: user.username
        });
      }

      const responsePayload = await generateAuthResponse(rows[0], {
        message: "You have successfully logged in.",
        securitySuggestion: {
          enabled: false,
          message: "Consider enabling 2FA for enhanced security",
          setupUrl: "/admin/microsoft-2fa/encourage-setup"
        }
      });

      return res.status(200).json(responsePayload);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 7. Enable 2FA with Verification Code
  async enable2FA(req, res) {
    try {
      const username = req.user.username;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Verification code is required" });
      }

      // Get admin details
      const [[admin]] = await pool.execute(
        "SELECT id, email, first_name, last_name, two_fa_enabled, two_fa_secret FROM res_admins WHERE username = ?",
        [username]
      );
      
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Check if 2FA is already enabled
      if (admin.two_fa_enabled) {
        return res.status(200).json({
          status: "already_enabled",
          message: "2FA is already enabled for your account"
        });
      }

      // Check if secret exists (should exist from login)
      if (!admin.two_fa_secret) {
        return res.status(400).json({ 
          error: "2FA setup not initialized. Please login again to get the QR code." 
        });
      }

      // Verify the code
      const verified = speakeasy.totp.verify({
        secret: admin.two_fa_secret,
        encoding: 'base32',
        token: code,
        window: 2 // Allow 2 time steps tolerance
      });

      if (!verified) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes();
      const backupCodesJson = JSON.stringify(backupCodes);

      // Enable 2FA and store backup codes
      await pool.execute(
        "UPDATE res_admins SET two_fa_enabled = 1, two_fa_backup_codes = ? WHERE username = ?",
        [backupCodesJson, username]
      );

      // Get updated admin details
      const [[updatedAdmin]] = await pool.execute(
        "SELECT * FROM res_admins WHERE username = ?",
        [username]
      );

      const responsePayload = await generateAuthResponse(updatedAdmin, {
        message: "2FA has been enabled successfully! Your account is now more secure.",
        backupCodes: backupCodes,
        warning: "Please save these backup codes in a secure location. They can be used to access your account if you lose your authenticator device."
      });

      res.status(200).json(responsePayload);
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 8. Regenerate Backup Codes
  async regenerateBackupCodes(req, res) {
    try {
      const username = req.user.username;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: "Password is required to regenerate backup codes" });
      }

      // Verify password
      const [[admin]] = await pool.execute(
        "SELECT password, two_fa_enabled FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this account" });
      }

      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: "Invalid password" });
      }

      // Generate new backup codes
      const backupCodes = generateBackupCodes();
      const backupCodesJson = JSON.stringify(backupCodes);

      // Update the database with new backup codes
      await pool.execute(
        "UPDATE res_admins SET two_fa_backup_codes = ? WHERE username = ?",
        [backupCodesJson, username]
      );

      res.status(200).json({
        status: "success",
        message: "Backup codes regenerated successfully",
        backupCodes: backupCodes,
        warning: "Please save these new backup codes in a secure location. The old backup codes are no longer valid."
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 9. Get Backup Codes Status
  async getBackupCodesStatus(req, res) {
    try {
      const username = req.user.username;

      const [[admin]] = await pool.execute(
        "SELECT two_fa_enabled, two_fa_backup_codes FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this account" });
      }

      let backupCodesCount = 0;
      if (admin.two_fa_backup_codes) {
        try {
          const backupCodes = JSON.parse(admin.two_fa_backup_codes);
          backupCodesCount = backupCodes.length;
        } catch (error) {
        }
      }

      res.status(200).json({
        status: "success",
        hasBackupCodes: backupCodesCount > 0,
        backupCodesCount: backupCodesCount,
        warning: backupCodesCount < 3 ? "You have fewer than 3 backup codes remaining. Consider regenerating them." : null
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 10. Get All Backup Codes
  async getAllBackupCodes(req, res) {
    try {
      const username = req.user.username;

      const [[admin]] = await pool.execute(
        "SELECT two_fa_enabled, two_fa_backup_codes FROM res_admins WHERE username = ?",
        [username]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this account" });
      }

      if (!admin.two_fa_backup_codes) {
        return res.status(404).json({ error: "No backup codes found for this account" });
      }

      let backupCodes;
      try {
        backupCodes = JSON.parse(admin.two_fa_backup_codes);
      } catch (error) {
        return res.status(500).json({ error: "Invalid backup codes format" });
      }

      res.status(200).json({
        status: "success",
        backupCodes: backupCodes,
        backupCodesCount: backupCodes.length,
        message: "Backup codes retrieved successfully",
        warning: backupCodes.length < 3 ? "You have fewer than 3 backup codes remaining. Consider regenerating them." : null
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 10. Encourage 2FA Setup (for admins without 2FA) - Keep for backward compatibility
  async encourage2FASetup(req, res) {
    try {
      const username = req.user.username;
      
      // Get admin details
      const [[admin]] = await pool.execute(
        "SELECT id, email, first_name, last_name, two_fa_enabled FROM res_admins WHERE username = ?",
        [username]
      );
      
      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      // Check if 2FA is already enabled
      if (admin.two_fa_enabled) {
        return res.status(200).json({
          status: "already_enabled",
          message: "2FA is already enabled for your account"
        });
      }

      // Generate a new secret for TOTP authenticator apps
      const secret = speakeasy.generateSecret({
        name: `${admin.first_name || 'Admin'} (${admin.email})`,
        issuer: process.env.APP_NAME || 'ShadowGrow Admin',
        length: 32
      });

      // Store the secret temporarily (not enabled yet)
      await pool.execute(
        "UPDATE res_admins SET two_fa_secret = ? WHERE username = ?",
        [secret.base32, username]
      );

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      // Generate backup code for preview (not stored yet)
      const previewBackupCodes = generateBackupCodes();

      res.status(200).json({
        status: "success",
        qrCode: qrCodeUrl,
        secret: secret.base32,
        manualEntryKey: secret.base32,
        backupCodes: previewBackupCodes,
        backupCodesNote: "These backup codes will be saved when you enable 2FA. Save them securely!",
        instructions: {
          title: "Enable Two-Factor Authentication",
          subtitle: "Secure your account with any authenticator app",
          steps: [
            "1. Download any authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.)",
            "2. Scan the QR code below with the app",
            "3. Or manually enter the secret key if scanning fails",
            "4. Enter the 6-digit code from the app to verify",
            "5. Your account will be secured with 2FA and backup codes will be saved"
          ],
          benefits: [
            "Protects against unauthorized access",
            "Required for sensitive operations",
            "Industry standard security practice",
            "Works with any TOTP-compatible authenticator app",
            "Includes backup codes for account recovery"
          ],
          compatibleApps: [
            "Google Authenticator",
            "Microsoft Authenticator", 
            "Authy",
            "1Password",
            "Bitwarden",
            "LastPass Authenticator",
            "Any TOTP-compatible app"
          ]
        },
        message: "Scan the QR code with any authenticator app to enable 2FA"
      });
    } catch (error) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }


};





module.exports = { adminAuthController };
