const { pool } = require("../../../config/database");
const { decrypt } = require("../../utils/encryption");


async function getDownloadsHistory(req, res) {
  const { id } = req.user;
  const { page = 1, limit = 10, search = '' } = req.query;

  const offset = (page - 1) * limit;

  try {
    // Build WHERE clause for search
    let whereClause = 'WHERE u.user_id = ?';
    let queryParams = [id];
    
    if (search) {
      whereClause += ' AND u.file_title LIKE ?';
      queryParams.push(`%${search}%`);
    }

    const [rows] = await pool.execute(
      `
      SELECT 
        u.user_id, 
        u.file_id, 
        u.hash_token, 
        u.udownload_id,  
        u.file_title, 
        u.file_size, 
        u.created_at, 
        u.expired_at,
        f.password,
        (u.expired_at > NOW()) AS canDownload
      FROM res_udownloads u
      INNER JOIN res_files f ON u.file_id = f.file_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    const result = rows.map((row) => ({
      ...row,
      canDownload: !!row.canDownload,
    }));

    // Get pagination count and all statistics in one optimized query
    const [statsResult] = await pool.execute(
      `
      SELECT 
        COUNT(*) AS total_downloads,
        SUM(file_size) AS total_download_size,
        COUNT(CASE WHEN expired_at > NOW() THEN 1 END) AS active_downloads,
        SUM(CASE WHEN expired_at > NOW() THEN file_size ELSE 0 END) AS active_download_size,
        COUNT(CASE WHEN expired_at < NOW() THEN 1 END) AS expired_downloads,
        SUM(CASE WHEN expired_at < NOW() THEN file_size ELSE 0 END) AS expired_download_size,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS today_downloads,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN file_size ELSE 0 END) AS today_download_size
      FROM res_udownloads
      ${whereClause.replace('u.user_id', 'user_id').replace('u.file_title', 'file_title')}
      `,
      queryParams
    );

    const stats = statsResult[0];
    const total = stats.total_downloads;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      status: "success",
      response: {
        data: result,
        perPage: parseInt(limit),
        totalCount: total,
        totalPages,
        currentPage: parseInt(page),
        statistics: {
          totalDownloads: stats.total_downloads || 0,
          totalDownloadSize: stats.total_download_size || 0,
          activeDownloads: stats.active_downloads || 0,
          activeDownloadsSize: stats.active_download_size || 0,
          expiredDownloads: stats.expired_downloads || 0,
          expiredDownloadsSize: stats.expired_download_size || 0,
          todayDownloads: stats.today_downloads || 0,
          todayDownloadsSize: stats.today_download_size || 0,
        },
      },
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function downloadFile(req, res) {
  const { fileId } = req.params;
  const { id } = req.user;

  try {
    // Check if the user has a valid package
    const [userPackage] = await pool.execute(
      `SELECT * FROM res_upackages WHERE user_id = ?`,
      [id]
    );

    if (!userPackage.length) {
      return res.status(400).json({ error: "No valid package found" });
    }

    // Check if the user has an active package
    const [validPackage] = await pool.execute(
      "SELECT * FROM res_upackages WHERE user_id = ? AND date_expire > NOW() LIMIT 1",
      [id]
    );

    if (!validPackage.length) {
      return res.status(400).json({ error: "No active package found" });
    }

    // Check the current package
    const [currentPackage] = await pool.execute(
      `SELECT * FROM res_upackages WHERE user_id = ? AND is_current = 1 AND date_expire > NOW() LIMIT 1`,
      [id]
    );

    if (!currentPackage.length) {
      return res.status(400).json({ error: "No current package found" });
    }

    // Get package details based on current package id (including daily fair usage)
    const [packageDetails] = await pool.execute(
      `SELECT * FROM res_download_packages WHERE package_id = ?`,
      [currentPackage[0].package_id]
    );

    const dailyDownloadLimit = packageDetails[0].fair_files || 0; // Add fair usage limit from package

    // Count total bandwidth used by the user for the current package
    const [totalBandwidth] = await pool.execute(
      `SELECT SUM(res_files.size) as total_bandwidth 
       FROM res_udownloads 
       LEFT JOIN res_files ON res_udownloads.file_id = res_files.file_id 
       WHERE res_udownloads.user_id = ? AND res_udownloads.upackage_id = ?`,
      [id, currentPackage[0].package_id]
    );

    // Check the file size of the requested file
    const [file] = await pool.execute(
      `SELECT * FROM res_files WHERE file_id = ?`,
      [fileId]
    );

    if (!file.length) {
      return res.status(404).json({ error: "File not found" });
    }

    // Get the size of the file the user is trying to download
    const fileSize = file[0].size;

    // Check the total bandwidth used and compare it with the package's limit
    const remainingBandwidth =
      packageDetails[0].bandwidth - (totalBandwidth[0].total_bandwidth || 0);

    if (remainingBandwidth < fileSize) {
      return res.status(400).json({
        error: "Bandwidth limit exceeded. Unable to download the file.",
      });
    }

    // Fair usage limit: check how many files the user has downloaded in the last 24 hours
    const [dailyDownloads] = await pool.execute(
      `SELECT COUNT(*) AS daily_download_count 
       FROM res_udownloads 
       WHERE user_id = ? 
       AND upackage_id = ? 
       AND created_at > NOW() - INTERVAL 1 DAY`,
      [id, currentPackage[0].package_id]
    );

    // Check if the user has exceeded their daily download limit
    if (dailyDownloads[0].daily_download_count >= dailyDownloadLimit) {
      return res.status(400).json({
        error: `Download limit reached. You can only download ${dailyDownloadLimit} files per day.`,
      });
    }

    // Generate the download link with token
    const fileLink = await generateDownloadLink(
      fileId,
      id,
      currentPackage[0].package_id
    );

    // Return the download link
    res.status(200).json({
      link: fileLink,
      status: "success",
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function generateDownloadLink(req, res) {
  const { id } = req.user;
  const userId = id;

  const { file_id, order_id = null, package_id = null } = req.body;

  try {
    // Check if the file exists
    const [rows] = await pool.execute(
      "SELECT * FROM res_files WHERE file_id = ?",
      [file_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "File not found",
      });
    }

    // Check if already added to the user downloads matching order_id, user_id, and file_id
    const [isAlreadyDownloaded] = await pool.execute(
      `SELECT * FROM res_udownloads WHERE user_id = ? AND file_id = ? AND order_id = ?`,
      [userId, file_id, order_id]
    );

    // If a record exists, return the old token
    if (isAlreadyDownloaded.length > 0) {
      return res.status(200).json({
        status: "success",
        link: `${process.env.APP_BASE_URL}/download?token=${isAlreadyDownloaded[0].hash_token}`,
        isDownloaded: true,
      });
    }

    // Generate a new token and expiration time
    const token = crypto.randomBytes(32).toString("hex");
    const expirationTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours
    const expirationDate = new Date(expirationTime * 1000); // Convert to Date object

    // Insert a new entry for the user download
    await pool.execute(
      `INSERT INTO res_udownloads (user_id, file_id, upackage_id, order_id, hash_token, expired_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, file_id, package_id, order_id, token, expirationDate]
    );

    // Return the newly generated download link
    return res.status(200).json({
      status: "success",
      link: `${process.env.APP_BASE_URL}/download?token=${token}`,
      isDownloaded: false,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function getFilePassword(req, res) {
  const { fileId } = req.params;


  try {
    // Query the database to get the file password
    const [rows] = await pool.execute(
      "SELECT password FROM res_files WHERE file_id = ?",
      [fileId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "File not found",
      });
    }

    const file = rows[0];
    let decryptedPassword = null;
    if (file.password && file.password !== "") {
      decryptedPassword = decrypt(file.password);
    }

    return res.status(200).json({
      status: "success",
      password: decryptedPassword,
    });
  } catch (error) {
    console.error("Error fetching file password:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function getPaidFilesList(req, res) {
  const { id } = req.user;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";
  const status = req.query.status || ""; // 'active', 'expired', or empty for all

  try {
    // Build the WHERE clause for filtering
    let whereClause = "WHERE uf.user_id = ?";
    let queryParams = [id];

    if (search) {
      whereClause += " AND (rf.title LIKE ? OR rf.description LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Add status filter
    if (status === 'active') {
      whereClause += " AND (ud.expired_at IS NULL OR ud.expired_at > NOW())";
    } else if (status === 'expired') {
      whereClause += " AND ud.expired_at IS NOT NULL AND ud.expired_at <= NOW()";
    }

    // Fetch total count for pagination - Fixed to properly count user's files
    const [[{ total }]] = await pool.execute(
      `
        SELECT COUNT(DISTINCT uf.ufile_id) as total
        FROM res_ufiles uf
        INNER JOIN res_files rf ON uf.file_id = rf.file_id
        INNER JOIN res_orders o ON uf.order_id = o.order_id
        LEFT JOIN res_udownloads ud ON uf.file_id = ud.file_id AND uf.order_id = ud.order_id AND uf.user_id = ud.user_id
        ${whereClause}
      `,
      queryParams
    );

    // Fetch statistics - Fixed to properly filter by user_id
    const [[stats]] = await pool.execute(
      `
        SELECT 
          COUNT(DISTINCT uf.ufile_id) as totalFiles,
          COUNT(CASE WHEN ud.expired_at IS NULL OR ud.expired_at > NOW() THEN 1 END) as activeFiles,
          COUNT(CASE WHEN ud.expired_at IS NOT NULL AND ud.expired_at <= NOW() THEN 1 END) as expiredFiles,
          COALESCE(SUM(rf.size), 0) as totalSize,
          COALESCE(SUM(CASE WHEN ud.expired_at IS NULL OR ud.expired_at > NOW() THEN rf.size ELSE 0 END), 0) as activeSize
        FROM res_ufiles uf
        INNER JOIN res_files rf ON uf.file_id = rf.file_id
        INNER JOIN res_orders o ON uf.order_id = o.order_id
        LEFT JOIN res_udownloads ud ON uf.file_id = ud.file_id AND uf.order_id = ud.order_id AND uf.user_id = ud.user_id
        WHERE uf.user_id = ?
      `,
      [id]
    );

    // Fetch paginated paid files with details - Added currency information
    const [files] = await pool.execute(
      `
        SELECT 
          uf.ufile_id,
          uf.file_id,
          uf.order_id,
          uf.user_id,
          uf.price,
          uf.is_active,
          uf.created_at as purchase_date,
          rf.title,
          rf.description,
          rf.thumbnail,
          rf.size,
          rf.slug,
          rf.password,
          rf.folder_id,
          o.order_id as order_reference,
          o.amount_paid,
          o.order_status,
          o.payment_status,
          o.currency,
          ud.hash_token,
          ud.expired_at,
          ud.udownload_id,
          CASE 
            WHEN ud.expired_at IS NULL THEN 'unlimited'
            WHEN ud.expired_at > NOW() THEN 'active'
            ELSE 'expired'
          END as download_status,
          CASE 
            WHEN ud.expired_at IS NULL OR ud.expired_at > NOW() THEN 1
            ELSE 0
          END as can_download
        FROM res_ufiles uf
        INNER JOIN res_files rf ON uf.file_id = rf.file_id
        INNER JOIN res_orders o ON uf.order_id = o.order_id
        LEFT JOIN res_udownloads ud ON uf.file_id = ud.file_id AND uf.order_id = ud.order_id AND uf.user_id = ud.user_id
        ${whereClause}
        ORDER BY uf.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, limit, offset]
    );

    // Process files to add additional information
    const processedFiles = files.map(file => {
      // Decrypt password if exists
      let decryptedPassword = null;
      if (file.password && file.password !== "") {
        try {
          decryptedPassword = decrypt(file.password);
        } catch (error) {
          console.error("Password decryption error:", error);
        }
      }

      // Format file size
      const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      // Calculate remaining time for active downloads
      let remainingTime = null;
      if (file.download_status === 'active' && file.expired_at) {
        const now = new Date();
        const expiredAt = new Date(file.expired_at);
        const diffMs = expiredAt - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        remainingTime = `${diffHours}h ${diffMinutes}m`;
      }

      // Construct download URL using token if available, otherwise use API endpoint
      let downloadUrl = null;
      if (file.can_download) {
        if (file.hash_token && file.download_status === 'active') {
          // Use token-based download URL
          downloadUrl = `/download?token=${file.hash_token}`;
        } else {
          // Fallback to API endpoint if no token or token expired
          downloadUrl = `/api/users/account/downloads/download-file/${file.file_id}`;
        }
      }

      return {
        ...file,
        password: decryptedPassword,
        formattedSize: formatFileSize(file.size),
        remainingTime,
        downloadUrl: downloadUrl,
        passwordUrl: `/api/users/account/downloads/file-password/${file.file_id}`,
        // Add order information with currency
        orderInfo: {
          orderId: file.order_reference,
          amountPaid: file.amount_paid,
          currency: file.currency,
          orderStatus: file.order_status,
          paymentStatus: file.payment_status,
          purchaseDate: file.purchase_date
        }
      };
    });

    // Helper function for formatting file size
    function formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Construct the paginated response
    const result = {
      data: processedFiles,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      statistics: {
        totalFiles: stats.totalFiles || 0,
        activeFiles: stats.activeFiles || 0,
        expiredFiles: stats.expiredFiles || 0,
        totalSize: stats.totalSize || 0,
        activeSize: stats.activeSize || 0,
        formattedTotalSize: formatFileSize(stats.totalSize || 0),
        formattedActiveSize: formatFileSize(stats.activeSize || 0)
      },
    };

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


module.exports = {
  getDownloadsHistory,
  downloadFile,
  getFilePassword,
  getPaidFilesList
};
