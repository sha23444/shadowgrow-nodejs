const twilio = require("twilio");
const UserController = require('../admin/users');
const { pool, secretKey } = require("../../config/database");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");


// Twilio credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID || "YOUR_TWILIO_ACCOUNT_SID_HERE";
const authToken = process.env.TWILIO_AUTH_TOKEN || "YOUR_TWILIO_AUTH_TOKEN_HERE";
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || "+14155238886";

const client = new twilio(accountSid, authToken);


// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

async function sendOTP(req, res) {
    try {
      const { phone_number } = req.body;
  
      if (!phone_number) {
        return res.status(400).json({ error: "Phone number is required" });
      }
  
      const otp = generateOTP();
  
      const [existingUser] = await pool.execute(
        "SELECT * FROM users WHERE phoneNumber = ?",
        [phone_number]
      );
  
      if (existingUser.length === 0) {
        await pool.execute(
          "INSERT INTO users (phoneNumber, otp) VALUES (?, ?)",
          [phone_number, otp]
        );
      } else {
        await pool.execute(
          "UPDATE users SET otp = ? WHERE phoneNumber = ?",
          [otp, phone_number]
        );
      }
  
      // Compose the message
      const messageBody = `Your OTP for verification is: ${otp}`;
  
      // Send the message via WhatsApp
      const message = await client.messages.create({
//         body: messageBody,
//         from: `whatsapp:${twilioPhoneNumber}`,
//         to: `whatsapp:${phone_number}`,
      });
  
    
      const data = {
        status : "success",
        message :  'Verification code sent to your whatsapp.' 
      }
  
      res.status(200).json(data);
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  

  async function verifyOTP(req, res) {
    try {
      const { phone_number, otp } = req.body;
  
      if (!phone_number || !otp) {
        return res
          .status(400)
          .json({ error: "Phone number and OTP are required" });
      }
  
      const [existingUser] = await pool.execute(
        "SELECT * FROM users WHERE phoneNumber = ?",
        [phone_number]
      );
  
      if (existingUser.length === 0) {
        return res
          .status(400)
          .json({ error: "You have not logged in." });
      }
  
      const storedOTP = existingUser[0].otp;
  
      if (storedOTP && otp == storedOTP) {
        await pool.execute("UPDATE users SET isOTPVerified = 1 WHERE phoneNumber = ?", [phone_number]);

        const user = {
//             id: existingUser[0].id,
//             username: existingUser[0].username,
          };

        const token = jwt.sign(user, secretKey, { expiresIn: "1h" });
  
        const data = {
          status : "success",
//           token: token,
          message :  'OTP verified successfully' 
        }
    
        res.status(200).json(data);
      } else {
        res.status(401).json({ error: "Invalid OTP" });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }


module.exports = { sendOTP, verifyOTP };
