const NotificationService = require("../../services/notificationService");
const { NOTIFICATION_TYPES } = require("../utils/constants");

/**
 * Get all notifications with pagination and filtering
 */
async function getNotifications(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type || null;
    const isRead = req.query.is_read !== undefined ? req.query.is_read === 'true' : null;
    const isImportant = req.query.is_important !== undefined ? req.query.is_important === 'true' : null;
    const search = req.query.search || null;
    const includeStats = req.query.include_stats !== undefined ? req.query.include_stats === 'true' : true;
    const useFilteredStats = req.query.use_filtered_stats !== undefined ? req.query.use_filtered_stats === 'true' : false;

    // Validate pagination parameters
    if (page < 1) {
      return res.status(400).json({
        status: "error",
        message: "Page number must be greater than 0"
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        status: "error",
        message: "Limit must be between 1 and 100"
      });
    }

    // Validate notification type if provided
    if (type && !Object.keys(NOTIFICATION_TYPES).includes(type)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid notification type. Valid types are: " + Object.keys(NOTIFICATION_TYPES).join(', ')
      });
    }

    // Get notifications
    const result = await NotificationService.getNotifications(page, limit, type, isRead, isImportant, search);

    // Get statistics if requested
    let statistics = null;
    if (includeStats) {
      if (useFilteredStats) {
        // Get statistics that match the current filter criteria
        statistics = await NotificationService.getFilteredNotificationStatistics(type, isRead, isImportant, search);
      } else {
        // Get global statistics
        statistics = await NotificationService.getNotificationStatistics();
      }
    }

    const response = {
      status: "success",
      data: result.notifications,
      pagination: result.pagination
    };

    if (statistics) {
      response.statistics = statistics;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

/**
 * Get recent notifications (for dashboard)
 */
async function getRecentNotifications(req, res) {
  try {
    const notifications = await NotificationService.getRecentNotifications();

    return res.status(200).json({
      status: "success",
      data: notifications
    });
  } catch (error) {
    console.error("Error fetching recent notifications:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

/**
 * Get unread notification count
 */
async function getUnreadCount(req, res) {
  try {
    const count = await NotificationService.getUnreadCount();

    return res.status(200).json({
      status: "success",
      data: { unreadCount: count }
    });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

/**
 * Mark a notification as read
 */
async function markAsRead(req, res) {
  try {
    const { notification_id } = req.params;
    const adminUsername = req.user?.username || 'admin'; // Get from auth middleware

    if (!notification_id) {
      return res.status(400).json({
        status: "error",
        message: "Notification ID is required"
      });
    }

    await NotificationService.markAsRead(parseInt(notification_id), adminUsername);

    return res.status(200).json({
      status: "success",
      message: "Notification marked as read"
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead(req, res) {
  try {
    const adminUsername = req.user?.username || 'admin'; // Get from auth middleware

    await NotificationService.markAllAsRead(adminUsername);

    return res.status(200).json({
      status: "success",
      message: "All notifications marked as read"
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

/**
 * Delete a notification
 */
async function deleteNotification(req, res) {
  try {
    const { notification_id } = req.params;

    if (!notification_id) {
      return res.status(400).json({
        status: "error",
        message: "Notification ID is required"
      });
    }

    await NotificationService.deleteNotification(parseInt(notification_id));

    return res.status(200).json({
      status: "success",
      message: "Notification deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

/**
 * Create a custom notification (for admin use)
 */
async function createNotification(req, res) {
  try {
    const { type, title, message, data, is_important } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({
        status: "error",
        message: "Type, title, and message are required"
      });
    }

    const notificationId = await NotificationService.createNotification(
      type,
      title,
      message,
      data,
      is_important || false
    );

    return res.status(201).json({
      status: "success",
      message: "Notification created successfully",
      data: { notification_id: notificationId }
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

/**
 * Get notification statistics
 */
async function getNotificationStats(req, res) {
  try {
    const unreadCount = await NotificationService.getUnreadCount();
    
    // Get count by type
    const { pool } = require("../../config/database");
    const [typeStats] = await pool.execute(`
      SELECT 
        type,
        COUNT(*) as count,
        SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) as unread_count
      FROM res_admin_notifications 
      GROUP BY type
      ORDER BY count DESC
    `);

    // Get today's notifications
    const [todayStats] = await pool.execute(`
      SELECT COUNT(*) as today_count
      FROM res_admin_notifications 
      WHERE DATE(created_at) = CURDATE()
    `);

    return res.status(200).json({
      status: "success",
      data: {
        totalUnread: unreadCount,
        todayCount: todayStats[0].today_count,
        byType: typeStats
      }
    });
  } catch (error) {
    console.error("Error fetching notification stats:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

module.exports = {
  getNotifications,
  getRecentNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
  getNotificationStats
}; 