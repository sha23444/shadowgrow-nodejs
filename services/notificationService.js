const { pool } = require("../config/database");

class NotificationService {
  /**
   * Create a new admin notification
   * @param {string} type - Type of notification (user_signup, order_placed, etc.)
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {object} data - Additional data (optional)
   * @param {boolean} isImportant - Whether this is an important notification
   */
  static async createNotification(type, title, message, data = null, isImportant = false) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO res_admin_notifications (type, title, message, data, is_important) 
         VALUES (?, ?, ?, ?, ?)`,
        [type, title, message, data ? JSON.stringify(data) : null, isImportant]
      );
      
      return result.insertId;
    } catch (error) {
//       // console.error('❌ Error creating admin notification:', error);
      throw error;
    }
  }

  /**
   * Create a user signup notification
   * @param {object} user - User object with user details
   */
  static async createUserSignupNotification(user) {
    const title = "New User Registration";
    const message = `A new user has signed up: ${user.first_name || 'N/A'} ${user.last_name || ''} (${user.username})`;
    
    const data = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      dial_code: user.dial_code,
      register_type: user.register_type || 'email',
      created_at: user.created_at
    };

    return await this.createNotification('user_signup', title, message, data, false);
  }

  /**
   * Create an order notification
   * @param {object} order - Order object with order details
   */
  static async createOrderNotification(order) {
    const title = "New Order Placed";
    const message = `New order #${order.order_id} placed by ${order.username || 'User'}`;
    
    const data = {
      order_id: order.order_id,
      user_id: order.user_id,
      username: order.username,
      email: order.email,
      total_amount: order.total_amount,
      currency: order.currency,
      order_status: order.order_status
    };

    return await this.createNotification('order_placed', title, message, data, true);
  }

  /**
   * Create a payment notification
   * @param {object} payment - Payment object with payment details
   */
  static async createPaymentNotification(payment) {
    const title = "Payment Received";
    const message = `Payment of ${payment.amount} ${payment.currency} received for order #${payment.order_id}`;
    
    const data = {
      payment_id: payment.payment_id,
      order_id: payment.order_id,
      user_id: payment.user_id,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      payment_status: payment.payment_status
    };

    return await this.createNotification('payment_received', title, message, data, true);
  }

  /**
   * Get all notifications with pagination
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @param {string} type - Filter by type (optional)
   * @param {boolean} isRead - Filter by read status (optional)
   * @param {boolean} isImportant - Filter by importance (optional)
   * @param {string} search - Search term for title and message (optional)
   */
  static async getNotifications(page = 1, limit = 20, type = null, isRead = null, isImportant = null, search = null) {
    try {
      const offset = (page - 1) * limit;
      let whereClauses = [];
      let queryParams = [];

      if (type) {
        whereClauses.push('type = ?');
        queryParams.push(type);
      }
      if (isRead !== null) {
        whereClauses.push('is_read = ?');
        queryParams.push(isRead);
      }
      if (isImportant !== null) {
        whereClauses.push('is_important = ?');
        queryParams.push(isImportant);
      }
      if (search) {
        whereClauses.push('(title LIKE ? OR message LIKE ?)');
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm);
      }
      const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
      // Count query
      const countQuery = `SELECT COUNT(*) as total FROM res_admin_notifications ${whereSQL}`;
      let total = 0;
      try {
        const [[totalRow]] = await pool.execute(countQuery, queryParams);
        total = typeof totalRow === 'object' && totalRow?.total !== undefined ? totalRow.total : 0;
      } catch {
        total = 0;
      }
      // Notifications query
      const notificationsQuery = `
        SELECT 
          notification_id,
          type,
          title,
          message,
          data,
          is_read,
          is_important,
          created_at,
          read_at,
          read_by
        FROM res_admin_notifications 
        ${whereSQL}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      let notifications = [];
      try {
        const [rows] = await pool.execute(notificationsQuery, [...queryParams, limit, offset]);
        notifications = Array.isArray(rows) ? rows : [];
      } catch {
        notifications = [];
      }
      const parsedNotifications = notifications.map(notification => ({
        ...notification,
        data: notification.data ? JSON.parse(notification.data) : null
      }));
      return {
        notifications: parsedNotifications,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / (limit || 1))
        }
      };
    } catch (error) {
      throw error;
    }
}

  /**
   * Mark notification as read
   * @param {number} notificationId - Notification ID
   * @param {string} adminUsername - Admin username who read it
   */
  static async markAsRead(notificationId, adminUsername) {
    try {
      await pool.execute(
        `UPDATE res_admin_notifications 
         SET is_read = TRUE, read_at = NOW(), read_by = ? 
         WHERE notification_id = ?`,
        [adminUsername, notificationId]
      );
      
      return true;
    } catch (error) {
//       // console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   * @param {string} adminUsername - Admin username who read them
   */
  static async markAllAsRead(adminUsername) {
    try {
      await pool.execute(
        `UPDATE res_admin_notifications 
         SET is_read = TRUE, read_at = NOW(), read_by = ? 
         WHERE is_read = FALSE`,
        [adminUsername]
      );
      
      return true;
    } catch (error) {
//       // console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete a notification
   * @param {number} notificationId - Notification ID
   */
  static async deleteNotification(notificationId) {
    try {
      await pool.execute(
        'DELETE FROM res_admin_notifications WHERE notification_id = ?',
        [notificationId]
      );
      
      return true;
    } catch (error) {
//       // console.error('❌ Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount() {
    try {
      const [[{ count }]] = await pool.execute(
        'SELECT COUNT(*) as count FROM res_admin_notifications WHERE is_read = FALSE'
      );
      return count;
    } catch (error) {
//       // console.error('❌ Error getting unread count:', error);
      throw error;
    }
  }

  /**
   * Get recent notifications (last 5)
   */
  static async getRecentNotifications() {
    try {
      const [notifications] = await pool.execute(
        `SELECT 
          notification_id,
          type,
          title,
          message,
          data,
          is_read,
          is_important,
          created_at
        FROM res_admin_notifications 
        ORDER BY created_at DESC 
        LIMIT 5`
      );

      return notifications.map(notification => ({
        ...notification,
        data: notification.data ? JSON.parse(notification.data) : null
      }));
    } catch (error) {
//       // console.error('❌ Error getting recent notifications:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive notification statistics
   */
  static async getNotificationStatistics() {
    try {
      // Get total count
      const [[{ totalCount }]] = await pool.execute(
        'SELECT COUNT(*) as totalCount FROM res_admin_notifications'
      );

      // Get unread count
      const [[{ unreadCount }]] = await pool.execute(
        'SELECT COUNT(*) as unreadCount FROM res_admin_notifications WHERE is_read = FALSE'
      );

      // Get read count
      const [[{ readCount }]] = await pool.execute(
        'SELECT COUNT(*) as readCount FROM res_admin_notifications WHERE is_read = TRUE'
      );

      // Get important count
      const [[{ importantCount }]] = await pool.execute(
        'SELECT COUNT(*) as importantCount FROM res_admin_notifications WHERE is_important = TRUE'
      );

      // Calculate percentages
      const unreadPercentage = totalCount > 0 ? Math.round((unreadCount / totalCount) * 100) : 0;
      const readPercentage = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

      return {
        total: totalCount,
        unread: {
          count: unreadCount,
          percentage: unreadPercentage
        },
        read: {
          count: readCount,
          percentage: readPercentage
        },
        important: {
          count: importantCount
        }
      };
    } catch (error) {
//       // console.error('❌ Error getting notification statistics:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics with filters applied
   * @param {string} type - Filter by type (optional)
   * @param {boolean} isRead - Filter by read status (optional)
   * @param {boolean} isImportant - Filter by importance (optional)
   * @param {string} search - Search term (optional)
   */
  static async getFilteredNotificationStatistics(type = null, isRead = null, isImportant = null, search = null) {
    try {
      let whereClauses = [];
      let queryParams = [];

      if (type) {
        whereClauses.push('type = ?');
        queryParams.push(type);
      }

      if (isRead !== null) {
        whereClauses.push('is_read = ?');
        queryParams.push(isRead);
      }

      if (isImportant !== null) {
        whereClauses.push('is_important = ?');
        queryParams.push(isImportant);
      }

      if (search) {
        whereClauses.push('(title LIKE ? OR message LIKE ?)');
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm);
      }

      const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

      // Get filtered total count
      const countQuery = `SELECT COUNT(*) as totalCount FROM res_admin_notifications ${whereSQL}`;
      const [[{ totalCount }]] = await pool.execute(countQuery, queryParams);

      // Get filtered unread count
      const unreadWhereSQL = whereClauses.length > 0 ? 
        'WHERE ' + whereClauses.join(' AND ') + ' AND is_read = FALSE' : 
        'WHERE is_read = FALSE';
      const unreadQuery = `SELECT COUNT(*) as unreadCount FROM res_admin_notifications ${unreadWhereSQL}`;
      const [[{ unreadCount }]] = await pool.execute(unreadQuery, queryParams);

      // Get filtered read count
      const readWhereSQL = whereClauses.length > 0 ? 
        'WHERE ' + whereClauses.join(' AND ') + ' AND is_read = TRUE' : 
        'WHERE is_read = TRUE';
      const readQuery = `SELECT COUNT(*) as readCount FROM res_admin_notifications ${readWhereSQL}`;
      const [[{ readCount }]] = await pool.execute(readQuery, queryParams);

      // Get filtered important count
      const importantWhereSQL = whereClauses.length > 0 ? 
        'WHERE ' + whereClauses.join(' AND ') + ' AND is_important = TRUE' : 
        'WHERE is_important = TRUE';
      const importantQuery = `SELECT COUNT(*) as importantCount FROM res_admin_notifications ${importantWhereSQL}`;
      const [[{ importantCount }]] = await pool.execute(importantQuery, queryParams);

      // Calculate percentages
      const unreadPercentage = totalCount > 0 ? Math.round((unreadCount / totalCount) * 100) : 0;
      const readPercentage = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

      return {
        total: totalCount,
        unread: {
          count: unreadCount,
          percentage: unreadPercentage
        },
        read: {
          count: readCount,
          percentage: readPercentage
        },
        important: {
          count: importantCount
        }
      };
    } catch (error) {
//       // console.error('❌ Error getting filtered notification statistics:', error);
      throw error;
    }
  }
}

module.exports = NotificationService; 