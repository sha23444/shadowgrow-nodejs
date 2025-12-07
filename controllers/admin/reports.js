const { pool } = require("../../config/database");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

async function getTransactions(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination
  const search = req.query.search || ""; // Search filter

  try {
    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `
      SELECT COUNT(*) AS total
      FROM res_transactions AS t
      INNER JOIN res_users AS u ON t.user_id = u.user_id
      INNER JOIN res_orders AS o ON t.order_id = o.order_id
      WHERE u.username LIKE ? OR t.gateway_txn_id LIKE ?
      `,
      [`%${search}%`, `%${search}%`]
    );

    // Fetch paginated transaction data with joins
    const [transactions] = await pool.execute(
      `
      SELECT 
        t.*, 
        u.username, 
        u.first_name, 
        u.last_name, 
        u.email, 
        o.order_status
      FROM res_transactions AS t
      INNER JOIN res_users AS u ON t.user_id = u.user_id
      INNER JOIN res_orders AS o ON t.order_id = o.order_id
      WHERE u.username LIKE ? OR t.gateway_txn_id LIKE ?
      LIMIT ? OFFSET ?
      `,
      [`%${search}%`, `%${search}%`, limit, offset]
    );

    // Construct the paginated response
    const result = {
      data: transactions,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };

    // Return the response
    return res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getDownloadsHistory(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination

  try {
    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `
            SELECT COUNT(*) AS total
            FROM res_udownloads
            `
    );

    // Join the table with res_files to get the file name and calculate canDownload
    const [rows] = await pool.execute(
      `
            SELECT res_udownloads.*, res_files.title, res_files.size, res_files.folder_id,
            (res_udownloads.expired_at > NOW()) AS canDownload
            FROM res_udownloads
            LEFT JOIN res_files 
            ON res_udownloads.file_id = res_files.file_id
            LIMIT ? OFFSET ?
            `,
      [limit, offset]
    );

    // Ensure canDownload is returned as true/false in JavaScript
    const result = rows.map((row) => ({
      ...row,
      canDownload: !!row.canDownload, // Convert 1/0 to true/false
    }));

    // Construct the paginated response
    const response = {
      data: result,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };

    res.status(200).json({
      status: "success",
      response: response,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getWalletTransactions(req, res) {
  const { page = 1, limit = 10 } = req.query; // Default page is 1, limit is 10

  // Ensure `page` and `limit` are numbers and greater than 0
  const pageNumber = parseInt(page, 10);
  const pageSize = parseInt(limit, 10);

  if (
    isNaN(pageNumber) ||
    pageNumber <= 0 ||
    isNaN(pageSize) ||
    pageSize <= 0
  ) {
    return res.status(400).json({
      message: "Pagination parameters must be positive numbers.",
      status: "error",
    });
  }

  const offset = (pageNumber - 1) * pageSize; // Calculate the offset

  try {
    // Fetch total transactions count (no user_id condition)
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_transfers`
    );

    // Fetch paginated transactions with user details
    const [transactions] = await pool.query(
      `
      SELECT 
        t.*, 
        u.username, 
        u.first_name, 
        u.last_name, 
        u.email
      FROM res_transfers AS t
      INNER JOIN res_users AS u ON t.user_id = u.user_id
      ORDER BY t.created_at DESC 
      LIMIT ? OFFSET ?
      `,
      [pageSize, offset]
    );

    const result = {
      data: transactions,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    return res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    return res.status(500).json({
      message:
        "An error occurred while fetching transactions. Please try again.",
      status: "error",
    });
  }
}

async function getAllFiles(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination

  try {
    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM res_files`
    );

    // Fetch paginated files and join with the res_folders table based on folder_id
    const [rows] = await pool.execute(
      `SELECT 
        rf.file_id, 
        rf.folder_id, 
        rf.title, 
        rf.is_active, 
        rf.is_new,
        rf.is_featured,
        rf.description, 
        rf.size, 
        rf.price, 
        rf.is_featured, 
        rf.downloads, 
        rf.visits,
        f.title  AS folder
      FROM res_files rf
      LEFT JOIN res_folders f ON rf.folder_id = f.folder_id
      ORDER BY rf.title ASC
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Parse tags field to ensure it's an array
    const filesWithParsedTags = rows.map((file) => {
      return {
        ...file,
        tags: file.tags ? JSON.parse(file.tags) : [], // Ensure tags is an array
      };
    });

    // Construct the paginated response
    const result = {
      data: filesWithParsedTags,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };

    res.status(200).json({
      status: "success",
      response: result, // Send files with parsed tags and folder information
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
}

async function getPackages(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination

  try {
    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM res_upackages`
    );

    // SQL query to select all fields (*) from both res_upackages and res_download_packages with pagination
    const [packages] = await pool.execute(
      `
      SELECT 
        res_upackages.*, 
        res_download_packages.*
      FROM res_upackages
      LEFT JOIN res_download_packages 
      ON res_upackages.package_id = res_download_packages.package_id
      ORDER BY res_upackages.date_create ASC
      LIMIT ? OFFSET ?
      `,
      [limit, offset]
    );

    // Construct the paginated response
    const result = {
      data: packages,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };

    // Send the response with the package list
    res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getDownladsVisitors(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination

  try {
    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM res_download_visitors`
    );

    // Fetch paginated download visitors data and join with res_files to get file details
    const [rows] = await pool.execute(
      `SELECT 
        dv.*, 
        f.title AS file, 
        f.size AS file_size 
      FROM res_download_visitors dv
      LEFT JOIN res_files f ON dv.file_id = f.file_id
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Construct the paginated response
    const result = {
      data: rows,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };

    res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getStaffActivity(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination

  try {
    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM res_staff_activity_records`
    );

    // Fetch paginated staff activity records and join with res_staff table
    const [rows] = await pool.execute(
      `SELECT 
        sar.*, 
        s.email, 
        s.first_name, 
        s.last_name 
      FROM res_staff_activity_records sar
      LEFT JOIN res_staff s ON sar.staff_id = s.staff_id
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Construct the paginated response
    const result = {
      data: rows,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };

    res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getIpBlacklist(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination

  try {
    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM res_ip_blacklist`
    );

    // Fetch paginated IP blacklist data
    const [rows] = await pool.execute(
      `SELECT * FROM res_ip_blacklist LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Construct the paginated response
    const result = {
      data: rows,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };

    res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCouponUsageReport(req, res) {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '',
      startDate,
      endDate,
      couponCode,
      sortBy = 'du.used_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build the base query for coupon usage
    let query = `
      SELECT 
        du.id,
        d.code,
        d.name,
        d.type,
        d.value,
        du.discount_amount,
        du.order_total,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        du.payment_method,
        du.order_type,
        du.used_at,
        o.order_id,
        o.order_status
      FROM discount_usage du
      INNER JOIN discounts d ON du.discount_id = d.id
      INNER JOIN res_users u ON du.user_id = u.user_id
      INNER JOIN res_orders o ON du.order_id = o.order_id
      WHERE d.deleted_at IS NULL
    `;
    
    let countQuery = `
      SELECT COUNT(*) AS total
      FROM discount_usage du
      INNER JOIN discounts d ON du.discount_id = d.id
      INNER JOIN res_users u ON du.user_id = u.user_id
      INNER JOIN res_orders o ON du.order_id = o.order_id
      WHERE d.deleted_at IS NULL
    `;
    
    let queryParams = [];
    let countParams = [];

    // Add search condition
    if (search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query += ` AND (d.code LIKE ? OR d.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)`;
      countQuery += ` AND (d.code LIKE ? OR d.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Add date range filter
    if (startDate) {
      query += ` AND du.used_at >= ?`;
      countQuery += ` AND du.used_at >= ?`;
      queryParams.push(startDate);
      countParams.push(startDate);
    }
    
    if (endDate) {
      query += ` AND du.used_at <= ?`;
      countQuery += ` AND du.used_at <= ?`;
      queryParams.push(endDate);
      countParams.push(endDate);
    }

    // Add coupon code filter
    if (couponCode) {
      query += ` AND d.code = ?`;
      countQuery += ` AND d.code = ?`;
      queryParams.push(couponCode);
      countParams.push(couponCode);
    }

    // Add ordering
    const validSortColumns = [
      'du.used_at', 'd.code', 'd.name', 'du.discount_amount', 
      'u.username', 'du.payment_method', 'o.order_status'
    ];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'du.used_at';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    query += ` ORDER BY ${sortColumn} ${order}`;

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);

    // Execute queries
    const [usageData] = await pool.execute(query, queryParams);
    const [[countResult]] = await pool.execute(countQuery, countParams);

    const total = countResult.total;
    const result = {
      data: usageData,
      perPage: parseInt(limit),
      totalCount: total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
    };

    res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getAllCouponsReport(req, res) {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '',
      status, // active, expired, inactive
      sortBy = 'd.created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build the base query for all coupons
    let query = `
      SELECT 
        d.*,
        COUNT(du.id) as usage_count,
        COALESCE(SUM(du.discount_amount), 0) as total_discount_given
      FROM discounts d
      LEFT JOIN discount_usage du ON d.id = du.discount_id
      WHERE d.deleted_at IS NULL
    `;
    
    let countQuery = `
      SELECT COUNT(*) AS total
      FROM discounts d
      WHERE d.deleted_at IS NULL
    `;
    
    let queryParams = [];
    let countParams = [];
    let groupByClause = " GROUP BY d.id";

    // Add search condition
    if (search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query += ` AND (d.code LIKE ? OR d.name LIKE ? OR d.description LIKE ?)`;
      countQuery += ` AND (d.code LIKE ? OR d.name LIKE ? OR d.description LIKE ?)`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Add status filter
    const today = new Date().toISOString().split('T')[0];
    if (status === 'active') {
      query += ` AND d.is_active = 1 AND d.valid_from <= ? AND d.valid_until >= ?`;
      countQuery += ` AND d.is_active = 1 AND d.valid_from <= ? AND d.valid_until >= ?`;
      queryParams.push(today, today, today, today);
      countParams.push(today, today, today, today);
    } else if (status === 'expired') {
      query += ` AND d.valid_until < ?`;
      countQuery += ` AND d.valid_until < ?`;
      queryParams.push(today, today);
      countParams.push(today, today);
    } else if (status === 'inactive') {
      query += ` AND d.is_active = 0`;
      countQuery += ` AND d.is_active = 0`;
      queryParams.push();
      countParams.push();
    }

    // Add grouping
    query += groupByClause;

    // Add ordering
    const validSortColumns = [
      'd.created_at', 'd.code', 'd.name', 'd.value', 
      'usage_count', 'total_discount_given'
    ];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'd.created_at';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    query += ` ORDER BY ${sortColumn} ${order}`;

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);

    // Execute queries
    const [couponsData] = await pool.execute(query, queryParams);
    const [[countResult]] = await pool.execute(countQuery, countParams);

    const total = countResult.total;
    const result = {
      data: couponsData,
      perPage: parseInt(limit),
      totalCount: total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
    };

    res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function downloadCouponUsageExcel(req, res) {
  try {
    const { 
      search = '',
      startDate,
      endDate,
      couponCode
    } = req.query;

    // Build the query for coupon usage Excel export
    let query = `
      SELECT 
        du.id,
        d.code,
        d.name,
        d.type,
        d.value,
        du.discount_amount,
        du.order_total,
        u.username,
        CONCAT(u.first_name, ' ', u.last_name) as full_name,
        u.email,
        du.payment_method,
        CASE 
          WHEN du.order_type = '1' THEN 'Digital File'
          WHEN du.order_type = '2' THEN 'Subscription Package'
          ELSE du.order_type
        END as order_type,
        du.used_at,
        o.order_id,
        o.order_status
      FROM discount_usage du
      INNER JOIN discounts d ON du.discount_id = d.id
      INNER JOIN res_users u ON du.user_id = u.user_id
      INNER JOIN res_orders o ON du.order_id = o.order_id
      WHERE d.deleted_at IS NULL
    `;
    
    let queryParams = [];

    // Add search condition
    if (search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query += ` AND (d.code LIKE ? OR d.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Add date range filter
    if (startDate) {
      query += ` AND du.used_at >= ?`;
      queryParams.push(startDate);
    }
    
    if (endDate) {
      query += ` AND du.used_at <= ?`;
      queryParams.push(endDate);
    }

    // Add coupon code filter
    if (couponCode) {
      query += ` AND d.code = ?`;
      queryParams.push(couponCode);
    }

    // Add ordering
    query += ` ORDER BY du.used_at DESC`;

    // Execute query
    const [usageData] = await pool.execute(query, queryParams);

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Coupon Usage Report");

    // Define columns
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Coupon Code", key: "code", width: 15 },
      { header: "Coupon Name", key: "name", width: 25 },
      { header: "Type", key: "type", width: 15 },
      { header: "Value", key: "value", width: 15 },
      { header: "Discount Amount", key: "discount_amount", width: 20 },
      { header: "Order Total", key: "order_total", width: 15 },
      { header: "Username", key: "username", width: 20 },
      { header: "Full Name", key: "full_name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "Payment Method", key: "payment_method", width: 20 },
      { header: "Order Type", key: "order_type", width: 20 },
      { header: "Used At", key: "used_at", width: 25 },
      { header: "Order ID", key: "order_id", width: 15 },
      { header: "Order Status", key: "order_status", width: 15 }
    ];

    // Add data to worksheet
    usageData.forEach(row => {
      worksheet.addRow(row);
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `coupon-usage-report-${timestamp}.xlsx`;

    // Set response headers for direct download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating coupon usage Excel:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate Excel file"
    });
  }
}

async function downloadAllCouponsExcel(req, res) {
  try {
    const { 
      search = '',
      status // active, expired, inactive
    } = req.query;

    // Build the query for all coupons Excel export
    let query = `
      SELECT 
        d.code,
        d.name,
        d.description,
        d.type,
        d.value,
        d.minimum_amount,
        d.maximum_discount,
        d.usage_limit,
        d.current_usage,
        d.applies_to,
        d.user_targeting,
        d.valid_from,
        d.valid_until,
        CASE 
          WHEN d.is_active = 1 THEN 'Active'
          ELSE 'Inactive'
        END as is_active,
        CASE 
          WHEN d.valid_until < CURDATE() THEN 'Expired'
          WHEN d.is_active = 1 AND d.valid_from <= CURDATE() AND d.valid_until >= CURDATE() THEN 'Active'
          ELSE 'Inactive'
        END as status,
        COUNT(du.id) as usage_count,
        COALESCE(SUM(du.discount_amount), 0) as total_discount_given,
        d.created_at,
        d.updated_at
      FROM discounts d
      LEFT JOIN discount_usage du ON d.id = du.discount_id
      WHERE d.deleted_at IS NULL
    `;
    
    let queryParams = [];
    let groupByClause = " GROUP BY d.id";

    // Add search condition
    if (search.trim() !== '') {
      const searchTerm = `%${search.trim()}%`;
      query += ` AND (d.code LIKE ? OR d.name LIKE ? OR d.description LIKE ?)`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Add status filter
    const today = new Date().toISOString().split('T')[0];
    if (status === 'active') {
      query += ` AND d.is_active = 1 AND d.valid_from <= ? AND d.valid_until >= ?`;
      queryParams.push(today, today);
    } else if (status === 'expired') {
      query += ` AND d.valid_until < ?`;
      queryParams.push(today);
    } else if (status === 'inactive') {
      query += ` AND d.is_active = 0`;
    }

    // Add grouping
    query += groupByClause;

    // Add ordering
    query += ` ORDER BY d.created_at DESC`;

    // Execute query
    const [couponsData] = await pool.execute(query, queryParams);

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("All Coupons Report");

    // Define columns
    worksheet.columns = [
      { header: "Code", key: "code", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Description", key: "description", width: 30 },
      { header: "Type", key: "type", width: 15 },
      { header: "Value", key: "value", width: 15 },
      { header: "Min Amount", key: "minimum_amount", width: 15 },
      { header: "Max Discount", key: "maximum_discount", width: 15 },
      { header: "Usage Limit", key: "usage_limit", width: 15 },
      { header: "Current Usage", key: "current_usage", width: 15 },
      { header: "Applies To", key: "applies_to", width: 15 },
      { header: "User Targeting", key: "user_targeting", width: 20 },
      { header: "Valid From", key: "valid_from", width: 15 },
      { header: "Valid Until", key: "valid_until", width: 15 },
      { header: "Is Active", key: "is_active", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Usage Count", key: "usage_count", width: 15 },
      { header: "Total Discount", key: "total_discount_given", width: 20 },
      { header: "Created At", key: "created_at", width: 25 },
      { header: "Updated At", key: "updated_at", width: 25 }
    ];

    // Add data to worksheet
    couponsData.forEach(row => {
      worksheet.addRow(row);
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `all-coupons-report-${timestamp}.xlsx`;

    // Set response headers for direct download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating all coupons Excel:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate Excel file"
    });
  }
}

module.exports = {
  getTransactions,
  getDownloadsHistory,
  getWalletTransactions,
  getAllFiles,
  getPackages,
  getDownladsVisitors,
  getStaffActivity,
  getIpBlacklist,
  getCouponUsageReport,
  getAllCouponsReport,
  downloadCouponUsageExcel,
  downloadAllCouponsExcel
};
