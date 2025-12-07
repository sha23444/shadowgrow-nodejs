const { pool } = require("../../config/database");

async function getDownloadsHistory(req, res) {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
      
        let query = `
          SELECT res_udownloads.*, u.username,
          (res_udownloads.expired_at > NOW()) AS canDownload
          FROM res_udownloads
          INNER JOIN res_users as u ON res_udownloads.user_id = u.user_id
          WHERE 1=1
        `;
        let countQuery = `
          SELECT COUNT(*) AS total
          FROM res_udownloads
          INNER JOIN res_users as u ON res_udownloads.user_id = u.user_id
          WHERE 1=1
        `;
        let queryParams = [];
        let countParams = [];

        // Add search condition if search term is provided
        if (search.trim() !== '') {
            // Split search string into words
            const searchWords = search.trim().split(/\s+/);
            
            // Build search conditions for each word
            const searchConditions = searchWords.map(word => {
                const searchTerm = `%${word}%`;
                queryParams.push(searchTerm, searchTerm, searchTerm);
                countParams.push(searchTerm, searchTerm, searchTerm);
                return `(res_udownloads.file_title LIKE ? OR u.username LIKE ? OR res_udownloads.file_title LIKE ?)`;
            });

            // Join all conditions with AND
            query += ` AND (${searchConditions.join(' AND ')})`;
            countQuery += ` AND (${searchConditions.join(' AND ')})`;
        }

        // Add ordering and pagination
        query += ` ORDER BY res_udownloads.created_at DESC LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        // Execute queries
        const [rows] = await pool.execute(query, queryParams);
        const [countResult] = await pool.execute(countQuery, countParams);
        const [statsRows] = await pool.execute(`
          SELECT
            COUNT(*) AS total_downloads,
            COUNT(DISTINCT file_id) AS total_files,
            COALESCE(SUM(file_size), 0) AS total_bandwidth,
            SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_downloads,
            COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN file_size ELSE 0 END), 0) AS today_bandwidth,
            SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END) AS week_downloads,
            COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN file_size ELSE 0 END), 0) AS week_bandwidth,
            SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS last30_downloads,
            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN file_size ELSE 0 END), 0) AS last30_bandwidth,
            COUNT(DISTINCT CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN file_id END) AS last30_files,
            COUNT(DISTINCT CASE WHEN DATE(created_at) = CURDATE() THEN file_id END) AS today_files,
            COUNT(DISTINCT CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN file_id END) AS week_files
          FROM res_udownloads
        `);

        const toNumber = value => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : 0;
        };

        const statsRow = statsRows && statsRows.length ? statsRows[0] : {};
        const stats = {
            total: {
                downloads: toNumber(statsRow?.total_downloads),
                files: toNumber(statsRow?.total_files),
                bandwidth: toNumber(statsRow?.total_bandwidth),
            },
            today: {
                downloads: toNumber(statsRow?.today_downloads),
                bandwidth: toNumber(statsRow?.today_bandwidth),
                files: toNumber(statsRow?.today_files),
            },
            thisWeek: {
                downloads: toNumber(statsRow?.week_downloads),
                bandwidth: toNumber(statsRow?.week_bandwidth),
                files: toNumber(statsRow?.week_files),
            },
            last30Days: {
                downloads: toNumber(statsRow?.last30_downloads),
                bandwidth: toNumber(statsRow?.last30_bandwidth),
                files: toNumber(statsRow?.last30_files),
            },
        };

        // Ensure canDownload is returned as true/false in JavaScript
        const result = rows.map((row) => ({
            ...row,
            canDownload: !!row.canDownload,
        }));
      
        const total = countResult[0].total;
        const response = {
            data: result,
            perPage: parseInt(limit),
            totalCount: total,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            stats,
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

async function getFileDownloadHistory(req, res) {
  try {
      const { page = 1, limit = 10, file_id, search = "" } = req.query;

      const [file] = await pool.execute(`
        SELECT title, downloads, visits FROM res_files WHERE file_id = ?
        `, [file_id]);

      const [rows] = await pool.execute( `
        SELECT res_udownloads.*,  u.username,
        (res_udownloads.expired_at > NOW()) AS canDownload
        FROM res_udownloads
        INNER JOIN res_users as u ON res_udownloads.user_id = u.user_id
        WHERE res_udownloads.file_id = ? AND (u.username LIKE ? OR res_udownloads.file_title LIKE ?)
        ORDER BY res_udownloads.created_at DESC
        LIMIT ? OFFSET ?
        `,
        [file_id, `%${search}%`, `%${search}%`, limit, (page - 1) * limit]
      );
        // Ensure canDownload is returned as true/false in JavaScript
        const result = rows.map((row) => ({
          ...row,
          canDownload: !!row.canDownload, // Convert 1/0 to true/false
        }));
    
        // Get the total count of downloads for pagination
        const [countResult] = await pool.execute(
          `
          SELECT COUNT(*) AS total
          FROM res_udownloads 
          INNER JOIN res_users as u ON res_udownloads.user_id = u.user_id
          WHERE res_udownloads.file_id = ? AND (u.username LIKE ? OR res_udownloads.file_title LIKE ?)
          `, [file_id, `%${search}%`, `%${search}%`],
        );
    
        const total = countResult[0].total;
        const response = {
          ...file[0],
          data: result,
          perPage: limit,
          totalCount: total,
          totalPages: Math.ceil(total / limit),
          currentPage: page, // Pass the correct current page
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

async function deleteDownloadHistory(req, res) {
  try {
    const { downloadId } = req.params;

    const [rows] = await pool.execute(`
      DELETE FROM res_udownloads WHERE udownload_id = ?
      `, [downloadId]);

    if(rows.affectedRows > 0){
      res.status(200).json({ message: "Download history deleted successfully" });
    }else{
      res.status(400).json({ message: "Download history not found" });
    }
      
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


module.exports = {getDownloadsHistory, getFileDownloadHistory, deleteDownloadHistory}