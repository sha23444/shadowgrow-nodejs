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
    const search = req.query.search || "";
  
    try {
      // Fetch wallet transactions with user details
      const [transactions] = await pool.execute(
        `
        SELECT 
          t.*, 
          u.username, 
          u.first_name, 
          u.last_name, 
          u.email
        FROM res_transfers AS t
        INNER JOIN res_users AS u ON t.user_id = u.user_id
        WHERE u.username LIKE ? OR t.transaction_id LIKE ?
        `,
        [`%${search}%`, `%${search}%`]
      );
  
      // Create a new workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Wallet Transactions");
  
      // Define columns
      worksheet.columns = [
        { header: "Username", key: "username", width: 20 },
        { header: "First Name", key: "first_name", width: 15 },
        { header: "Last Name", key: "last_name", width: 15 },
        { header: "Email", key: "email", width: 25 },
        { header: "Amount", key: "amount", width: 15 },
        { header: "Currency", key: "currency", width: 10 },
        { header: "Transaction Type", key: "transaction_type", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Created At", key: "created_at", width: 20 },
      ];
  
      // Add data to worksheet
      transactions.forEach((transaction) => {
        worksheet.addRow(transaction);
      });
  
      // Set the file path
      const filePath = path.join(__dirname, "wallet_transactions.xlsx");
  
      // Write to file
      await workbook.xlsx.writeFile(filePath);
  
      // Send the file to client
      res.download(filePath, "wallet_transactions.xlsx", (err) => {
        if (err) {
          console.error("File download error:", err);
          return res
            .status(500)
            .json({ status: "error", message: "File download failed" });
        }
        // Remove the file after download to clean up
        fs.unlinkSync(filePath);
      });
    } catch (err) {
      console.error("Database or file error:", err);
      return res.status(500).json({
        status: "error",
        message: "Internal Server Error",
      });
    }
  }

  async function getAllFiles(req, res) {
    try {
      // Fetch all files and join with the res_folders table based on folder_id
      const [files] = await pool.execute(
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
          rf.downloads, 
          rf.visits,
          f.title AS folder
        FROM res_files rf
        LEFT JOIN res_folders f ON rf.folder_id = f.folder_id
        ORDER BY rf.title ASC`
      );
  
      // Create a new workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("All Files");
  
      // Define columns
      worksheet.columns = [
        { header: "File ID", key: "file_id", width: 15 },
        { header: "Folder", key: "folder", width: 20 },
        { header: "Title", key: "title", width: 30 },
        { header: "Description", key: "description", width: 40 },
        { header: "Size", key: "size", width: 15 },
        { header: "Price", key: "price", width: 15 },
        { header: "Downloads", key: "downloads", width: 15 },
        { header: "Visits", key: "visits", width: 15 },
        { header: "Is Active", key: "is_active", width: 10 },
        { header: "Is New", key: "is_new", width: 10 },
        { header: "Is Featured", key: "is_featured", width: 10 }
      ];
  
      // Add data to worksheet
      files.forEach((file) => {
        worksheet.addRow(file);
      });
  
      // Set the file path
      const filePath = path.join(__dirname, "all_files.xlsx");
  
      // Write to file
      await workbook.xlsx.writeFile(filePath);
  
      // Send the file to client
      res.download(filePath, "all_files.xlsx", (err) => {
        if (err) {
          console.error("File download error:", err);
          return res
            .status(500)
            .json({ status: "error", message: "File download failed" });
        }
        // Remove the file after download to clean up
        fs.unlinkSync(filePath);
      });
    } catch (err) {
      console.error("Database or file error:", err);
      return res.status(500).json({
        status: "error",
        message: "Internal Server Error",
      });
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

async function downloadTransactionsExcel(req, res) {
  const search = req.query.search || "";

  try {
    // Fetch all transaction data with joins
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
      `,
      [`%${search}%`, `%${search}%`]
    );

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transactions");

    // Define columns
    worksheet.columns = [
      { header: "Username", key: "username", width: 20 },
      { header: "First Name", key: "first_name", width: 15 },
      { header: "Last Name", key: "last_name", width: 15 },
      { header: "Email", key: "email", width: 25 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Gateway Transaction ID", key: "gateway_txn_id", width: 25 },
      { header: "Order Status", key: "order_status", width: 15 },
      { header: "Created At", key: "created_at", width: 20 },
    ];

    // Add data to worksheet
    transactions.forEach((transaction) => {
      worksheet.addRow(transaction);
    });

    // Set the file path
    const filePath = path.join(__dirname, "transactions.xlsx");

    // Write to file
    await workbook.xlsx.writeFile(filePath);

    // Send the file to client
    res.download(filePath, "transactions.xlsx", (err) => {
      if (err) {
        console.error("File download error:", err);
        return res
          .status(500)
          .json({ status: "error", message: "File download failed" });
      }
      // Remove the file after download to clean up
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error("Database or file error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getCouponsExcel(req, res) {
  const search = req.query.search || "";

  try {
    // Fetch all coupons with usage statistics
    const [coupons] = await pool.execute(
      `
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
      WHERE d.deleted_at IS NULL AND (d.code LIKE ? OR d.name LIKE ?)
      GROUP BY d.id
      ORDER BY d.created_at DESC
      `,
      [`%${search}%`, `%${search}%`]
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

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Coupons");

    // Define columns
    worksheet.columns = [
      { header: "Code", key: "code", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Description", key: "description", width: 30 },
      { header: "Type", key: "type", width: 15 },
      { header: "Value", key: "value", width: 15 },
      { header: "Minimum Amount", key: "minimum_amount", width: 20 },
      { header: "Maximum Discount", key: "maximum_discount", width: 20 },
      { header: "Usage Limit", key: "usage_limit", width: 15 },
      { header: "Current Usage", key: "current_usage", width: 15 },
      { header: "Applies To", key: "applies_to", width: 15 },
      { header: "User Targeting", key: "user_targeting", width: 20 },
      { header: "Valid From", key: "valid_from", width: 15 },
      { header: "Valid Until", key: "valid_until", width: 15 },
      { header: "Is Active", key: "is_active", width: 10 },
      { header: "Is Public", key: "is_public", width: 10 },
      { header: "Total Usage", key: "total_usage", width: 15 },
      { header: "Created At", key: "created_at", width: 20 },
    ];

    // Add data to worksheet
    processedCoupons.forEach((coupon) => {
      worksheet.addRow({
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        type: coupon.type,
        value: coupon.value,
        minimum_amount: coupon.minimum_amount,
        maximum_discount: coupon.maximum_discount,
        usage_limit: coupon.usage_limit,
        current_usage: coupon.current_usage,
        applies_to: coupon.applies_to,
        user_targeting: coupon.user_targeting,
        valid_from: coupon.valid_from,
        valid_until: coupon.valid_until,
        is_active: coupon.is_active ? 'Yes' : 'No',
        is_public: coupon.is_public ? 'Yes' : 'No',
        total_usage: coupon.total_usage,
        created_at: coupon.created_at,
      });
    });

    // Set the file path
    const filePath = path.join(__dirname, "coupons.xlsx");

    // Write to file
    await workbook.xlsx.writeFile(filePath);

    // Send the file to client
    res.download(filePath, "coupons.xlsx", (err) => {
      if (err) {
        console.error("File download error:", err);
        return res
          .status(500)
          .json({ status: "error", message: "File download failed" });
      }
      // Remove the file after download to clean up
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error("Database or file error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getCouponUsageExcel(req, res) {
  const search = req.query.search || "";

  try {
    // Fetch all coupon usage data with joins
    const [usageData] = await pool.execute(
      `
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
      WHERE d.deleted_at IS NULL AND (d.code LIKE ? OR d.name LIKE ? OR u.username LIKE ?)
      ORDER BY du.used_at DESC
      `,
      [`%${search}%`, `%${search}%`, `%${search}%`]
    );

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Coupon Usage");

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
      { header: "First Name", key: "first_name", width: 15 },
      { header: "Last Name", key: "last_name", width: 15 },
      { header: "Email", key: "email", width: 30 },
      { header: "Payment Method", key: "payment_method", width: 20 },
      { header: "Order Type", key: "order_type", width: 15 },
      { header: "Used At", key: "used_at", width: 25 },
      { header: "Order ID", key: "order_id", width: 15 },
      { header: "Order Status", key: "order_status", width: 15 }
    ];

    // Add data to worksheet
    usageData.forEach((usage) => {
      worksheet.addRow(usage);
    });

    // Set the file path
    const filePath = path.join(__dirname, "coupon_usage.xlsx");

    // Write to file
    await workbook.xlsx.writeFile(filePath);

    // Send the file to client
    res.download(filePath, "coupon_usage.xlsx", (err) => {
      if (err) {
        console.error("File download error:", err);
        return res
          .status(500)
          .json({ status: "error", message: "File download failed" });
      }
      // Remove the file after download to clean up
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error("Database or file error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
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
  downloadTransactionsExcel,
  getCouponsExcel,
  getCouponUsageExcel
};
