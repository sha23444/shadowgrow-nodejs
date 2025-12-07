const { pool } = require("../../config/database");
const { getRedisClient, clearByPattern } = require("../../config/smart-cache");


async function addPackage(req, res) {
  try {
    const {
      title,
      description,
      price,
      actual_price,
      marketing_text,
      badge,
      period,
      devices,
      is_public = 1,
      is_active = 1,
      is_bandwidth = 0,
      bandwidth = 0,
      bandwidth_files = 0,
      bandwidth_feature = 0,
      is_fair,
      fair = 0,
      fair_files = 0
    } = req.body;

    // check validations

    if (title == '') {
      return res.status(400).json({ message: "Title is required" });
    }

    if (price == '') {
      return res.status(400).json({ message: "Price is required" });
    }

    if (period == '') {
      return res.status(400).json({ message: "Period is required" });
    }

    if (devices == '') {
      return res.status(400).json({ message: "Devices is required" });
    }


    // Insert into the database
    const [result] = await pool.execute(
      `INSERT INTO res_download_packages 
      (title, description, price, actual_price, marketing_text, badge, period, devices, is_public, is_active, 
      is_bandwidth, bandwidth, bandwidth_files, bandwidth_feature,
      is_fair, fair, fair_files) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description,
        price,
        actual_price,
        marketing_text,
        badge,
        period,
        devices,
        is_public,
        is_active,
        is_bandwidth,
        bandwidth,
        bandwidth_files,
        bandwidth_feature,
        is_fair,
        fair,
        fair_files
      ]
    );

    // Clear only package-related Redis cache if enabled
    try {
      await clearByPattern('*packages*');
      console.log('Package-related Redis cache cleared after adding new package');
    } catch (error) {
      console.error('Error clearing package-related Redis cache:', error);
      // Continue with the response even if cache clearing fails
    }

    return res.status(201).json({
      message: "Package added successfully",
      packageId: result.insertId,
    });
  } catch (error) {
    console.error("Error adding package:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}

async function getPackages(req, res) {
  try {
    // Get page and limit from query parameters, with default values
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let packagesQuery;
    let countQuery;
    let queryParams;

    if (search.trim() === '') {
      // If search is empty, don't use LIKE condition
      packagesQuery = `
          SELECT * FROM res_download_packages
          ORDER BY date_create DESC
          LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) AS total FROM res_download_packages`;
      queryParams = [limit, offset];
    } else {
      // If search has value, use LIKE condition
      packagesQuery = `
          SELECT * FROM res_download_packages
          WHERE title LIKE ?
          ORDER BY date_create DESC
          LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) AS total FROM res_download_packages WHERE title LIKE ?`;
      queryParams = [`%${search}%`, limit, offset];
    }

    // Fetch paginated packages from the database
    const [rows] = await pool.execute(packagesQuery, queryParams);

    // Fetch total number of packages for pagination metadata
    const [[{ total }]] = await pool.execute(countQuery, search.trim() === '' ? [] : [`%${search}%`]);

    // Prepare pagination metadata
    const result = {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalResults: total,
      data: rows,
    };

    return res.status(200).json({
      message: "Packages fetched successfully",
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Error fetching packages:", error.message);
    return res
      .status(500)
      .json({ error: "An internal server error occurred." });
  }
}

async function getPackageList(req, res) {
  try {
    const [packages] = await pool.execute(
      `SELECT * FROM res_download_packages WHERE is_active = 1`
    );

    res.status(200).json({
      status: "success",
      data: packages,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


async function deletePackage(req, res) {
  try {
    // Extract packageId from the request parameters
    const { packageId } = req.params;

    // Validate that packageId is a valid number
    if (isNaN(packageId) || packageId <= 0) {
      return res.status(400).json({ error: "Invalid package ID" });
    }

    // Check if the package exists
    const [existingPackage] = await pool.execute(
      `SELECT * FROM res_download_packages WHERE package_id = ?`,
      [packageId]
    );

    if (existingPackage.length === 0) {
      return res.status(404).json({ error: "Package not found" });
    }

    // Delete the package from the database
    await pool.execute(
      `DELETE FROM res_download_packages WHERE package_id = ?`,
      [packageId]
    );

    // 🧹 AUTO-CLEAR CACHE: Clear package cache after deletion
    try {
      await clearByPattern('*packages*');
      console.log('Package-related Redis cache cleared after deleting package');
    } catch (error) {
      console.error('Error clearing package-related Redis cache:', error);
      // Continue with the response even if cache clearing fails
    }

    return res.status(200).json({ message: "Package deleted successfully" });
  } catch (error) {
    console.error("Error deleting package:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}


async function updatePackage(req, res) {
  try {
    const { packageId } = req.params;

    const {
      title,
      description,
      price,
      actual_price,
      marketing_text,
      badge,
      period,
      devices,
      is_public,
      is_active,
      is_bandwidth,
      bandwidth,
      bandwidth_files,
      bandwidth_feature,
      is_fair,
      fair,
      fair_files
    } = req.body;

    // check validations
    if (title == '') {
      return res.status(400).json({ message: "Title is required" });
    }

    if (price == '') {
      return res.status(400).json({ message: "Price is required" });
    }

    if (period == '') {
      return res.status(400).json({ message: "Period is required" });
    }

    if (devices == '') {
      return res.status(400).json({ message: "Devices is required" });
    }

    // Check if package exists
    const [existingPackage] = await pool.execute(
      'SELECT package_id FROM res_download_packages WHERE package_id = ?',
      [packageId]
    );

    if (!existingPackage.length) {
      return res.status(404).json({ error: "Package not found" });
    }

    // Update the package
    await pool.execute(
      `UPDATE res_download_packages 
      SET title = ?,
          description = ?,
          price = ?,
          actual_price = ?,
          marketing_text = ?,
          badge = ?,
          period = ?,
          devices = ?,
          is_public = ?,
          is_active = ?,
          is_bandwidth = ?,
          bandwidth = ?,
          bandwidth_files = ?,
          bandwidth_feature = ?,
          is_fair = ?,
          fair = ?,
          fair_files = ?,
          date_update = CURRENT_TIMESTAMP
      WHERE package_id = ?`,
      [
        title,
        description,
        price,
        actual_price,
        marketing_text,
        badge,
        period,
        devices,
        is_public,
        is_active,
        is_bandwidth,
        bandwidth,
        bandwidth_files,
        bandwidth_feature,
        is_fair,
        fair,
        fair_files,
        packageId
      ]
    );

    // 🧹 AUTO-CLEAR CACHE: Clear package cache after update
    try {
      await clearByPattern('*packages*');
      console.log('Package-related Redis cache cleared after updating package');
    } catch (error) {
      console.error('Error clearing package-related Redis cache:', error);
      // Continue with the response even if cache clearing fails
    }

    return res.status(200).json({
      message: "Package updated successfully",
      packageId: packageId
    });
  } catch (error) {
    console.error("Error updating package:", error.message);
    return res.status(500).json({ error: "An internal server error occurred." });
  }
}

async function changeOrder(req, res) {
  try {
    const { package_id, new_order } = req.body;
    const parsedPackageId = parseInt(package_id, 10);
    const parsedNewOrder = parseInt(new_order, 10);

    // Validate input
    if (isNaN(parsedPackageId) || parsedPackageId <= 0) {
      return res.status(400).json({ error: 'Invalid package ID' });
    }
    if (isNaN(parsedNewOrder) || parsedNewOrder <= 0) {
      return res.status(400).json({ error: 'Invalid new order' });
    }

    const conn = await pool.getConnection();

    try {
      // Fetch current order
      const [packageRows] = await conn.execute(
        'SELECT `order` FROM res_download_packages WHERE package_id = ?',
        [parsedPackageId]
      );

      if (packageRows.length === 0) {
        return res.status(404).json({ error: 'Package not found' });
      }

      const currentOrder = packageRows[0].order;

      if (parsedNewOrder === currentOrder) {
        return res.status(200).json({ message: 'Package is already in the desired order.' });
      }

      await conn.beginTransaction();

      // Shift other packages accordingly
      if (parsedNewOrder < currentOrder) {
        await conn.execute(
          `UPDATE res_download_packages
           SET \`order\` = \`order\` + 1
           WHERE \`order\` >= ? AND \`order\` < ? AND package_id != ?`,
          [parsedNewOrder, currentOrder, parsedPackageId]
        );
      } else {
        await conn.execute(
          `UPDATE res_download_packages
           SET \`order\` = \`order\` - 1
           WHERE \`order\` <= ? AND \`order\` > ? AND package_id != ?`,
          [parsedNewOrder, currentOrder, parsedPackageId]
        );
      }

      // Update target package
      await conn.execute(
        'UPDATE res_download_packages SET `order` = ? WHERE package_id = ?',
        [parsedNewOrder, parsedPackageId]
      );

      // 🧹 AUTO-CLEAR CACHE: Clear package cache after order change
      try {
        await clearByPattern('*packages*');
        console.log('Package-related Redis cache cleared after order change');
      } catch (error) {
        console.error('Error clearing Redis cache:', error);
      }

      await conn.commit();
      res.status(200).json({ message: 'Package order updated successfully.' });

    } catch (err) {
      await conn.rollback();
      console.error('Error changing order:', err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Error in changeOrder:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function getPackageStats(_req, res) {
  try {
    const [[packageCounts]] = await pool.execute(`
      SELECT
        COUNT(*) AS totalPackages,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activePackages,
        SUM(CASE WHEN is_public = 1 THEN 1 ELSE 0 END) AS publicPackages,
        SUM(CASE WHEN is_bandwidth = 1 THEN 1 ELSE 0 END) AS bandwidthPackages,
        SUM(CASE WHEN is_fair = 1 THEN 1 ELSE 0 END) AS fairUsagePackages
      FROM res_download_packages
    `);

    const [[subscriptionCounts]] = await pool.execute(`
      SELECT
        COUNT(*) AS totalSubscriptions,
        SUM(CASE WHEN is_active = 1 AND date_expire > NOW() THEN 1 ELSE 0 END) AS activeSubscriptions,
        SUM(CASE WHEN is_current = 1 THEN 1 ELSE 0 END) AS currentPackages
      FROM res_upackages
    `);

    const [[todaySubscriptions]] = await pool.execute(`
      SELECT COUNT(*) AS todaySubscriptions
      FROM res_upackages
      WHERE DATE(date_create) = CURRENT_DATE()
    `);

    const [[thisWeekSubscriptions]] = await pool.execute(`
      SELECT COUNT(*) AS thisWeekSubscriptions
      FROM res_upackages
      WHERE YEARWEEK(date_create, 1) = YEARWEEK(CURRENT_DATE(), 1)
    `);

    const [[last30Subscriptions]] = await pool.execute(`
      SELECT COUNT(*) AS last30Subscriptions
      FROM res_upackages
      WHERE date_create >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    `);

    return res.status(200).json({
      status: "success",
      data: {
        packages: {
          total: Number(packageCounts?.totalPackages ?? 0),
          active: Number(packageCounts?.activePackages ?? 0),
          public: Number(packageCounts?.publicPackages ?? 0),
          bandwidth: Number(packageCounts?.bandwidthPackages ?? 0),
          fairUsage: Number(packageCounts?.fairUsagePackages ?? 0),
        },
        subscriptions: {
          total: Number(subscriptionCounts?.totalSubscriptions ?? 0),
          active: Number(subscriptionCounts?.activeSubscriptions ?? 0),
          current: Number(subscriptionCounts?.currentPackages ?? 0),
          today: Number(todaySubscriptions?.todaySubscriptions ?? 0),
          thisWeek: Number(thisWeekSubscriptions?.thisWeekSubscriptions ?? 0),
          last30Days: Number(last30Subscriptions?.last30Subscriptions ?? 0),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching package stats:", error);
    return res.status(500).json({
      status: "error",
      message: "An internal server error occurred.",
    });
  }
}


async function searchPackages(req, res) {
  const { search } = req.query;
  
  try {
    let query = `
      SELECT 
        package_id as id,
        title,
        period as duration
      FROM res_download_packages WHERE is_active = 1
    `;
    
    const queryParams = [];
    
    if (search && search.trim()) {
      query += ` WHERE (
        title LIKE ? OR 
        package_id LIKE ?
      )`;
      const searchPattern = `%${search.trim()}%`;
      queryParams.push(searchPattern, searchPattern);
    }
    
    query += ` ORDER BY title ASC LIMIT 50`;
    
    const [packages] = await pool.execute(query, queryParams);
    
    return res.status(200).json({
      status: "success",
      data: packages
    });
  } catch (error) {
    console.error("Search packages error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}

// New function to get package purchase report
async function getPackagePurchaseReport(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      search = '',
      startDate,
      endDate,
      sortBy = 'up.date_create',
      sortOrder = 'DESC',
      packageId
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build the base query for package purchases
    const baseSelect = `
      SELECT 
        up.upackage_id,
        up.user_id,
        up.package_id,
        up.package_title,
        up.bandwidth,
        up.devices,
        up.is_active,
        up.is_current,
        up.date_create,
        up.date_expire,
        dp.title as package_name,
        dp.period,
        dp.price,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        up.package_object
    `;

    const baseFrom = `
      FROM res_upackages up
      LEFT JOIN res_download_packages dp ON up.package_id = dp.package_id
      LEFT JOIN res_users u ON up.user_id = u.user_id
      WHERE 1=1
    `;

    let filters = '';
    const filterParams = [];

    if (search.trim() !== '') {
      filters += ` AND (
        u.username LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.email LIKE ? OR 
        up.package_title LIKE ? OR
        dp.title LIKE ?
      )`;
      
      const searchPattern = `%${search.trim()}%`;
      for (let i = 0; i < 6; i++) {
        filterParams.push(searchPattern);
      }
    }

    if (startDate) {
      filters += ` AND up.date_create >= ?`;
      filterParams.push(startDate);
    }
    
    if (endDate) {
      filters += ` AND up.date_create <= ?`;
      filterParams.push(endDate);
    }

    if (packageId) {
      filters += ` AND up.package_id = ?`;
      filterParams.push(packageId);
    }

    const validSortColumns = [
      'up.date_create', 'dp.price', 'up.package_title', 'dp.title',
      'u.username', 'u.first_name', 'u.last_name'
    ];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'up.date_create';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    const dataQuery = `
      ${baseSelect}
      ${baseFrom}
      ${filters}
      ORDER BY ${sortColumn} ${order}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...filterParams, parseInt(limit), offset];

    const countQuery = `
      SELECT COUNT(*) AS total
      ${baseFrom}
      ${filters}
    `;

    const statsQuery = `
      SELECT
        COUNT(*) AS total_purchases,
        SUM(CASE WHEN up.is_current = 1 THEN 1 ELSE 0 END) AS total_active,
        SUM(CASE WHEN DATE(up.date_create) = CURDATE() THEN 1 ELSE 0 END) AS today_purchases,
        SUM(CASE WHEN YEARWEEK(up.date_create, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END) AS week_purchases,
        SUM(CASE WHEN up.date_create >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS last30_purchases
      ${baseFrom}
      ${filters}
    `;

    // Execute queries
    const [packages] = await pool.execute(dataQuery, dataParams);
    const [countRows] = await pool.execute(countQuery, filterParams);
    const total = countRows?.[0]?.total || 0;
    const [statsRows] = await pool.execute(statsQuery, filterParams);

    // Process packages to extract price from package_object if needed
    const processedPackages = packages.map(pkg => {
      const processed = { ...pkg };
      if ((processed.price === null || processed.price === undefined) && processed.package_object) {
        try {
          const packageData = JSON.parse(processed.package_object);
          processed.price = packageData?.price || 0;
        } catch (e) {
          processed.price = 0;
        }
      }
      processed.price = Number(processed.price || 0);
      processed.bandwidth = Number(processed.bandwidth || 0);
      delete processed.package_object;
      return processed;
    });

    const toNumber = value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };

    const statsRow = statsRows?.[0] || {};
    const stats = {
      totalPurchases: toNumber(statsRow.total_purchases),
      totalActivePackages: toNumber(statsRow.total_active),
      todayPurchases: toNumber(statsRow.today_purchases),
      thisWeekPurchases: toNumber(statsRow.week_purchases),
      last30DaysPurchases: toNumber(statsRow.last30_purchases),
    };

    // Prepare response
    const result = {
      data: processedPackages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      stats,
      status: "success"
    };

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching package purchase report:", error.message);
    return res.status(500).json({ 
      status: "error",
      message: "An internal server error occurred." 
    });
  }
}

module.exports = {
  addPackage,
  getPackages,
  updatePackage,
  deletePackage,
  changeOrder,
  getPackageList,
  searchPackages,
  getPackagePurchaseReport,  // Added new function
  getPackageStats,
};
