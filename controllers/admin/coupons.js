const { pool } = require("../../config/database");
const { validateCoupon } = require("../../validators/couponValidator");

const SAFE_EXCHANGE_RATE_EXPRESSION = `CASE WHEN ro.exchange_rate IS NULL OR ro.exchange_rate = 0 THEN 1 ELSE ro.exchange_rate END`;

async function getCouponStats() {
  const query = `
    SELECT 
      COUNT(*) as total_coupons,
      SUM(CASE WHEN is_active = 1 AND valid_from <= CURDATE() AND (valid_until >= CURDATE() OR valid_until IS NULL) THEN 1 ELSE 0 END) as active_coupons,
      SUM(CASE WHEN valid_until < CURDATE() THEN 1 ELSE 0 END) as expired_coupons,
      COALESCE(SUM(du.usage_count), 0) as total_usage
    FROM discounts d
    LEFT JOIN (
      SELECT discount_id, COUNT(*) as usage_count 
      FROM discount_usage 
      GROUP BY discount_id
    ) du ON d.id = du.discount_id
    WHERE d.deleted_at IS NULL
  `;

  const [[stats]] = await pool.query(query);
  return stats;
}

async function addCoupon(req, res) {
  try {
    const {
      // Basic Information
      code,
      name,
      description,
      
      // Discount Settings
      type,
      value,
      minimum_amount,
      maximum_discount,
      usage_limit,
      
      // Application Settings
      applies_to,
      package_ids,
      
      // User Targeting
      user_targeting,
      selected_user_ids,
      user_redemption_limit,
      
      // Payment Methods
      payment_method_restriction,
      allowed_payment_methods,
      
      // Validity
      valid_from,
      valid_until,
      
      // Status
      is_active,
      is_public,
      display_order,
      
      // Bulk Generation
      bulk_generate,
      bulk_count
    } = req.body;

    // Validate the coupon data
    const validationError = validateCoupon(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert main coupon record
      const [result] = await connection.execute(
        `INSERT INTO discounts (
          code, name, description, type, value, minimum_amount, maximum_discount,
          usage_limit, applies_to, package_ids, user_targeting, selected_user_ids,
          user_redemption_limit, payment_method_restriction, allowed_payment_methods,
          valid_from, valid_until, is_active, is_public, display_order, is_bulk_generated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code.toUpperCase(),
          name,
          description || null,
          type,
          value,
          minimum_amount || null,
          maximum_discount || null,
          usage_limit || null,
          applies_to,
          applies_to === '2' ? JSON.stringify(package_ids) : null,
          user_targeting,
          user_targeting === 'selected_users' ? JSON.stringify(selected_user_ids) : null,
          user_redemption_limit,
          payment_method_restriction,
          payment_method_restriction === 'selected' ? JSON.stringify(allowed_payment_methods) : null,
          valid_from,
          valid_until,
          is_active,
          is_public,
          display_order || null,
          bulk_generate
        ]
      );

      const couponId = result.insertId;

      // Handle bulk generation
      if (bulk_generate && bulk_count) {
        const bulkCoupons = [];
        const generatedCodes = new Set();
        
        for (let i = 0; i < bulk_count; i++) {
          let bulkCode;
          let attempts = 0;
          const maxAttempts = 100; // Prevent infinite loops
          
          // Generate unique code within this batch
          do {
            const randomPart = Math.random().toString(36).substr(2, 4).toUpperCase();
            bulkCode = `${code}${randomPart}`;
            attempts++;
            
            // If we've tried too many times, increase length
            if (attempts > 50) {
              const longerRandomPart = Math.random().toString(36).substr(2, 6).toUpperCase();
              bulkCode = `${code}${longerRandomPart}`;
            }
          } while (generatedCodes.has(bulkCode) && attempts < maxAttempts);
          
          // Add to our set of generated codes
          generatedCodes.add(bulkCode);
          
          bulkCoupons.push([
            bulkCode, name, description || null, type, value,
            minimum_amount || null, maximum_discount || null, usage_limit || null,
            applies_to, applies_to === '2' ? JSON.stringify(package_ids) : null,
            user_targeting, user_targeting === 'selected_users' ? JSON.stringify(selected_user_ids) : null,
            user_redemption_limit, payment_method_restriction,
            payment_method_restriction === 'selected' ? JSON.stringify(allowed_payment_methods) : null,
            valid_from, valid_until, is_active, is_public,
            display_order || null, true, couponId
          ]);
        }

        try {
          await connection.query(
            `INSERT INTO discounts (
              code, name, description, type, value, minimum_amount, maximum_discount,
              usage_limit, applies_to, package_ids, user_targeting, selected_user_ids,
              user_redemption_limit, payment_method_restriction, allowed_payment_methods,
              valid_from, valid_until, is_active, is_public, display_order,
              is_bulk_generated, parent_coupon_id
            ) VALUES ?`,
            [bulkCoupons]
          );
        } catch (insertError) {
          // If we get a duplicate entry error, it means one of our generated codes conflicts with an existing one
          if (insertError.code === 'ER_DUP_ENTRY' && insertError.sqlMessage && insertError.sqlMessage.includes("for key 'code'")) {
            // In this case, we'll let the transaction rollback and the top-level error handler will return a proper response
            throw insertError;
          } else {
            // For any other error, re-throw it
            throw insertError;
          }
        }
      }

      await connection.commit();

      // Get updated stats
      const stats = await getCouponStats();

      return res.status(201).json({
        message: "Coupon added successfully",
        couponId,
        bulk_generated: bulk_generate ? bulk_count : 0,
        stats
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error("Error adding coupon:", error);
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.sqlMessage && error.sqlMessage.includes("for key 'code'")) {
        return res.status(409).json({ 
          error: "Coupon code already exists",
          message: "A coupon with this code already exists. Please use a different code."
        });
      }
      return res.status(409).json({ 
        error: "Duplicate entry",
        message: "This record already exists in the database."
      });
    }
    
    // Handle other specific database errors
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ 
        error: "Invalid reference",
        message: "One or more referenced records do not exist."
      });
    }
    
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ 
        error: "Required field missing",
        message: "One or more required fields are missing."
      });
    }
    
    // Generic error for other cases
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCoupons(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sort_by || 'created_at';
    const sortOrder = req.query.sort_order || 'desc';
    const offset = (page - 1) * limit;

    // Validate pagination parameters
    if (isNaN(page) || page < 1) {
      return res.status(400).json({ error: "Invalid page parameter" });
    }
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: "Invalid limit parameter (must be between 1 and 100)" });
    }
    if (isNaN(offset) || offset < 0) {
      return res.status(400).json({ error: "Invalid offset parameter" });
    }

    // Validate sort parameters
    const validSortFields = ['created_at', 'updated_at', 'total_usage', 'name', 'code'];
    if (!validSortFields.includes(sortBy)) {
      return res.status(400).json({ error: "Invalid sort_by parameter" });
    }

    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      return res.status(400).json({ error: "Invalid sort_order parameter (must be 'asc' or 'desc')" });
    }

    // Get coupon stats
    const stats = await getCouponStats();

    // Base query to get coupons with usage count and user information
    let orderByClause = `d.${sortBy}`;
    if (sortBy === 'total_usage') {
      orderByClause = 'total_usage';
    }
    
    const query = `
      SELECT 
        d.*,
        COUNT(DISTINCT du.id) as total_usage,
        GROUP_CONCAT(DISTINCT du.payment_method) as used_payment_methods,
        GROUP_CONCAT(DISTINCT du.order_type) as used_order_types,
        GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name)) as used_by_users,
        GROUP_CONCAT(DISTINCT u.email) as used_by_emails
      FROM discounts d
      LEFT JOIN discount_usage du ON d.id = du.discount_id
      LEFT JOIN res_users u ON du.user_id = u.user_id
      WHERE d.deleted_at IS NULL
      GROUP BY d.id
      ORDER BY ${orderByClause} ${sortOrder}
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Fetch paginated coupons
    const [coupons] = await pool.query(query);

    // Get total count for pagination metadata
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM discounts WHERE deleted_at IS NULL`
    );

    // Process the results
    const processedCoupons = coupons.map(coupon => ({
      ...coupon,
      package_ids: coupon.package_ids ? JSON.parse(coupon.package_ids) : null,
      selected_user_ids: coupon.selected_user_ids ? JSON.parse(coupon.selected_user_ids) : null,
      allowed_payment_methods: coupon.allowed_payment_methods ? JSON.parse(coupon.allowed_payment_methods) : null,
      total_usage: Number(coupon.total_usage),
      used_payment_methods: coupon.used_payment_methods ? [...new Set(coupon.used_payment_methods.split(','))] : [],
      used_order_types: coupon.used_order_types ? [...new Set(coupon.used_order_types.split(','))] : [],
      used_by_users: coupon.used_by_users ? [...new Set(coupon.used_by_users.split(','))] : [],
      used_by_emails: coupon.used_by_emails ? [...new Set(coupon.used_by_emails.split(','))] : []
    }));

    const result = {
      data: processedCoupons,
      stats,
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        perPage: limit
      }
    };

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updateCoupon(req, res) {
  try {
    const { id } = req.params;
    const {
      // Basic Information
      code,
      name,
      description,
      
      // Discount Settings
      type,
      value,
      minimum_amount,
      maximum_discount,
      usage_limit,
      
      // Application Settings
      applies_to,
      package_ids,
      
      // User Targeting
      user_targeting,
      selected_user_ids,
      user_redemption_limit,
      
      // Payment Methods
      payment_method_restriction,
      allowed_payment_methods,
      
      // Validity
      valid_from,
      valid_until,
      
      // Status
      is_active,
      is_public,
      display_order
    } = req.body;

    // Validate the coupon data
    const validationError = validateCoupon(req.body, true);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Update main coupon record
    const [result] = await pool.execute(
      `UPDATE discounts SET
        code = ?, name = ?, description = ?, type = ?, value = ?,
        minimum_amount = ?, maximum_discount = ?, usage_limit = ?,
        applies_to = ?, package_ids = ?, user_targeting = ?, 
        selected_user_ids = ?, user_redemption_limit = ?,
        payment_method_restriction = ?, allowed_payment_methods = ?,
        valid_from = ?, valid_until = ?, is_active = ?, 
        is_public = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL`,
      [
        code.toUpperCase(),
        name,
        description || null,
        type,
        value,
        minimum_amount || null,
        maximum_discount || null,
        usage_limit || null,
        applies_to,
        applies_to === '2' ? JSON.stringify(package_ids) : null,
        user_targeting,
        user_targeting === 'selected_users' ? JSON.stringify(selected_user_ids) : null,
        user_redemption_limit,
        payment_method_restriction,
        payment_method_restriction === 'selected' ? JSON.stringify(allowed_payment_methods) : null,
        valid_from,
        valid_until,
        is_active,
        is_public,
        display_order || null,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    // Get updated stats
    const stats = await getCouponStats();

    return res.status(200).json({
      message: "Coupon updated successfully",
      stats
    });

  } catch (error) {
    console.error("Error updating coupon:", error);
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.sqlMessage && error.sqlMessage.includes("for key 'code'")) {
        return res.status(409).json({ 
          error: "Coupon code already exists",
          message: "A coupon with this code already exists. Please use a different code."
        });
      }
      return res.status(409).json({ 
        error: "Duplicate entry",
        message: "This record already exists in the database."
      });
    }
    
    // Handle other specific database errors
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ 
        error: "Invalid reference",
        message: "One or more referenced records do not exist."
      });
    }
    
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ 
        error: "Required field missing",
        message: "One or more required fields are missing."
      });
    }
    
    // Generic error for other cases
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCoupon(req, res) {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id || isNaN(id)) {
      return res.status(400).json({
        error: "Invalid ID",
        message: "Valid coupon ID is required"
      });
    }

    // Get coupon details with usage statistics and user information
    const [coupons] = await pool.query(
      `SELECT 
        d.*,
        COUNT(DISTINCT du.id) as total_usage,
        GROUP_CONCAT(DISTINCT du.payment_method) as used_payment_methods,
        GROUP_CONCAT(DISTINCT du.order_type) as used_order_types,
        GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name)) as used_by_users,
        GROUP_CONCAT(DISTINCT u.email) as used_by_emails,
        CASE
          WHEN d.is_active = 0 THEN 'inactive'
          WHEN d.valid_until < CURDATE() THEN 'expired'
          WHEN d.valid_from > CURDATE() THEN 'scheduled'
          ELSE 'active'
        END AS status
      FROM discounts d
      LEFT JOIN discount_usage du ON d.id = du.discount_id
      LEFT JOIN res_users u ON du.user_id = u.user_id
      WHERE d.id = ? AND d.deleted_at IS NULL
      GROUP BY d.id`,
      [id]
    );

    if (coupons.length === 0) {
      return res.status(404).json({
        error: "Coupon not found",
        message: "The requested coupon does not exist"
      });
    }

    const coupon = coupons[0];

    // Get selected user details if user_targeting is 'selected_users'
    let selected_users = null;
    if (coupon.user_targeting === 'selected_users' && coupon.selected_user_ids) {
      const selectedUserIds = JSON.parse(coupon.selected_user_ids);
      if (selectedUserIds && selectedUserIds.length > 0) {
        const [selectedUsers] = await pool.query(
          `SELECT user_id, first_name, last_name, email, username 
           FROM res_users 
           WHERE user_id IN (${selectedUserIds.map(() => '?').join(',')})`,
          selectedUserIds
        );
        selected_users = selectedUsers.map(user => ({
          user_id: user.user_id,
          username: user.username,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email
        }));
      }
    }

    // Process the coupon data
    const processedCoupon = {
      ...coupon,
      package_ids: coupon.package_ids ? JSON.parse(coupon.package_ids) : null,
      selected_user_ids: coupon.selected_user_ids ? JSON.parse(coupon.selected_user_ids) : null,
      selected_users: selected_users,
      allowed_payment_methods: coupon.allowed_payment_methods ? JSON.parse(coupon.allowed_payment_methods) : null,
      total_usage: Number(coupon.total_usage),
      used_payment_methods: coupon.used_payment_methods ? [...new Set(coupon.used_payment_methods.split(','))] : [],
      used_order_types: coupon.used_order_types ? [...new Set(coupon.used_order_types.split(','))] : [],
      used_by_users: coupon.used_by_users ? [...new Set(coupon.used_by_users.split(','))] : [],
      used_by_emails: coupon.used_by_emails ? [...new Set(coupon.used_by_emails.split(','))] : []
    };

    return res.status(200).json({
      data: processedCoupon,
      message: "Coupon details retrieved successfully"
    });

  } catch (error) {
    console.error("Error fetching coupon details:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function deleteCoupon(req, res) {
  try {
    const { id } = req.params;

    // Soft delete the coupon
    const [result] = await pool.execute(
      'UPDATE discounts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    // Get updated stats
    const stats = await getCouponStats();

    return res.status(200).json({
      message: "Coupon deleted successfully",
      stats
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Get coupon usage history with pagination and sorting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getCouponUsage(req, res) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sort_by || 'used_at';
    const sortOrder = req.query.sort_order || 'desc';
    const offset = (page - 1) * limit;

    // Validate parameters
    if (!id || isNaN(id)) {
      return res.status(400).json({
        error: "Invalid ID",
        message: "Valid coupon ID is required"
      });
    }

    if (isNaN(page) || page < 1) {
      return res.status(400).json({ error: "Invalid page parameter" });
    }
    
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: "Invalid limit parameter (must be between 1 and 100)" });
    }

    // Validate sort parameters
    const validSortFields = ['used_at', 'discount_amount', 'order_total', 'payment_method'];
    if (!validSortFields.includes(sortBy)) {
      return res.status(400).json({ error: "Invalid sort_by parameter" });
    }

    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      return res.status(400).json({ error: "Invalid sort_order parameter (must be 'asc' or 'desc')" });
    }

    // Check if coupon exists
    const [coupons] = await pool.query(
      'SELECT id, code, name FROM discounts WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (coupons.length === 0) {
      return res.status(404).json({
        error: "Coupon not found",
        message: "The requested coupon does not exist"
      });
    }

    const coupon = coupons[0];

    // Get usage history with user and order details
    const [usageHistory] = await pool.query(
      `SELECT 
        du.*,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        ro.order_status,
        ro.payment_status,
        ro.exchange_rate,
        ro.currency
      FROM discount_usage du
      LEFT JOIN res_users u ON du.user_id = u.user_id
      LEFT JOIN res_orders ro ON du.order_id = ro.order_id
      WHERE du.discount_id = ?
      ORDER BY du.${sortBy} ${sortOrder}
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      [id]
    );

    // Get total count for pagination
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM discount_usage WHERE discount_id = ?',
      [id]
    );

    // Get statistics
    const [[stats]] = await pool.query(
      `SELECT 
        COUNT(*) as total_usage,
        SUM(du.discount_amount) as total_discount_given,
        SUM(du.order_total) as total_order_amount,
        SUM(du.discount_amount / ${SAFE_EXCHANGE_RATE_EXPRESSION}) as total_discount_converted,
        SUM(du.order_total / ${SAFE_EXCHANGE_RATE_EXPRESSION}) as total_order_converted
      FROM discount_usage du
      LEFT JOIN res_orders ro ON du.order_id = ro.order_id
      WHERE du.discount_id = ?`,
      [id]
    );

    // Get base currency from site options
    const [[currencyResult]] = await pool.query(
      "SELECT option_value FROM res_options WHERE option_name = 'currency'"
    );
    const [[currencySymbolResult]] = await pool.query(
      "SELECT option_value FROM res_options WHERE option_name = 'currency_symbol'"
    );
    const baseCurrency = currencyResult ? currencyResult.option_value : 'INR';
    const baseCurrencySymbol = currencySymbolResult
      ? currencySymbolResult.option_value
      : '₹';

    // Process usage history data
    const processedUsage = usageHistory.map(usage => {
      const discountAmount = parseFloat(usage.discount_amount);
      const orderTotal = parseFloat(usage.order_total);
      const exchangeRate = usage.exchange_rate && Number(usage.exchange_rate) > 0
        ? Number(usage.exchange_rate)
        : 1;

      return {
        id: usage.id,
        user: {
          id: usage.user_id,
          username: usage.username,
          name:
            usage.first_name && usage.last_name
              ? `${usage.first_name} ${usage.last_name}`
              : usage.username,
          email: usage.email,
        },
        order: {
          id: usage.order_id,
          status: usage.order_status,
          payment_status: usage.payment_status,
          currency: usage.currency,
          exchange_rate: exchangeRate,
        },
        discount_amount: discountAmount,
        discount_amount_converted: discountAmount / exchangeRate,
        order_total: orderTotal,
        order_total_converted: orderTotal / exchangeRate,
        payment_method: usage.payment_method,
        order_type: usage.order_type,
        package_id: usage.package_id,
        used_at: usage.used_at,
      };
    });

    // Format statistics
    const formattedStats = {
      total_usage: stats.total_usage ? parseInt(stats.total_usage) : 0,
      total_discount_given: stats.total_discount_given
        ? parseFloat(stats.total_discount_given)
        : 0,
      total_discount_converted: stats.total_discount_converted
        ? parseFloat(stats.total_discount_converted)
        : 0,
      total_order_amount: stats.total_order_amount
        ? parseFloat(stats.total_order_amount)
        : 0,
      total_order_converted: stats.total_order_converted
        ? parseFloat(stats.total_order_converted)
        : 0,
      base_currency: baseCurrency,
      base_currency_symbol: baseCurrencySymbol,
    };

    return res.status(200).json({
      data: {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          name: coupon.name
        },
        usage: processedUsage,
        stats: formattedStats
      },
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        perPage: limit
      },
      message: "Coupon usage history retrieved successfully"
    });

  } catch (error) {
    console.error("Error fetching coupon usage history:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Get all coupon usage history with pagination and sorting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAllCouponUsage(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sort_by || 'used_at';
    const sortOrder = req.query.sort_order || 'desc';
    const offset = (page - 1) * limit;

    // Validate parameters
    if (isNaN(page) || page < 1) {
      return res.status(400).json({ error: "Invalid page parameter" });
    }
    
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: "Invalid limit parameter (must be between 1 and 100)" });
    }

    // Validate sort parameters
    const validSortFields = ['used_at', 'discount_amount', 'order_total', 'payment_method', 'discount_id'];
    if (!validSortFields.includes(sortBy)) {
      return res.status(400).json({ error: "Invalid sort_by parameter" });
    }

    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      return res.status(400).json({ error: "Invalid sort_order parameter (must be 'asc' or 'desc')" });
    }

    // Get usage history with user, order, and coupon details
    const [usageHistory] = await pool.query(
      `SELECT 
        du.*,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        ro.order_status,
        ro.payment_status,
        ro.exchange_rate,
        ro.currency,
        d.code as coupon_code,
        d.name as coupon_name
      FROM discount_usage du
      LEFT JOIN res_users u ON du.user_id = u.user_id
      LEFT JOIN res_orders ro ON du.order_id = ro.order_id
      LEFT JOIN discounts d ON du.discount_id = d.id
      ORDER BY du.${sortBy} ${sortOrder}
      LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`
    );

    // Get total count for pagination
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM discount_usage'
    );

    // Get base currency
    const [[currencyResult]] = await pool.query(
      "SELECT option_value FROM res_options WHERE option_name = 'currency'"
    );
    const [[currencySymbolResult]] = await pool.query(
      "SELECT option_value FROM res_options WHERE option_name = 'currency_symbol'"
    );
    const baseCurrency = currencyResult ? currencyResult.option_value : 'INR';
    const baseCurrencySymbol = currencySymbolResult
      ? currencySymbolResult.option_value
      : '₹';

    // Process usage history data
    const processedUsage = usageHistory.map(usage => {
      const discountAmount = parseFloat(usage.discount_amount);
      const orderTotal = parseFloat(usage.order_total);
      const exchangeRate = usage.exchange_rate && Number(usage.exchange_rate) > 0
        ? Number(usage.exchange_rate)
        : 1;

      return {
        id: usage.id,
        coupon: {
          id: usage.discount_id,
          code: usage.coupon_code,
          name: usage.coupon_name,
        },
        user: {
          id: usage.user_id,
          username: usage.username,
          name:
            usage.first_name && usage.last_name
              ? `${usage.first_name} ${usage.last_name}`
              : usage.username,
          email: usage.email,
        },
        order: {
          id: usage.order_id,
          status: usage.order_status,
          payment_status: usage.payment_status,
          currency: usage.currency,
          exchange_rate: exchangeRate,
        },
        discount_amount: discountAmount,
        discount_amount_converted: discountAmount / exchangeRate,
        order_total: orderTotal,
        order_total_converted: orderTotal / exchangeRate,
        payment_method: usage.payment_method,
        order_type: usage.order_type,
        package_id: usage.package_id,
        used_at: usage.used_at
      };
    });

    // Get statistics
    const [[stats]] = await pool.query(
      `SELECT 
        COUNT(*) as total_usage,
        SUM(du.discount_amount) as total_discount_given,
        SUM(du.order_total) as total_order_amount,
        SUM(du.discount_amount / ${SAFE_EXCHANGE_RATE_EXPRESSION}) as total_discount_converted,
        SUM(du.order_total / ${SAFE_EXCHANGE_RATE_EXPRESSION}) as total_order_converted,
        COUNT(DISTINCT du.discount_id) as unique_coupons_used,
        COUNT(DISTINCT du.user_id) as unique_users
      FROM discount_usage du
      LEFT JOIN res_orders ro ON du.order_id = ro.order_id`
    );

    // Format statistics
    const formattedStats = {
      total_usage: stats.total_usage ? parseInt(stats.total_usage) : 0,
      total_discount_given: stats.total_discount_given ? parseFloat(stats.total_discount_given) : 0,
      total_discount_converted: stats.total_discount_converted ? parseFloat(stats.total_discount_converted) : 0,
      total_order_amount: stats.total_order_amount ? parseFloat(stats.total_order_amount) : 0,
      total_order_converted: stats.total_order_converted ? parseFloat(stats.total_order_converted) : 0,
      unique_coupons_used: stats.unique_coupons_used ? parseInt(stats.unique_coupons_used) : 0,
      unique_users: stats.unique_users ? parseInt(stats.unique_users) : 0,
      base_currency: baseCurrency,
      base_currency_symbol: baseCurrencySymbol,
    };

    return res.status(200).json({
      data: {
        usage: processedUsage,
        stats: formattedStats
      },
      pagination: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        perPage: limit
      },
      message: "All coupon usage history retrieved successfully"
    });

  } catch (error) {
    console.error("Error fetching all coupon usage history:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addCoupon,
  getCoupons,
  getCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponUsage
};