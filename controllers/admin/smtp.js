// controllers/smtpController.js
const { pool } = require("../../config/database");

/// Save or update SMTP configuration (assuming only one config exists)
async function saveSmtpConfig(req, res) {
  const connection = await pool.getConnection();
  try {
    const {
      host,
      port,
      username,
      password,
      encryption,
      senderName,
      senderEmail,
    } = req.body;

    // Basic validation
    if (!host || !port || !username || !password || !senderEmail) {
      return res.status(400).json({
        message: "Host, port, username, password, and senderEmail are required.",
        status: "error",
      });
    }

    await connection.beginTransaction();

    // Check if an SMTP config already exists
    const [[existing]] = await connection.query(
      "SELECT id FROM res_smtp_config LIMIT 1"
    );

    if (existing) {
      // Update existing config
      await connection.query(
        `UPDATE res_smtp_config SET host=?, port=?, username=?, password=?, encryption=?, sender_name=?, sender_email=? WHERE id=?`,
        [
          host,
          port,
          username,
          password,
          encryption,
          senderName,
          senderEmail,
          existing.id,
        ]
      );
    } else {
      // Insert new config
      await connection.query(
        `INSERT INTO res_smtp_config (host, port, username, password, encryption, sender_name, sender_email) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          host,
          port,
          username,
          password,
          encryption,
          senderName,
          senderEmail,
        ]
      );
    }

    await connection.commit();

    res.status(200).json({
      message: "SMTP configuration saved successfully.",
      status: "success",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error saving SMTP config:", err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  } finally {
    connection.release();
  }
}

async function getSmtpConfig(req, res) {
    const connection = await pool.getConnection();
    try {
        const [[smtpConfig]] = await connection.query(
        "SELECT * FROM res_smtp_config LIMIT 1"
        );
    
        if (!smtpConfig) {
        return res.status(404).json({
            message: "SMTP configuration not found.",
            status: "error",
        });
        }
    
        res.status(200).json({
        message: "SMTP configuration fetched successfully.",
        status: "success",
        data: smtpConfig,
        });
    } catch (err) {
        console.error("Error fetching SMTP config:", err);
        res.status(500).json({
        message: "Internal server error",
        status: "error",
        });
    } finally {
        connection.release();
    }
    }


module.exports = {
  saveSmtpConfig,
    getSmtpConfig,
};
