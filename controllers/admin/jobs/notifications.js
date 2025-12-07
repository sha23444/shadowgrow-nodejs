const { pool } = require("../../../config/database");

// Add a new notification (unused but included as requested)
async function addNotification(req, res) {
  const { message, is_read = false } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Notification message is required." });
  }

  try {
    await pool.execute(
      `INSERT INTO res_job_notifications (message, is_read) VALUES (?, ?)`,
      [message, is_read]
    );
    res.status(201).json({ message: "Notification added successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all notifications
async function getNotifications(req, res) {
  try {
    const [notifications] = await pool.execute(
      `SELECT notification_id, message, is_read, created_at FROM res_job_notifications`
    );
    res.status(200).json(notifications);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update notification status
async function updateNotificationStatus(req, res) {
  const { notification_id, is_read } = req.body;

  if (!notification_id || typeof is_read !== "boolean") {
    return res.status(400).json({ error: "Notification ID and is_read status are required." });
  }

  try {
    await pool.execute(
      `UPDATE res_job_notifications SET is_read = ? WHERE notification_id = ?`,
      [is_read, notification_id]
    );
    res.status(200).json({ message: "Notification status updated successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Delete a notification
async function deleteNotification(req, res) {
  const { notification_id } = req.body;

  if (!notification_id) {
    return res.status(400).json({ error: "Notification ID is required." });
  }

  try {
    await pool.execute(`DELETE FROM res_job_notifications WHERE notification_id = ?`, [notification_id]);
    res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addNotification,
  getNotifications,
  updateNotificationStatus,
  deleteNotification,
};
