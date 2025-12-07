const { pool } = require("../../../config/database");


async function getDownloadsHistory(req, res) {
  const { page = 1, limit = 10, user_id, search = '' } = req.query;

  try {
    let query = `
      SELECT ud.*, 
             (ud.expired_at > NOW()) AS canDownload,
             u.username
      FROM res_udownloads ud
      LEFT JOIN res_users u ON ud.user_id = u.user_id
      WHERE 1=1
    `;
    let countQuery = `
      SELECT COUNT(*) AS total
      FROM res_udownloads ud
      LEFT JOIN res_users u ON ud.user_id = u.user_id
      WHERE 1=1
    `;
    let queryParams = [];
    let countParams = [];

    // Add user_id filter if provided
    if (user_id) {
      query += ` AND ud.user_id = ?`;
      countQuery += ` AND ud.user_id = ?`;
      queryParams.push(user_id);
      countParams.push(user_id);
    }

    // Add search condition if search term is provided
    if (search.trim() !== '') {
      // Split search string into words
      const searchWords = search.trim().split(/\s+/);
      
      // Build search conditions for each word
      const searchConditions = searchWords.map(word => {
        const searchTerm = `%${word}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm);
        return `(ud.file_title LIKE ? OR u.username LIKE ? OR ud.file_title LIKE ?)`;
      });

      // Join all conditions with AND
      query += ` AND (${searchConditions.join(' AND ')})`;
      countQuery += ` AND (${searchConditions.join(' AND ')})`;
    }

    // Add ordering and pagination
    query += ` ORDER BY ud.created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    // Execute queries
    const [rows] = await pool.execute(query, queryParams);
    const [countResult] = await pool.execute(countQuery, countParams);

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


module.exports = {
  getDownloadsHistory
};
