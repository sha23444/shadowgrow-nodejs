const { pool } = require("../../config/database");

async function getRecentUsers(req, res) {
  try {
    // Query to fetch the most recent 10 user registrations
    const [recentUsers] = await pool.execute(
      `
        SELECT user_id,  username, first_name, last_name, email, phone, dial_code, created_at
        FROM res_users
        ORDER BY created_at DESC
        LIMIT 5
        `
    );

    return res.status(200).json({
      status: "success",
      data: recentUsers,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getRecentOrders(req, res) {
  try {
    const [recentOrders] = await pool.execute(
      `
      SELECT o.order_id, o.user_id, u.username, o.total_amount, o.currency, o.order_status, o.payment_status,  o.created_at, u.first_name, u.last_name, u.email
      FROM res_orders o
      JOIN res_users u ON o.user_id = u.user_id
      ORDER BY o.created_at DESC
      LIMIT 5
      `
    );

    return res.status(200).json({
      status: "success",
      data: recentOrders,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getRecentRequestFiles(req, res) {
  try {
    // Query to fetch the most recent 5 request files
    const [recentRequestFiles] = await pool.execute(
      `
        SELECT * FROM res_file_requests
        ORDER BY created_at DESC
        LIMIT 5
        `
    );

    return res.status(200).json({
      status: "success",
      data: recentRequestFiles,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getRecentEnquiry(req, res) {
  try {
    // Query to fetch the most recent 5 request files
    const [recentEnquiries] = await pool.execute(
      `
        SELECT * FROM res_contact_enquiries
        ORDER BY created_at DESC
        LIMIT 5
        `
    );

    return res.status(200).json({
      status: "success",
      data: recentEnquiries,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getTopDownloads(req, res) {
  try {
    const [topDownloads] = await pool.execute(
      `
      SELECT f.file_id, f.title as file, f.downloads, 
             fo.title as folder, fo.parent_title as parent_folder
      FROM res_files f
      LEFT JOIN res_folders fo ON f.folder_id = fo.folder_id
      ORDER BY f.downloads DESC
      LIMIT 5
      `
    );

    return res.status(200).json({
      status: "success",
      data: topDownloads,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getRecentDownloads(req, res) {
  try {
    const [recentDownloads] = await pool.execute(
      `
      SELECT d.*, u.username, u.user_id
      FROM res_udownloads d
      LEFT JOIN res_users u ON d.user_id = u.user_id
      ORDER BY d.created_at DESC
      LIMIT 5
      `
    );

    return res.status(200).json({
      status: "success",
      data: recentDownloads,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getRecentWalletTransactions(req, res) {
  try {
    const [recentWalletTransactions] = await pool.execute(
      `
      SELECT t.*, u.username, u.user_id
      FROM res_transfers t
      LEFT JOIN res_users u ON t.user_id = u.user_id
      ORDER BY t.created_at DESC
      LIMIT 5
      `
    );

    return res.status(200).json({
      status: "success",
      data: recentWalletTransactions,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getStats(req, res) {
  try {
    // Query to fetch the total users

    const [totalUsers] = await pool.execute(
      `
        SELECT COUNT(*) AS total_users
        FROM res_users
        `
    );

    // Query to fetch the total orders

    const [totalOrders] = await pool.execute(
      `
        SELECT COUNT(*) AS total_orders
        FROM res_orders
        WHERE created_at IS NOT NULL
      `
    );

    // Query to fetch the total products

    const [totalProducts] = await pool.execute(
      `
        SELECT COUNT(*) AS total_products
        FROM res_products
        `
    );

    // Query to fetch the total files

    const [totalFiles] = await pool.execute(
      `
        SELECT COUNT(*) AS total_files
        FROM res_files
        `
    );

    // Query to fetch the total coureses

    const [totalCourses] = await pool.execute(
      `
        SELECT COUNT(*) AS total_courses
        FROM res_courses
        `
    );

    // Query to fetch total today's user signups
    const [todayUserSignups] = await pool.execute(
      `
      SELECT COUNT(*) AS today_user_signups
      FROM res_users
      WHERE DATE(created_at) = CURDATE()
      `
    );

    // Query to fetch total today's orders
    const [todayOrders] = await pool.execute(
      `
      SELECT COUNT(*) AS today_orders
      FROM res_orders
      WHERE DATE(created_at) = CURDATE()
      `
    );

    // Add today's user signups to the response data
    res.status(200).json({
      status: "success",
      data: {
        totalUsers: totalUsers[0].total_users,
        totalOrders: totalOrders[0].total_orders,
        totalProducts: totalProducts[0].total_products,
        totalFiles: totalFiles[0].total_files,
        totalCourses: totalCourses[0].total_courses,
        todayUserSignups: todayUserSignups[0].today_user_signups,
        todayOrders: todayOrders[0].today_orders
      },
    });

  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getRecentTransactions(req, res) {
  try {
    // Query to fetch the most recent 5 transactions
    const [recentTransactions] = await pool.execute(
      `
        SELECT 
          t.transaction_id,
          t.order_id,
          t.user_id,
          t.currency,
          t.amount,
          t.exchange_rate,
          t.payment_status,
          t.payment_method,
          t.payment_date,
          t.created_at,
          t.updated_at,
          u.username,
          u.email,
          u.first_name,
          u.last_name,
          u.phone
        FROM res_transactions AS t
        LEFT JOIN res_users AS u ON t.user_id = u.user_id
        ORDER BY t.created_at DESC
        LIMIT 5
      `
    );

    const result = recentTransactions.map((tx) => ({
      transaction_id: tx.transaction_id,
      order_id: tx.order_id,
      user_id: tx.user_id,
      currency: tx.currency,
      amount: tx.amount,
      exchange_rate: tx.exchange_rate,
      payment_status: tx.payment_status,
      payment_method: tx.payment_method,
      payment_date: tx.payment_date,
      created_at: tx.created_at,
      updated_at: tx.updated_at,
      username: tx.username,
      email: tx.email,
      first_name: tx.first_name,
      last_name: tx.last_name,
      phone: tx.phone,
    }));

    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

module.exports = {
  getRecentUsers,
  getRecentOrders,
  getStats,
  getRecentEnquiry,
  getTopDownloads,
  getRecentRequestFiles,
  getRecentTransactions,
  getRecentDownloads,
  getRecentWalletTransactions
};
