const { pool } = require("../../config/database");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { DATE } = require("sequelize");
const crypto = require("crypto");
const { promisify } = require("util");
const randomBytesAsync = promisify(crypto.randomBytes);
const axios = require("axios");
const { sendEmail } = require("../../email-service/email-service");
const { OAuth2Client } = require('google-auth-library');
const { ErrorLogger } = require("../../logger");
const NotificationService = require("../../services/notificationService");

const secretKey = process.env.JWT_SECRET;

// Helper function to clean up partial registration attempts
async function cleanupPartialRegistration(email, username, phone) {
  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Delete any incomplete user records that might exist
      const conditions = [];
      const params = [];
      
      if (email) {
        conditions.push("email = ?");
        params.push(email);
      }
      if (username) {
        conditions.push("username = ?");
        params.push(username);
      }
      if (phone) {
        conditions.push("phone = ?");
        params.push(phone);
      }
      
      if (conditions.length > 0) {
        const whereClause = conditions.join(" OR ");
        await connection.execute(
          `DELETE FROM res_users WHERE (${whereClause}) AND is_email_verified = 0 AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
          params
        );
      }
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error cleaning up partial registration:", error);
    // Don't throw - this is a cleanup operation that shouldn't fail the main flow
  }
}

// Helper function to get Google OAuth configuration from res_options table
async function getGoogleOAuthConfig() {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value FROM res_options WHERE option_name IN (?, ?, ?)`,
      [
        'social_auth_google_client_id',
        'social_auth_google_client_secret',
        'social_auth_google_enabled',
      ]
    );
    
    const config = {};
    rows.forEach(row => {
      config[row.option_name] = row.option_value;
    });
    
    return config;
  } catch (error) {
    console.error('Error fetching Google OAuth config from database:', error);
    throw error;
  }
}

// Helper function to get master password configuration from res_options table
async function getMasterPasswordConfig() {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value FROM res_options WHERE option_name IN (?, ?)`,
      [
        'master_password',
        'master_password_enabled'
      ]
    );
    
    const config = {};
    rows.forEach(row => {
      config[row.option_name] = row.option_value;
    });
    
    return config;
  } catch (error) {
    console.error('Error fetching master password config from database:', error);
    throw error;
  }
}

async function getUserProfile(req, res) {
  const userId = req.user.id; // Assuming you have middleware to set req.user

  try {
    // Fetch user profile from the database
    const [row] = await pool.execute(
      "SELECT * FROM res_users WHERE user_id = ?",
      [userId]
    );

    if (row.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = row[0];

    const hasActivePackage = await checkUserPackage(user.user_id);

    // Send back user details without sensitive information
    return res.status(200).json({
      message: "User profile fetched successfully",
      user: {
        ...user,
        hasActivePackage, // Include active package status
        token: req.headers.authorization.split(" ")[1], // Assuming Bearer token
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function checkoutLogin(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Please provide your email." });
  }

  try {
    // Check if user exists

    const [existingUser] = await pool.execute(
      "SELECT * FROM res_users WHERE email = ? or username = ?",
      [email, email]
    );

    // If user exists, send OTP to email

    if (existingUser.length > 0) {
      const otp = Math.floor(100000 + Math.random() * 9000);

      // Update the OTP in the database

      await pool.execute(
        "UPDATE res_users SET otp = ? WHERE user_id = ?",
        [otp, existingUser[0].user_id]
      );

      // Send email with OTP
      const emailResult = await sendEmail(email, "OTP Verification", "otp-verification", {
        otp: otp,
        username: existingUser[0].username,
      });

      // Log email result and provide appropriate user feedback
      if (!emailResult.success) {
        await ErrorLogger.logEmailError(
          new Error(emailResult.error), 
          email, 
          existingUser[0].user_id, 
          req
        );
        
        return res.status(200).json({
          message: `OTP send failed. Try again.`,
          isNew: false,
          emailSent: false,
          errorCode: "EMAIL_SEND_FAILED"
        });
      }

      return res.status(200).json({
        message: `OTP sent to ${email}. Please verify via your email.`,
        isNew: false,
        emailSent: true
      });
    } else {
      // If user does not exist, create a new user

      // Generate a random password
      const randomPassword = (await randomBytesAsync(8)).toString("hex");

      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 9000);

      // Extract username from email
      let username = email.split("@")[0];

      // Check if the username already exists and modify if necessary
      const [existingUser1] = await pool.execute(
        "SELECT * FROM res_users WHERE username = ?",
        [username]
      );

      if (existingUser1.length > 0) {
        username = username + Math.floor(1000 + Math.random() * 9000);
      }

      // Hash password asynchronously

      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // Insert new user into the database

      await pool.execute(
        "INSERT INTO res_users (username, password, email, otp) VALUES (?, ?, ?, ?)",
        [username, hashedPassword, email, otp]
      );

      // Get the newly created user for notification
      const [newUser] = await pool.execute(
        "SELECT * FROM res_users WHERE email = ?",
        [email]
      );

      // Create admin notification for new user signup
      if (newUser.length > 0) {
        setImmediate(() => {
          NotificationService.createUserSignupNotification(newUser[0]).catch(notificationError => {
            console.error("Error creating admin notification:", notificationError);
          });
        });

        setImmediate(() => {
          const { notifyUserSignup } = require("../admin/telegram");
          notifyUserSignup(newUser[0]).catch(telegramError => {
            console.error('Error sending Telegram notification for user signup:', telegramError);
          });
        });
      }

      // Send email with OTP
      const emailResult = await sendEmail(email, "OTP Verification", "otp-verification", {
        otp: otp,
        username: username,
      });

      // Log email result and provide appropriate user feedback
      if (!emailResult.success) {
        await ErrorLogger.logEmailError(
          new Error(emailResult.error), 
          email, 
          null, 
          req
        );
        
        return res.status(201).json({
          message: `Account created. OTP send failed. Try again.`,
          isNew: true,
          emailSent: false,
          errorCode: "EMAIL_SEND_FAILED"
        });
      }

      return res.status(201).json({
        message: `OTP sent to ${email}. Please verify via your email.`,
        isNew: true,
        emailSent: true
      });
    }
  } catch (error) {
    console.error("Error during OTP sending process:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function signup(req, res) {
  const {
    username,
    password,
    email,
    dial_code = null,
    first_name = null,
    last_name = null,
    phone = null,
  } = req.body;

  if (!username || !password || !email) {
          return res.status(400).json({
        message: "Fill all required fields.",
        status: "error",
      });
  }

  try {
    // Step 1: Check for existing user/email/phone in one query
    const [conflictRows] = await pool.execute(
      `SELECT username, email, phone 
       FROM res_users 
       WHERE username = ? OR email = ? OR (phone IS NOT NULL AND phone = ?)`,
      [username, email, phone]
    );

    if (conflictRows.length > 0) {
      const conflicts = [];
      if (conflictRows.some(r => r.username === username)) conflicts.push("username");
      if (conflictRows.some(r => r.email === email)) conflicts.push("email");
      if (phone && conflictRows.some(r => r.phone === phone)) conflicts.push("phone");

      const conflictMessages = {
        username: "Username taken",
        email: "Email registered. Please login.",
        phone: "Phone registered. Try another or login.",
      };

      let errorMessage = conflicts.map(c => conflictMessages[c]).join(" and ");

      return res.status(409).json({
        message: errorMessage,
        status: "error",
        conflicts,
      });
    }

    // Step 2: Get email verification setting
    const [settingRows] = await pool.execute(
      "SELECT option_value FROM res_options WHERE option_name = 'email_verification_enabled'"
    );
    const isEmailVerificationEnabled =
      settingRows.length > 0 ? parseInt(settingRows[0].option_value) === 1 : true;

    // Step 3: Prepare user data
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = jwt.sign({ email }, secretKey, { expiresIn: "24h" });
    const isEmailVerified = isEmailVerificationEnabled ? 0 : 1;

    // Step 4: Insert user (atomic)
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [insertResult] = await connection.execute(
        `INSERT INTO res_users 
         (username, password, email, first_name, last_name, phone, verification_token, dial_code, is_mobile_verified, is_email_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [username, hashedPassword, email, first_name, last_name, phone, verificationToken, dial_code, 1, isEmailVerified]
      );

      const userId = insertResult.insertId;

      // Step 5: Send email based on verification requirement
      let emailResult;
      if (isEmailVerificationEnabled) {
        // When emailVerificationRequired is true - send OTP email (required verification)
        const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
        await connection.execute("UPDATE res_users SET otp = ? WHERE user_id = ?", [otp, userId]);
        emailResult = await sendEmail(email, "OTP Verification", "otp-verification", {
          otp,
          username,
        });
      } else {
        // When emailVerificationRequired is false - send verification email (optional verification)
        const verificationLink = `${process.env.APP_BASE_URL}/auth/verify-email?token=${verificationToken}`;
        emailResult = await sendEmail(email, "Verify Your Email", "email-verification", {
          username,
          verificationLink,
        });
      }

      await connection.commit();
      
      // Fetch complete user data for Telegram notification
      const [newUserRows] = await connection.execute(
        "SELECT * FROM res_users WHERE user_id = ?",
        [userId]
      );
      
      connection.release();

      // Send Telegram notification to subscribed bots (non-blocking)
      if (newUserRows.length > 0) {
        setImmediate(() => {
          const { notifyUserSignup } = require("../admin/telegram");
          notifyUserSignup(newUserRows[0]).catch(telegramError => {
            console.error('Error sending Telegram notification for user signup:', telegramError);
          });
        });
      }

      return res.status(201).json({
        message: isEmailVerificationEnabled
          ? "User registered successfully. We have sent an OTP to your email."
          : "User registered successfully. Please verify your email.",
        user: { username, email, first_name, last_name, phone, dial_code },
        status: "success",
        emailSent: emailResult.success,
        emailVerificationRequired: isEmailVerificationEnabled,
      });
    } catch (dbError) {
      await connection.rollback();
      connection.release();
      if (dbError.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          message: "Duplicate entry. Try different credentials.",
          status: "error",
        });
      }
      console.error("DB error:", dbError);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Registration failed. Try again.",
    });
  }
}


async function verifyEmail(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ message: "Token required" });
  }
  console.log(token);

  try {
    // Check if email verification is enabled first
    const [emailVerificationSetting] = await pool.execute(
      "SELECT option_value FROM res_options WHERE option_name = 'email_verification_enabled'"
    );

    const isEmailVerificationEnabled = emailVerificationSetting.length > 0 
      ? parseInt(emailVerificationSetting[0].option_value) === 1 
      : true;

    // If email verification is disabled, return error
    if (!isEmailVerificationEnabled) {
      return res.status(400).json({ 
        message: "Email verification disabled. Contact support.",
        status: "error",
        emailVerificationDisabled: true
      });
    }

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, secretKey);
    } catch (jwtError) {
      return res.status(404).json({ message: "Invalid or expired token", status: "error" });
    }

    // Get user by email from token
    const [users] = await pool.execute(
      "SELECT * FROM res_users WHERE user_id = ?",
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found", status: "error" });
    }

    const user = users[0];

    // Update user verification status
    const [result] = await pool.execute(
      "UPDATE res_users SET is_email_verified = 1, verification_token = NULL WHERE user_id = ?",
      [user.user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found or verified", status: "error" });
    }

    return res.status(200).json({
      message: "Email verified. You can now login.",
      status: "success"
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return res.status(500).json({ error: "Internal Server Error", status: "error" });
  }
}

async function checkEmailOrUsername(req, res) {
  const { username, email } = req.body;

  try {
    if (username) {
      const [existingUser] = await pool.execute(
        "SELECT * FROM res_users WHERE username = ?",
        [username]
      );
      if (existingUser.length > 0) {
        return res.status(409).json({
          exists: true,
          message: "Username taken",
          status: "error"
        });
      } else {
        return res.status(200).json({
          exists: false,
          message: "Username available",
          status: "success"
        });
      }
    }

    if (email) {
      const [existingUser] = await pool.execute(
        "SELECT * FROM res_users WHERE email = ?",
        [email]
      );
      if (existingUser.length > 0) {
        return res.status(409).json({
          exists: true,
          message: "Email taken",
          status: "error"
        });
      } else {
        return res.status(200).json({
          exists: false,
          message: "Email available",
          status: "success"
        });
      }
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error", status: "error" });
  }
}

async function login(req, res) {
  const { username, password } = req.body;

  if ((!username && !email) || !password) {
    return res.status(400).json({
      error: "Provide username/email and password.",
    });
  }

  try {
    // Check if user exists and get email verification setting in parallel
    const [users, emailVerificationSetting] = await Promise.all([
      pool.execute(
        "SELECT * FROM res_users WHERE username = ? OR email = ? LIMIT 1",
        [username || "", username || ""] // Ensures proper parameter passing
      ),
      pool.execute("SELECT option_value FROM res_options WHERE option_name = 'email_verification_enabled'")
    ]);

    if (users[0].length === 0) {
      return res.status(400).json({ message: "Invalid credentials", status: "error" });
    }

    const user = users[0][0];

    // Check if email verification is enabled (default to true if setting doesn't exist)
    const isEmailVerificationEnabled = emailVerificationSetting[0].length > 0 
      ? parseInt(emailVerificationSetting[0][0].option_value) === 1 
      : true;

    // check if user is active
    if (user.status === 0) {
      return res.status(400).json({ message: "Account inactive. Contact support.", status: "error" });
    }

    // Only check email verification if it's enabled in settings
    if (isEmailVerificationEnabled && user.is_email_verified === 0) {

      // send email with token to verify email
      const token = jwt.sign(
        { id: user.user_id, username: user.username },
        secretKey,
        { expiresIn: "1h" }
      );

      // update user verification token
      await pool.execute(
        "UPDATE res_users SET verification_token = ? WHERE user_id = ?",
        [token, user.user_id]
      );

      const verificationLink = `${process.env.APP_BASE_URL}/auth/verify-email?token=${token}`;

      const emailResult = await sendEmail(user.email, "Verify Your Email", "email-verification", {
        username: user.username,
        verificationLink: verificationLink
      });

      // Log email result and provide appropriate user feedback
      if (!emailResult.success) {
        await ErrorLogger.logEmailError(
          new Error(emailResult.error), 
          user.email, 
          user.user_id, 
          req
        );
        
        // Email failed to send - provide alternative options
        return res.status(400).json({ 
          message: "Email verification required. Send failed. Try again.", 
          status: "error", 
          isEmailVerified: false,
          emailSent: false,
          errorCode: "EMAIL_SEND_FAILED"
        });
      }

      // Email sent successfully
      return res.status(400).json({ 
        message: "Verify email to login. Check your inbox.", 
        status: "error", 
        isEmailVerified: false,
        emailSent: true
      });
    }

    // check if user mobile is not null
    if (user.phone === null) {
      // Generate a temporary token for phone number update
      const tempToken = jwt.sign(
        { 
          id: user.user_id, 
          username: user.username,
          purpose: 'phone_update',
          temp: true 
        },
        secretKey,
        { expiresIn: "15m" } // Short expiry for security
      );

      return res.status(200).json({ 
        message: "Add mobile number to complete profile.", 
        status: "phone_required", 
        isPhoneNumberAdded: false,
        tempToken: tempToken,
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name
        }
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    // Get master password configuration from database
    let masterPasswordEnabled = false;
    let masterPassword = null;
    
    try {
      const masterConfig = await getMasterPasswordConfig();
      masterPasswordEnabled = masterConfig.master_password_enabled === "1";
      masterPassword = masterConfig.master_password;
    } catch (error) {

      await ErrorLogger.logError({
        errorType: 'auth',
        errorLevel: 'error',
        errorMessage: error.message,
        errorDetails: error,
        req: req
      });

      // Fallback to environment variable if database config fails
      masterPasswordEnabled = process.env.MASTER_PASSWORD_ENABLED === "1";
      masterPassword = process.env.MASTER_PASSWORD;
    }

    // Check if password matches user password or master password (if enabled)
    const isValidPassword = passwordMatch || (masterPasswordEnabled && password === masterPassword);

    if (!isValidPassword) {
      return res.status(400).json({ message: "Invalid password", status: "error" });
    }

    // Generate authentication token
    const token = jwt.sign(
      { id: user.user_id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { id: user.user_id, username: user.username },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Check if user has an active package
    const hasActivePackage = await checkUserPackage(user.user_id);


    // Send safe user details
    return res.status(200).json({
      message: "Login successful",
      status: "success",
      isMobileVerified: user.is_mobile_verified,
      user: {
        id: user.user_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        balance: user.balance,
        avatar: user.avatar,
        photo: user.photo,
        email: user.email,
        token,
        refreshToken,
        hasActivePackage,
      },
    });
  } catch (error) {
    await ErrorLogger.logError({
      errorType: 'auth',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      req: req
    });
    return res.status(500).json({ error: "Internal Server Error", status: "error" });
  }
}

// check if user have valid active package

async function checkUserPackage(user_id) {
  try {
    const [packages] = await pool.execute(
      "SELECT * FROM res_upackages WHERE user_id = ?",
      [user_id]
    );


    if (packages.length === 0) {
      return false;
    }

    const now = new Date();

    // Filter only active (non-expired) packages
    const activePackages = packages.filter(
      (pkg) => new Date(pkg.date_expire) > now && pkg.is_active === 1
    );


    if (activePackages.length === 0) {
      return false;
    }

    // Optional: Log expired ones
    const expiredPackages = packages.filter(
      (pkg) => new Date(pkg.date_expire) <= now
    );

    if (expiredPackages.length > 0) {
    }

    return true; // ✅ Only return true if at least one active package exists
  } catch (error) {
    console.error("Error checking user package:", error);
    return false;
  }
}

async function verifyOtp(req, res) {
  const { otp, email, isNew = false } = req.body;

  if (!otp || !email) {
    return res.status(400).json({ error: "Please fill all required fields." });
  }

  try {
    const [existingUser] = await pool.execute(
      "SELECT * FROM res_users WHERE email = ?",
      [email]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ message: "User not found", status: "error" });
    }

    const user = existingUser[0];

    if (user.otp != otp) {
      return res.status(401).json({ status: "error", message: "Invalid OTP" });
    }

    const token = jwt.sign(
      { id: user.user_id, username: user.username },
      secretKey,
      { expiresIn: "1d" }
    );

    await pool.execute(
      "UPDATE res_users SET is_email_verified = 1, is_mobile_verified = 1 WHERE user_id = ?",
      [user.user_id]
    );

    const hasActivePackage = await checkUserPackage(user.user_id);

    const [[options]] = await pool.query(
      `SELECT option_value FROM res_options WHERE option_name = 'site_name'`,
    );

    // Send welcome email

    if (isNew) {
      const siteName = options.option_value;

      const subjectName = `Welcome to ${siteName} – Let's Get Started!`;
      const pageUrl = `${process.env.APP_BASE_URL}`;

      const emailResult = await sendEmail(email, subjectName, "welcome", { ...user, pageUrl: pageUrl });

      // Log email result but don't fail the verification
      if (!emailResult.success) {
        await ErrorLogger.logEmailError(
          new Error(emailResult.error), 
          email, 
          user.user_id, 
          req
        );
      }
    }

    return res.status(200).json({
      message: "Login successful",
      status: "success",
      user: {
        ...user,
        token: token, // Include the token in the user object
        hasActivePackage,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error.message,
    });
  }
}

async function resendOtp(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Please provide your email." });
  }

  try {
    // Check if user exists
    const [existingUser] = await pool.execute(
      "SELECT * FROM res_users WHERE email = ?",
      [email]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = Math.floor(100000 + Math.random() * 9000);

    // Update the OTP in the database
    const [data] = await pool.execute(
      "UPDATE res_users SET otp = ? WHERE user_id = ?",
      [otp, existingUser[0].user_id]
    );

    // Send email with OTP
    const emailResult = await sendEmail(email, "OTP Verification", "otp-verification", {
      otp: otp,
      username: existingUser[0].username,
    });

    // Log email result and provide appropriate user feedback
    if (!emailResult.success) {
      await ErrorLogger.logEmailError(
        new Error(emailResult.error), 
        email, 
        existingUser[0].user_id, 
        req
      );
      
      return res.status(200).json({
        status: "error",
        message: "We couldn't send the OTP to your email. Please try again or contact support.",
        emailSent: false,
        errorCode: "EMAIL_SEND_FAILED"
      });
    }

    return res.status(200).json({
      status: "success",
      message: "OTP sent successfully. Please check your email.",
      emailSent: true
    });
  } catch (error) {
    console.error("Error during OTP sending process:", error);
    return res.status(500).json({ status: "error", error: "Internal Server Error" });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Please provide your email." });
  }

  try {
    // Check if user exists
    const [existingUser] = await pool.execute(
      "SELECT * FROM res_users WHERE email = ?",
      [email]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ message: "Email is not exist", status: "error" });
    }

    const token = jwt.sign(
      { id: existingUser[0].user_id, username: existingUser[0].username },
      secretKey,
      { expiresIn: "1h" }
    );

    const resetUrl = `${process.env.APP_BASE_URL}/auth/reset-password?token=${token}`;

    const emailResult = await sendEmail(email, "Password Reset", "password-reset", {
      resetUrl: resetUrl,
      username: existingUser[0].username,
    });

    // Log email result and provide appropriate user feedback
    if (!emailResult.success) {
      await ErrorLogger.logEmailError(
        new Error(emailResult.error), 
        email, 
        existingUser[0].user_id, 
        req
      );
      
      return res.status(200).json({
        status: "error",
        message: "We couldn't send the password reset email. Please try again or contact support.",
        emailSent: false,
        errorCode: "EMAIL_SEND_FAILED"
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Password reset email sent. Please check your inbox.",
      emailSent: true
    });
  } catch (error) {
    console.error("Error during password reset process:", error);
    return res.status(500).json({ status: "error", error: "Internal Server Error" });
  }
}

async function resetPassword(req, res) {
  const { password, token } = req.body;

  if (!token || !password) {
    return res
      .status(400)
      .json({ error: "Please provide both the token and password.", status: "error" });
  }

  try {
    // Verify the token directly from the payload (no "Bearer" split)
    const decodedToken = jwt.verify(token, secretKey);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the password in the database
    const [data] = await pool.execute(
      "UPDATE res_users SET password = ?, is_verified = 1 WHERE user_id = ?",
      [hashedPassword, decodedToken.id]
    );

    if (data.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "User not found or update failed.", status: "error" });
    }

    const pageUrl = `${process.env.APP_BASE_URL}/auth/forgot-password`;

    const [user] = await pool.execute(
      "SELECT * FROM res_users WHERE user_id = ?",
      [decodedToken.id]
    );

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found.", status: "error" });
    }

    const email = user[0].email;
    const username = user[0].username

    const emailResult = await sendEmail(email, "Your Password Has Been Successfully Reset", "reset-password-success", {
      pageUrl: pageUrl,
      username: username,
    });

    // Log email result but don't fail the password reset
    if (!emailResult.success) {
      await ErrorLogger.logEmailError(
        new Error(emailResult.error), 
        email, 
        user[0].user_id, 
        req
      );
    }

    return res.status(200).json({ message: "Password reset successful.", status: "success" });
  } catch (error) {
    console.error("Error during password reset process:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ status: "error", message: "Invalid or expired token." });
    }

    return res.status(500).json({ status: "error", error: "Internal Server Error" });
  }
}

async function googleSocialLogin(req, res) {
  try {
    const { code, access_token, credential } = req.body;
    
    // Support multiple authentication methods:
    // 1. access_token (from Google Identity Services - no redirect)
    // 2. code (from OAuth redirect flow)
    // 3. credential (JWT from Google Identity Services)
    
    if (!code && !access_token && !credential) {
      return res.status(400).json({ message: "Missing authentication token (code, access_token, or credential)", status: "error" });
    }

    // Get Google OAuth configuration from database
    const googleConfig = await getGoogleOAuthConfig();
    
    // Check if Google OAuth is enabled
    if (googleConfig.social_auth_google_enabled !== "1") {
      return res.status(400).json({ message: "Google OAuth is not enabled", status: "error" });
    }

    // Validate OAuth configuration
    if (!googleConfig.social_auth_google_client_id || !googleConfig.social_auth_google_client_secret) {
      console.error("Google OAuth credentials not configured in database");
      return res.status(500).json({ message: "OAuth configuration error", status: "error" });
    }

    let email, given_name, family_name, picture, sub;

    // Method 1: Access token (no redirect - preferred)
    if (access_token) {
      try {
        const axios = require('axios');
        const response = await axios.get(`https://www.googleapis.com/oauth2/v2/userinfo`, {
          params: { access_token },
          timeout: 10000
        });
        
        email = response.data.email;
        given_name = response.data.given_name;
        family_name = response.data.family_name;
        picture = response.data.picture;
        sub = response.data.id;
      } catch (error) {
        console.error('Error fetching user info with access token:', error);
        return res.status(400).json({ message: "Invalid access token", status: "error" });
      }
    }
    // Method 2: JWT credential (from Google Identity Services)
    else if (credential) {
      try {
    const finalRedirectUri = process.env.APP_BASE_URL + "/auth/callback/google";
        const dynamicOAuth2Client = new OAuth2Client(
          googleConfig.social_auth_google_client_id, 
          googleConfig.social_auth_google_client_secret, 
          finalRedirectUri
        );
        
        const ticket = await dynamicOAuth2Client.verifyIdToken({
          idToken: credential,
          audience: googleConfig.social_auth_google_client_id,
        });
        const payload = ticket.getPayload();
        email = payload.email;
        given_name = payload.given_name;
        family_name = payload.family_name;
        picture = payload.picture;
        sub = payload.sub;
      } catch (error) {
        console.error('Error verifying JWT credential:', error);
        return res.status(400).json({ message: "Invalid credential", status: "error" });
      }
    }
    // Method 3: OAuth code (redirect flow - legacy)
    else if (code) {
      const finalRedirectUri = process.env.APP_BASE_URL + "/auth/callback/google";
    const dynamicOAuth2Client = new OAuth2Client(
      googleConfig.social_auth_google_client_id, 
      googleConfig.social_auth_google_client_secret, 
      finalRedirectUri
    );

      // Exchange code for tokens
    const { tokens } = await dynamicOAuth2Client.getToken(code);
    dynamicOAuth2Client.setCredentials(tokens);

      // Get user info from Google
    const ticket = await dynamicOAuth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: googleConfig.social_auth_google_client_id,
    });
    const payload = ticket.getPayload();
      email = payload.email;
      given_name = payload.given_name;
      family_name = payload.family_name;
      picture = payload.picture;
      sub = payload.sub;
    }

    if (!email) {
      return res.status(400).json({ message: "Email is required", status: "error" });
    }

    // 3. Check if user exists
    const [existingUsers] = await pool.execute(
      "SELECT * FROM res_users WHERE email = ?",
      [email]
    );

    let userId, username, user;

    if (existingUsers.length > 0) {
      // Existing user: update info
      const existingUser = existingUsers[0];

      // Check if user is active
      if (existingUser.status === 0) {
        return res.status(400).json({
          message: "User is not active please contact support",
          status: "error"
        });
      }

      await pool.execute(
        `UPDATE res_users SET first_name = ?, photo = ?, is_email_verified = 1 WHERE user_id = ?`,
        [
          given_name ?? existingUser.first_name,
          picture ?? existingUser.photo,
          existingUser.user_id,
        ]
      );
      userId = existingUser.user_id;
      username = existingUser.username;
      user = existingUser;
    } else {
      // New user: create
      username = email.split('@')[0];
      // Check for username collision
      const [existingUsername] = await pool.execute(
        "SELECT * FROM res_users WHERE username = ?",
        [username]
      );
      if (existingUsername.length > 0) {
        username = username + Math.floor(1000 + Math.random() * 9000);
      }
      const randomPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const [insertResult] = await pool.execute(
        `INSERT INTO res_users (username, password, email, first_name, last_name, photo, is_email_verified, register_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          username,
          hashedPassword,
          email,
          given_name ?? '',
          family_name ?? '',
          picture,
          1,
          'google'
        ]
      );
      userId = insertResult.insertId;
      // Fetch the new user
      const [newUserRows] = await pool.execute(
        "SELECT * FROM res_users WHERE user_id = ?",
        [userId]
      );
      user = newUserRows[0];

      // Create admin notification for new user signup via Google
      setImmediate(() => {
        NotificationService.createUserSignupNotification(user).catch(async notificationError => {
          await ErrorLogger.logError({
            errorType: 'notification',
            errorLevel: 'error',
            errorMessage: notificationError.message,
            errorDetails: notificationError,
            userId: userId,
            endpoint: '/googleSocialLogin'
          });
        });
      });

      if (user) {
        setImmediate(() => {
          const { notifyUserSignup } = require("../admin/telegram");
          notifyUserSignup(user)
            .then(telegramResult => {
              if (!telegramResult.success) {
                return ErrorLogger.logError({
                  errorType: 'telegram_notification',
                  errorLevel: 'warning',
                  errorMessage: `Telegram notification failed for Google signup: ${telegramResult.error || 'Unknown error'}`,
                  errorDetails: {
                    module_key: 'user_signup',
                    user_id: user.user_id,
                    telegram_result: telegramResult
                  },
                  userId: user.user_id,
                  endpoint: '/googleSocialLogin'
                });
              }
              return null;
            })
            .catch(async telegramError => {
              console.error('Error sending Telegram notification for Google user signup:', telegramError);
              await ErrorLogger.logError({
                errorType: 'telegram_notification',
                errorLevel: 'error',
                errorMessage: `Exception in Telegram notification for Google signup: ${telegramError.message}`,
                errorDetails: telegramError,
                userId: user.user_id,
                endpoint: '/googleSocialLogin'
              });
            });
        });
      }
    }

    // 4. Generate your own JWT/session
    const token = jwt.sign(
      { id: userId, username: username },
      secretKey,
      { expiresIn: "1d" }
    );

    // 5. Check if user has an active package
    const hasActivePackage = await checkUserPackage(userId);

    // Require phone number if missing (like login)
    if (!user.phone) {
      // Generate a temporary token for phone number update
      const tempToken = jwt.sign(
        {
          id: userId,
          username: username,
          purpose: 'phone_update',
          temp: true
        },
        secretKey,
        { expiresIn: '15m' }
      );
      return res.status(200).json({
        message: 'Please add your mobile number to complete your profile.',
        status: 'phone_required',
        isPhoneNumberAdded: false,
        tempToken: tempToken,
        user: {
          id: userId,
          username: username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name
        }
      });
    }

    return res.status(200).json({
      message: "User is verified",
      status: "success",
      isMobileVerified: user.is_mobile_verified,
      user: {
        id: userId,
        username: username,
        first_name: user.first_name,
        last_name: user.last_name,
        balance: user.balance,
        avatar: user.avatar,
        photo: user.photo,
        email: user.email,
        token,
        hasActivePackage,
      }
    });

  } catch (err) {
    console.error("Error during social login:", err);

    // Handle specific OAuth errors
    if (err.message && err.message.includes('redirect_uri_mismatch')) {
      return res.status(400).json({
        message: "Redirect URI mismatch. Please check your Google OAuth configuration.",
        status: "error",
        error: "redirect_uri_mismatch",
        details: "The redirect URI in your request doesn't match what's configured in Google Cloud Console"
      });
    }

    return res.status(500).json({
      message: "Internal server error",
      status: "error",
      error: err.message
    });
  }
}


async function googleOAuthCallback(req, res) {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('Authorization code not provided');
    }

    // Get Google OAuth configuration from database
    const googleConfig = await getGoogleOAuthConfig();
    
    // Check if Google OAuth is enabled
    if (googleConfig.social_auth_google_enabled !== "1") {
      return res.status(400).send('Google OAuth is not enabled');
    }

    // Use the environment variable for API callback redirect URI
    const callbackRedirectUri = `${process.env.API_BASE_URL}/api/v1/user/auth/google/callback`;

    const dynamicOAuth2Client = new OAuth2Client(
      googleConfig.social_auth_google_client_id, 
      googleConfig.social_auth_google_client_secret, 
      callbackRedirectUri
    );

    // Exchange code for tokens
    const { tokens } = await dynamicOAuth2Client.getToken(code);
    dynamicOAuth2Client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await dynamicOAuth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: googleConfig.social_auth_google_client_id,
    });
    const payload = ticket.getPayload();
    const { email, given_name, family_name, picture } = payload;

    // Redirect to frontend with user data or token
    const frontendUrl = process.env.APP_BASE_URL;
    const redirectUrl = `${frontendUrl}/auth/google/success?email=${encodeURIComponent(email)}&name=${encodeURIComponent(given_name || '')}&picture=${encodeURIComponent(picture || '')}`;

    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.APP_BASE_URL;
    res.redirect(`${frontendUrl}/auth/google/error?message=${encodeURIComponent('Authentication failed')}`);
  }
}

async function updatePhone(req, res) {
  try {

    const user_id = req.user.id;

    const { dial_code, phone } = req.body;

    // update user phone
    await pool.execute(
      "UPDATE res_users SET phone = ? , dial_code = ? , is_mobile_verified = 1 WHERE user_id = ?",
      [phone, dial_code, user_id]
    );

    return res.status(200).json({
      message: "Phone updated successfully",
      status: "success"
    });

  } catch (error) {
    console.error("Error updating user profile:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updatePhoneWithToken(req, res) {
  try {
    const { tempToken, dial_code, phone } = req.body;

    if (!tempToken || !phone) {
      return res.status(400).json({ 
        message: "Temporary token and phone number are required.", 
        status: "error" 
      });
    }

    // Verify the temporary token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, secretKey);
      
      // Check if it's a temporary token for phone update
      if (!decoded.temp || decoded.purpose !== 'phone_update') {
        return res.status(401).json({ 
          message: "Invalid temporary token.", 
          status: "error" 
        });
      }
    } catch (jwtError) {
      return res.status(401).json({ 
        message: "Temporary token is invalid or expired.", 
        status: "error" 
      });
    }

    // Check if phone number already exists for another user
    const [existingPhone] = await pool.execute(
      "SELECT * FROM res_users WHERE phone = ? AND user_id != ?",
      [phone, decoded.id]
    );

    if (existingPhone.length > 0) {
      return res.status(409).json({
        message: "Phone number already registered with another account.",
        status: "error"
      });
    }

    // Update user's phone number
    await pool.execute(
      "UPDATE res_users SET phone = ?, dial_code = ?, is_mobile_verified = 1 WHERE user_id = ?",
      [phone, dial_code, decoded.id]
    );

    // Generate a proper login token
    const loginToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      secretKey,
      { expiresIn: "1d" }
    );

    // Get updated user data
    const [userData] = await pool.execute(
      "SELECT * FROM res_users WHERE user_id = ?",
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        message: "User not found.", 
        status: "error" 
      });
    }

    const user = userData[0];
    const hasActivePackage = await checkUserPackage(user.user_id);

    return res.status(200).json({
      message: "Phone number updated successfully. You are now logged in.",
      status: "success",
      isMobileVerified: user.is_mobile_verified,
      user: {
        id: user.user_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        balance: user.balance,
        avatar: user.avatar,
        photo: user.photo,
        email: user.email,
        phone: user.phone,
        dial_code: user.dial_code,
        token: loginToken,
        hasActivePackage,
      },
    });

  } catch (error) {
    console.error("Error updating phone with token:", error);
    return res.status(500).json({ 
      message: "Internal Server Error", 
      status: "error" 
    });
  }
}

async function facebookSocialLogin(req, res) {
  try {
    const { facebookAccessToken } = req.body;

    let facebookUser = null;

    if (facebookAccessToken) {
      // Step 1: Verify Facebook token and get user info with additional fields
      const response = await axios.get(
        `https://graph.facebook.com/me?access_token=${facebookAccessToken}&fields=id,name,email,picture`
      );

      facebookUser = response.data;
      if (!facebookUser || !facebookUser.email) {
        return res
          .status(400)
          .json({ message: "Invalid Facebook token or missing email" });
      }
    }

    // Decide email source based on social login type
    const userEmail = facebookUser.email;

    // Step 2: Check if the user already exists in the database
    const [rows] = await pool.execute(
      "SELECT * FROM res_users WHERE email = ?",
      [userEmail]
    );

    if (rows.length > 0) {
      // Existing user found
      const existingUser = rows[0];
      const token = jwt.sign(
        { id: existingUser.user_id, username: existingUser.username },
        secretKey,
        { expiresIn: "1d" }
      );

      // Check if user has a valid package
      const [validPackage] = await pool.execute(
        "SELECT * FROM res_upackages WHERE user_id = ? AND date_expire > NOW() LIMIT 1",
        [existingUser.user_id]
      );

      return res.status(200).json({
        message: "Login successful",
        user: {
          id: existingUser.user_id,
          username: existingUser.username,
          email: existingUser.email,
          token: token,
          name: existingUser.fullName,
          phone: existingUser.phone,
          photo: existingUser.photo,
          balance: existingUser.balance,
          is_verified: existingUser.is_verified,
          hasActivePackage: validPackage.length > 0,
        },
      });
    } else {
      // New user - generate random password and hash it
      const randomPassword = (await randomBytesAsync(8)).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const username = userEmail;
      const fullName = facebookUser.name;
      const photo = facebookUser.picture?.data?.url || null;
      const access_token = facebookAccessToken;
      const provider = "facebook";

      // Insert new user into the database
      const [data] = await pool.execute(
        "INSERT INTO res_users (username, password, email, fullName, photo, access_token, provider ) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          username,
          hashedPassword,
          userEmail,
          fullName,
          photo,
          access_token,
          provider,
        ]
      );

      const insertedUserID = data.insertId;

      // Get the newly created user for notification
      const [newUser] = await pool.execute(
        "SELECT * FROM res_users WHERE user_id = ?",
        [insertedUserID]
      );

      // Create admin notification for new user signup via Facebook
      if (newUser.length > 0) {
        setImmediate(() => {
          NotificationService.createUserSignupNotification(newUser[0]).catch(notificationError => {
            console.error("Error creating admin notification for Facebook signup:", notificationError);
          });
        });
      }

      // Check if the user has a valid package
      const [validPackage] = await pool.execute(
        "SELECT * FROM res_upackages WHERE user_id = ? AND date_expire > NOW() LIMIT 1",
        [insertedUserID]
      );

      const token = jwt.sign(
        { id: insertedUserID, username: username },
        secretKey,
        { expiresIn: "1h" }
      );

      // Respond with new user info including token
      return res.status(200).json({
        message: "Login successful",
        user: {
          id: insertedUserID,
          username: username,
          email: userEmail,
          token: token,
          name: fullName,
          phone: req.body.phone || null,
          photo: photo,
          balance: 0,
          is_verified: false,
          hasActivePackage: validPackage.length > 0,
        },
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal server error.",
    });
  }
}

async function resendVerificationEmail(req, res) {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ message: "Please provide your username." });
  }

  try {
    // Check if user exists and get email verification setting
    const [users, emailVerificationSetting] = await Promise.all([
      pool.execute(
        "SELECT * FROM res_users WHERE username = ? or email = ? LIMIT 1",
        [username, username]
      ),
      pool.execute("SELECT option_value FROM res_options WHERE option_name = 'email_verification_enabled'")
    ]);

    if (users[0].length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0][0];

    // Check if email verification is enabled (default to true if setting doesn't exist)
    const isEmailVerificationEnabled = emailVerificationSetting[0].length > 0 
      ? parseInt(emailVerificationSetting[0][0].option_value) === 1 
      : true;

    // If email verification is disabled, return error
    if (!isEmailVerificationEnabled) {
      return res.status(400).json({ 
        message: "Email verification is currently disabled. Please contact support if you need assistance.",
        emailVerificationDisabled: true
      });
    }

    // Check if user is already verified
    if (user.is_email_verified === 1) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate new verification token
    const token = jwt.sign(
      { id: user.user_id, username: user.username },
      secretKey,
      { expiresIn: "1h" }
    );

    // Update verification token in database
    await pool.execute(
      "UPDATE res_users SET verification_token = ? WHERE user_id = ?",
      [token, user.user_id]
    );

    // Send verification email
    const verificationLink = `${process.env.APP_BASE_URL}/auth/verify-email?token=${token}`;
    const emailResult = await sendEmail(user.email, "Verify Your Email", "email-verification", {
      username: user.username,
      verificationLink: verificationLink
    });

    // Log email result and provide appropriate user feedback
    if (!emailResult.success) {
      await ErrorLogger.logEmailError(
        new Error(emailResult.error), 
        user.email, 
        user.user_id, 
        req
      );
      
      return res.status(200).json({
        message: "We couldn't send the verification email. Please try again or contact support.",
        emailSent: false,
        errorCode: "EMAIL_SEND_FAILED"
      });
    }

    return res.status(200).json({
      message: "Verification email has been resent. Please check your inbox.",
      emailSent: true
    });
  } catch (error) {
    console.error("Error resending verification email:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Refresh token function
async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: "Refresh token is required",
        message: "Please provide a refresh token",
        status: "error"
      });
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    
    // Generate new access token
    const newToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Token refreshed successfully",
      status: "success",
      token: newToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: "Refresh token expired",
        message: "Please login again",
        status: "error"
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: "Invalid refresh token",
        message: "Please login again",
        status: "error"
      });
    }

    console.error("Error refreshing token:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to refresh token",
      status: "error"
    });
  }
}

// Helper function to generate Google OAuth authorization URL
async function getGoogleAuthUrl(req, res) {
  try {
    // Get Google OAuth configuration from database
    const googleConfig = await getGoogleOAuthConfig();

    // Check if Google OAuth is enabled
    if (googleConfig.social_auth_google_enabled !== "1") {
      return res.status(400).json({ message: "Google OAuth is not enabled", status: "error" });
    }

    // Validate OAuth configuration
    if (!googleConfig.social_auth_google_client_id || !googleConfig.social_auth_google_client_secret) {
      console.error("Google OAuth credentials not configured in database");
      return res.status(500).json({ message: "OAuth configuration error", status: "error" });
    }

    // Auto-generate redirect URI
    const redirectUri = process.env.APP_BASE_URL + "/auth/callback/google";

    // Create OAuth client
    const oAuth2Client = new OAuth2Client(googleConfig.social_auth_google_client_id, googleConfig.social_auth_google_client_secret, redirectUri);

    // Generate the authorization URL
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'consent'
    });

    return res.status(200).json({
      status: "success",
      authUrl: authUrl,
      redirectUri: redirectUri,
      clientId: googleConfig.social_auth_google_client_id,
      message: "Google OAuth authorization URL generated successfully"
    });

  } catch (error) {
    console.error("Error generating Google auth URL:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to generate Google OAuth URL",
      error: error.message
    });
  }
}

module.exports = {
  getUserProfile,
  signup,
  login,
  verifyOtp,
  resendOtp,
  googleSocialLogin,
  getGoogleAuthUrl,
  googleOAuthCallback,
  forgotPassword,
  resetPassword,
  facebookSocialLogin,
  checkEmailOrUsername,
  checkoutLogin,
  updatePhone,
  verifyEmail,
  resendVerificationEmail,
  updatePhoneWithToken,
  refreshToken,
};