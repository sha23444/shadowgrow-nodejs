const { pool } = require("../../config/database");
const { ErrorLogger } = require("../../logger");
const NotificationService = require("../../services/notificationService");
const { notifyRequestFile } = require("../admin/telegram");

// Create a new file request
async function createRequestFile(req, res) {
  try {
    const {
      fullName,
      email,
      fileType,
      priority,
      purpose,
      additionalInfo = null,
      user_id = null, // Optional, if user is logged in
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !fileType || !priority || !purpose) {
      return res.status(400).json({
        message: "Missing required fields.",
        status: "error",
      });
    }

    const query = `
      INSERT INTO res_file_requests 
        (name, email, file_type, priority, purpose, additional_info, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [insertResult] = await pool.query(query, [
      fullName.trim(),
      email,
      fileType,
      priority,
      purpose,
      additionalInfo,
      user_id,
    ]);

    // send notification to admin
    setImmediate(() => {
      NotificationService.createNotification(
        "file_request_created",
        "File Request Created",
        `File request has been created by user ${user_id}`,
        { file_request_id: insertResult.insertId }
      ).catch(error => {
        console.error('Error creating file request notification:', error);
      });
    });

    // Send Telegram notification to subscribed bots (non-blocking)
    const userId = req.user?.id || user_id || null;
    setImmediate(() => {
      notifyRequestFile({
        fullName,
        name: fullName,
        email,
        fileType,
        priority,
        purpose,
        additionalInfo,
        user_id: userId
      }).catch(telegramError => {
        console.error('Error sending Telegram notification for file request:', telegramError);
      });
    });

    return res.status(201).json({
      message: "File request submitted successfully.",
      status: "success",
    });
  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'file_request',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      userId: req.body.user_id,
      endpoint: '/createRequestFile'
    });
    return res.status(500).json({
      message: "Internal server error.",
      status: "error",
    });
  }
}

module.exports = {
  createRequestFile,
};
