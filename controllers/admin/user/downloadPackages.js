const { pool } = require("../../../config/database");

function formatDateTime(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function getPackages(req, res) {
  const { page = 1, limit = 10, user_id, search = "" } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }

  const offset = (page - 1) * limit;

  try {
    // Get paginated packages
    const [packages] = await pool.execute(
      `
      SELECT * 
      FROM res_upackages 
      WHERE user_id = ? AND (package_title LIKE ?)
      ORDER BY date_create DESC
      LIMIT ? OFFSET ?
      `,
      [user_id, `%${search}%`, parseInt(limit, 10), parseInt(offset, 10)]
    );

    // Get total count of matching records (for pagination)
    const [countResult] = await pool.execute(
      `
      SELECT COUNT(*) AS total 
      FROM res_upackages 
      WHERE user_id = ? AND (package_title LIKE ?)
      `,
      [user_id, `%${search}%`]
    );

    const total = countResult[0].total;

    const response = {
      data: packages,
      perPage: parseInt(limit, 10),
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page, 10),
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

// Utility function to convert bytes to appropriate unit
function convertBytes(bytes) {
  // Handle invalid input cases
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return {
      value: 0,
      unit: 'Bytes'
    };
  }

  // Convert to number if it's a string
  bytes = Number(bytes);

  // Handle 0 bytes case
  if (bytes === 0) {
    return {
      value: 0,
      unit: 'Bytes'
    };
  }

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return {
    value: parseFloat(value.toFixed(2)),
    unit: units[unitIndex]
  };
}

async function getPackageUsage(req, res) {
  const { upackage_id, user_id: userId } = req.query; // Get package ID from request params

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

    // Convert bandwidth values to appropriate units
    const fairUsage = convertBytes(userPackage.bandwidth);
    const bandwidthUsage = convertBytes(usageRows[0].bandwidthUsed);
    const todayBandwidthUsage = convertBytes(todayDownloads[0].todayBandwidthUsed);
    const bandwidth = convertBytes(userPackage.bandwidth);
    const fair = convertBytes(userPackage.fair);

    // Step 4: Combine response
    const response = {
      ...userPackage,
      ...usageRows[0],
      ...todayDownloads[0],
      isActive,
      fairValue: fairUsage.value,
      fairUnit: fairUsage.unit,
      bandwidthUsed: bandwidthUsage.value,
      bandwidthUsedUnit: bandwidthUsage.unit,
      todayBandwidthUsed: todayBandwidthUsage.value,
      todayBandwidthUsedUnit: todayBandwidthUsage.unit,
      bandwidth: bandwidth.value,
      bandwidthUnit: bandwidth.unit,
      fair: fair.value,
      fairUnit: fair.unit
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

async function updateCurrentPackage(req, res) {
  const {
    bandwidth,
    bandwidth_files,
    extraDevices,
    fair,
    fair_files,
    date_expire,
    is_current,
    is_active,
    user_id,
    upackage_id,
  } = req.body;

  if (!upackage_id || !user_id) {
    return res.status(400).json({
      status: "error",
      message: "Package ID and User ID are required",
    });
  }

  try {

    const [packageRows] = await pool.execute(
      `SELECT * FROM res_upackages WHERE upackage_id = ? AND user_id = ?`,
      [upackage_id, user_id]
    );


    if (packageRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Package not found for this user",
      });
    }

    const userPackage = packageRows[0];

    // check if the page is expired
    const expireDate = new Date(userPackage.date_expire);
    const currentDate = new Date();

    if (expireDate < currentDate) {
      return res.status(400).json({
        status: "error",
        message: "Package is expired",
      });
    }

    const devices = Number(userPackage.devices || 0) + Number(extraDevices || 0);
    const newBandwidth =
      Number(userPackage.bandwidth || 0) + Number(bandwidth || 0);
    const newFair = Number(userPackage.fair || 0) + Number(fair || 0);
    const newBandwidthFiles =
      Number(userPackage.bandwidth_files || 0) + Number(bandwidth_files || 0);
    const newFairFiles =
      Number(userPackage.fair_files || 0) + Number(fair_files || 0);
    const newExpireDate = date_expire
      ? formatDateTime(date_expire)
      : formatDateTime(userPackage.date_expire);

    await pool.execute(
      `UPDATE res_upackages 
      SET 
      devices = ?, 
      bandwidth = ?, 
      fair = ?, 
      bandwidth_files = ?, 
      fair_files = ?, 
      date_expire = ?, 
      is_current = ?, 
      is_active = ? 
      WHERE upackage_id = ? AND user_id = ?`,
      [
        devices,
        newBandwidth,
        newFair,
        newBandwidthFiles,
        newFairFiles,
        newExpireDate,
        is_current,
        is_active,
        upackage_id,
        user_id,
      ]
    );

    res.status(200).json({
      status: "success",
      message: `Package updated successfully`,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


async function addPackage(req, res) {
  const { package_id, user_id, is_active, is_current } = req.body;

  if (!package_id || !user_id) {
    return res.status(400).json({
      status: "error",
      message: "Package ID and User ID are required",
    });
  }

  try {
    // First, get the package details from the packages table
    const [packageRows] = await pool.execute(
      `SELECT * FROM res_download_packages WHERE package_id = ?`,
      [package_id]
    );

    if (packageRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Package not found",
      });
    }

    const packageData = packageRows[0];
    const currentDate = new Date();
    const expireDate = new Date(
      currentDate.getTime() + packageData.period * 1000
    );

    // Check if user already has an active current package
    const [existingPackages] = await pool.execute(
      `SELECT * FROM res_upackages WHERE user_id = ? AND is_active = 1 AND is_current = 1`,
      [user_id]
    );

    // If user has an active current package, deactivate it
    if (existingPackages.length > 0) {
      await pool.execute(
        `UPDATE res_upackages SET is_current = 0 WHERE user_id = ? AND is_active = 1 AND is_current = 1`,
        [user_id]
      );
    }

    // Insert the new package for the user
    await pool.execute(
      `INSERT INTO res_upackages (
        package_id, package_title, package_object, user_id, 
        bandwidth, bandwidth_files, extra, extra_files, fair, fair_files, devices,
        is_current, is_active, date_expire, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        packageData.package_id,
        packageData.title,
        JSON.stringify(packageData),
        user_id,
        packageData.bandwidth,
        packageData.bandwidth_files,
        packageData.extra,
        packageData.extra_files,
        packageData.fair,
        packageData.fair_files,
        packageData.devices,
        is_current, // is_current
        is_active, // is_active
        expireDate,
        'Package Added by Admin'
      ]
    );

    res.status(200).json({
      status: "success",
      message: "Package added successfully",
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}




module.exports = {
  getPackages,
  updateCurrentPackage,
  getPackageUsage,
  addPackage,
};
