const express = require("express");
const router = express.Router();
const notificationsController = require("../../controllers/admin/notifications");

/**
 * GET /admin/notifications
 * Get all notifications with pagination and filtering
 * 
 * Query Parameters:
 * - page (optional): Page number (default: 1)
 * - limit (optional): Items per page (default: 20, max: 100)
 * - type (optional): Filter by notification type (user_signup, order_placed, payment_received, download_complete, file_request, system_alert)
 * - is_read (optional): Filter by read status (true/false)
 * - is_important (optional): Filter by importance (true/false)
 * - search (optional): Search term for title and message content
 * - include_stats (optional): Include statistics in response (true/false, default: true)
 * - use_filtered_stats (optional): Use filtered statistics instead of global (true/false, default: false)
 * 
 * Response includes:
 * - data: Array of notifications
 * - pagination: Pagination information
 * - statistics: Notification statistics (if include_stats=true)
 *   - total: Total notification count
 *   - unread: { count, percentage }
 *   - read: { count, percentage }
 *   - important: { count }
 */
router.get("/", notificationsController.getNotifications);

// Get recent notifications (for dashboard)
router.get("/recent", notificationsController.getRecentNotifications);

// Get unread notification count
router.get("/unread-count", notificationsController.getUnreadCount);

// Get notification statistics
router.get("/stats", notificationsController.getNotificationStats);

// Mark a notification as read
router.patch("/:notification_id/read", notificationsController.markAsRead);

// Mark all notifications as read
router.patch("/mark-all-read", notificationsController.markAllAsRead);

// Delete a notification
router.delete("/:notification_id", notificationsController.deleteNotification);

// Create a custom notification (for admin use)
router.post("/", notificationsController.createNotification);

module.exports = router; 