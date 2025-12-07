const { pool } = require("../../../config/database");

async function getPackages(req, res) {
  const { id } = req.user;
  const { page = 1, limit = 10 } = req.query; // Default to page 1, limit 10

  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Fetch user packages with download info using LEFT JOIN
    const [packages] = await pool.execute(
      `
      SELECT * FROM res_upackages WHERE user_id = ? AND is_active = 1
      ORDER BY res_upackages.date_create DESC
      LIMIT ? OFFSET ?
      `,
      [id, parseInt(limit), offset]
    );  

    // Get total count of packages for pagination
    const [[{ total }]] = await pool.execute(
      `
      SELECT COUNT(*) as total
      FROM res_upackages
      WHERE user_id = ? AND is_active = 1
      `,
      [id]
    );

    // Fetch statistics
    const [[{ totalPackages }]] = await pool.execute(
      `
        SELECT COUNT(*) as totalPackages
        FROM res_upackages
        WHERE user_id = ? AND is_active = 1
      `,
      [id]
    );

    const [[{ activePackages }]] = await pool.execute(
      `
        SELECT COUNT(*) as activePackages
        FROM res_upackages
        WHERE user_id = ? AND date_expire > NOW() AND is_active = 1
      `,
      [id]
    );

    const [[{ expiredPackages }]] = await pool.execute(
      `
        SELECT COUNT(*) as expiredPackages
        FROM res_upackages
        WHERE user_id = ? AND date_expire <= NOW() AND is_active = 1
      `,
      [id]
    );

    // Send the response with pagination and statistics
    return res.status(200).json({
      status: "success",
      data: packages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      statistics: {
        totalPackages,
        activePackages,
        expiredPackages,
      },
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function updateCurrentPackage(req, res) {
  const { upackage_id } = req.query;
  const { id } = req.user;

  try {
    // Set all packages for the user to is_current = 0
    await pool.execute(
      `UPDATE res_upackages SET is_current = 0 WHERE user_id = ?`,
      [id]
    );

    // Set the selected package to is_current = 1
    await pool.execute(
      `UPDATE res_upackages SET is_current = 1 WHERE user_id = ? AND upackage_id = ?`,
      [id, upackage_id]
    );

    const [packageRows] = await pool.execute(
      `SELECT * FROM res_upackages WHERE user_id = ? AND upackage_id = ? AND is_current = 1`,
      [id, upackage_id]
    );

    const packageName = packageRows[0]?.package_title || "Unknown Package";

    res.status(200).json({
      status: "success",
      message: `Package ${packageName} is now set as current`,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getUserPackageUsage(req, res) {
  const userId = req.user?.id;
  const { upackage_id } = req.query; // Get package ID from request params

  if (!upackage_id) {
    return res.status(400).json({
      status: "error",
      message: "Package ID is required",
    });
  }

  try {
    // Step 1: Fetch the specific package for this user
    const [packageRows] = await pool.execute(
      "SELECT * FROM res_upackages WHERE user_id = ? AND upackage_id = ?",
      [userId, upackage_id]
    );

    if (packageRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Package not found for this user",
      });
    }

    const userPackage = packageRows[0];

    // Step 2: Fetch total bandwidth and file usage
    const [usageRows] = await pool.execute(
      `
      SELECT
        COALESCE(SUM(file_size), 0) AS bandwidthUsed,
        COALESCE(COUNT(file_id), 0) AS totalFiles
      FROM res_udownloads
      WHERE user_id = ? AND upackage_id = ?
      `,
      [userId, upackage_id]
    );

    // Step 3: Fetch today's download stats
    const [todayDownloads] = await pool.execute(
      `
      SELECT
        COALESCE(SUM(file_size), 0) AS todayBandwidthUsed,
        COALESCE(COUNT(file_id), 0) AS todayTotalFiles
      FROM res_udownloads
      WHERE user_id = ? AND upackage_id = ? AND DATE(created_at) = CURDATE()
      `,
      [userId, upackage_id]
    );

    const expireDate = new Date(userPackage.date_expire);
    const currentDate = new Date();

    let isActive = true;

    if (expireDate < currentDate) {
      isActive = false;
    }

    // Step 4: Combine response
    const response = {
      ...userPackage,
      ...usageRows[0],
      ...todayDownloads[0],
      isActive,
    };

    return res.status(200).json({
      status: "success",
      data: response,
    });
  } catch (err) {
    console.error("Package Usage Error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

module.exports = {
  getPackages,
  updateCurrentPackage,
  getUserPackageUsage,
};
