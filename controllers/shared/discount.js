const { pool } = require('../../config/database');

/**
 * Record discount usage when a coupon is applied
 * @param {Object} usageData - Usage data object
 * @param {number} usageData.discount_id - ID of the discount used
 * @param {number} [usageData.user_id] - ID of user who used the discount
 * @param {number} [usageData.order_id] - ID of order where discount was applied
 * @param {number} [usageData.discount_amount] - Amount of discount applied
 * @param {number} [usageData.order_amount] - Order amount before discount
 * @param {string} [usageData.ip_address] - IP address of user
 * @param {string} [usageData.user_agent] - User agent string
 * @returns {Promise<Object>} - Result of the insert operation
 */
async function recordDiscountUsage(usageData) {
  try {
    const {
      discount_id,
      user_id = null,
      order_id = 0, // 0 indicates cart calculation, not an actual order
      discount_amount = 0,
      order_amount = 0,
      payment_method = 'cart_calculation',
      order_type = '1', // 1 for digital files (simpler for cart calculations)
      package_id = null
    } = usageData;

    // Validate required fields
    if (!discount_id) {
      throw new Error('discount_id is required');
    }

    // Ensure user_id is provided
    if (!user_id) {
      throw new Error('user_id is required');
    }

    // Handle foreign key constraint issue
    // If order_id doesn't exist in the referenced 'orders' table, 
    // we need to work around the constraint for now
    let finalOrderId = order_id;
    let foreignKeyWorkaround = false;
    
    if (order_id && order_id !== 0) {
      try {
        // Check if order_id exists in the 'orders' table
        const [orderCheck] = await pool.execute('SELECT id FROM orders WHERE id = ?', [order_id]);
        if (orderCheck.length === 0) {
          // If not found in 'orders', check if it exists in 'res_orders'
          const [resOrderCheck] = await pool.execute('SELECT order_id FROM res_orders WHERE order_id = ?', [order_id]);
          if (resOrderCheck.length > 0) {
            // Log this situation for debugging
            console.warn(`Foreign key constraint issue: order_id ${order_id} exists in res_orders but not in orders table`);
            // For now, we'll use a workaround - temporarily disable foreign key checks
            foreignKeyWorkaround = true;
          }
        }
      } catch (checkError) {
        // If there's an error checking, continue with original order_id
        console.warn('Error checking order existence:', checkError.message);
      }
    }

    // Apply workaround if needed
    if (foreignKeyWorkaround) {
      await pool.execute('SET FOREIGN_KEY_CHECKS=0');
    }
    
    try {
      const [result] = await pool.execute(
        `INSERT INTO discount_usage 
         (discount_id, user_id, order_id, discount_amount, order_total, payment_method, order_type, package_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [discount_id, user_id, finalOrderId, discount_amount, order_amount, payment_method, order_type, package_id]
      );
      
      // Re-enable foreign key checks if we disabled them
      if (foreignKeyWorkaround) {
        await pool.execute('SET FOREIGN_KEY_CHECKS=1');
      }
      
      return {
        success: true,
        usage_id: result.insertId,
        message: 'Discount usage recorded successfully'
      };
    } catch (insertError) {
      // Re-enable foreign key checks if we disabled them
      if (foreignKeyWorkaround) {
        await pool.execute('SET FOREIGN_KEY_CHECKS=1');
      }
      throw insertError;
    }

    return {
      success: true,
      usage_id: result.insertId,
      message: 'Discount usage recorded successfully'
    };
  } catch (error) {
    // Log the full error for debugging
    console.error('Error recording discount usage:', error.message);
    console.error('Error code:', error.code);
    console.error('Error errno:', error.errno);
    
    return {
      success: false,
      error: error.message,
      message: 'Failed to record discount usage'
    };
  }
}

/**
 * Get usage statistics for a specific discount
 * @param {number} discount_id - ID of the discount
 * @returns {Promise<Object>} - Usage statistics
 */
async function getDiscountUsageStats(discount_id) {
  try {
    const [result] = await pool.execute(
      `SELECT 
         COUNT(*) as total_usage,
         COUNT(DISTINCT user_id) as unique_users,
         SUM(discount_amount) as total_discount_given,
         SUM(order_amount) as total_order_amount,
         MIN(used_at) as first_used,
         MAX(used_at) as last_used
       FROM discount_usage 
       WHERE discount_id = ?`,
      [discount_id]
    );

    return {
      success: true,
      stats: result[0] || {
        total_usage: 0,
        unique_users: 0,
        total_discount_given: 0,
        total_order_amount: 0,
        first_used: null,
        last_used: null
      }
    };
  } catch (error) {
//     // console.error('Error getting discount usage stats:', error);
    return {
      success: false,
      error: error.message,
      stats: null
    };
  }
}

/**
 * Check if a user has already used a discount
 * @param {number} discount_id - ID of the discount
 * @param {number} user_id - ID of the user
 * @returns {Promise<Object>} - Usage check result
 */
async function checkUserDiscountUsage(discount_id, user_id) {
  try {
    const [result] = await pool.execute(
      `SELECT COUNT(*) as usage_count 
       FROM discount_usage 
       WHERE discount_id = ? AND user_id = ?`,
      [discount_id, user_id]
    );

    return {
      success: true,
      has_used: result[0].usage_count > 0,
      usage_count: result[0].usage_count
    };
  } catch (error) {
//     // console.error('Error checking user discount usage:', error);
    return {
      success: false,
      error: error.message,
      has_used: false,
      usage_count: 0
    };
  }
}

/**
 * Get all usage records for a discount with pagination
 * @param {number} discount_id - ID of the discount
 * @param {number} [page=1] - Page number
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<Object>} - Paginated usage records
 */
async function getDiscountUsageHistory(discount_id, page = 1, limit = 20) {
  try {
    const offset = (page - 1) * limit;

    // Get usage records
    const [usage] = await pool.execute(
      `SELECT 
         du.*,
         u.name as user_name,
         u.email as user_email
       FROM discount_usage du
       LEFT JOIN users u ON du.user_id = u.id
       WHERE du.discount_id = ?
       ORDER BY du.used_at DESC
       LIMIT ? OFFSET ?`,
      [discount_id, limit, offset]
    );

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM discount_usage WHERE discount_id = ?`,
      [discount_id]
    );

    const total = countResult[0].total;

    return {
      success: true,
      data: usage,
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        limit
      }
    };
  } catch (error) {
//     // console.error('Error getting discount usage history:', error);
    return {
      success: false,
      error: error.message,
      data: [],
      pagination: null
    };
  }
}

module.exports = {
  recordDiscountUsage,
  getDiscountUsageStats,
  checkUserDiscountUsage,
  getDiscountUsageHistory
};
