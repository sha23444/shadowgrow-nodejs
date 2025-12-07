
const { pool } = require("../../../config/database");

async function getProfile(req, res) {
  const { id: userId } = req.user;

  try {
    // Fetch basic user info
    const [[user]] = await pool.execute(
      `SELECT * FROM res_users 
       WHERE user_id = ?`,
      [userId]
    );

    // Fetch current active package
    const [[userPackage]] = await pool.execute(
      `SELECT upackage_id, package_title, is_current, bandwidth, bandwidth_files, fair, fair_files, is_active, date_expire  
       FROM res_upackages 
       WHERE user_id = ? AND is_current = 1 AND is_active = 1 AND date_expire > NOW()`,
      [userId]
    );

    let usageStats = {
      bandwidthUsed: 0,
      totalFiles: 0,
      todayBandwidthUsed: 0,
      todayTotalFiles: 0,
    };

    if (userPackage) {
      // Fetch total bandwidth and file usage only if userPackage exists
      const [usageRows] = await pool.execute(
        `SELECT
           COALESCE(SUM(file_size), 0) AS bandwidthUsed,
           COALESCE(COUNT(file_id), 0) AS totalFiles
         FROM res_udownloads
         WHERE user_id = ? AND upackage_id = ?`,
        [userId, userPackage.upackage_id]
      );

      // Fetch today's download stats
      const [todayDownloads] = await pool.execute(
        `SELECT
           COALESCE(SUM(file_size), 0) AS todayBandwidthUsed,
           COALESCE(COUNT(file_id), 0) AS todayTotalFiles
         FROM res_udownloads
         WHERE user_id = ? AND upackage_id = ? AND DATE(created_at) = CURDATE()`,
        [userId, userPackage.upackage_id]
      );

      usageStats = {
        bandwidthUsed: usageRows[0]?.bandwidthUsed || 0,
        totalFiles: usageRows[0]?.totalFiles || 0,
        todayBandwidthUsed: todayDownloads[0]?.todayBandwidthUsed || 0,
        todayTotalFiles: todayDownloads[0]?.todayTotalFiles || 0,
      };
    }

    // Fetch last 3 transactions
    const [transaction] = await pool.execute(
      `SELECT * FROM res_transfers WHERE user_id = ? ORDER BY created_at DESC LIMIT 3`,
      [userId]
    );

    const response = {
      user: {
        ...user,
        package: userPackage || null, // if no package, return null
        usageStats: usageStats,
        transactions: transaction,
      },
    };

    res.status(200).json({
      response,
      status: "success",
    });

  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}



module.exports = {
  getProfile,
};
