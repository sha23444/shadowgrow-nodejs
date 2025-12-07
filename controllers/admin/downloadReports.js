const { pool } = require("../../config/database");
const ExcelJS = require("exceljs");
const path = require("path");

async function downloadHistoryExcel(req, res) {
  try {
    // Extract query parameters
    const { 
      search = '', 
      startDate, 
      endDate,
      fileType, // 'file' or 'package'
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    // Build the base query
    let query = `
      SELECT 
        res_udownloads.*,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        (res_udownloads.expired_at > NOW()) AS canDownload
      FROM res_udownloads
      INNER JOIN res_users as u ON res_udownloads.user_id = u.user_id
      WHERE 1=1
    `;
    
    let queryParams = [];

    // Add search condition if search term is provided
    if (search.trim() !== '') {
      // Split search string into words
      const searchWords = search.trim().split(/\s+/);
      
      // Build search conditions for each word
      const searchConditions = searchWords.map(word => {
        const searchTerm = `%${word}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
        return `(res_udownloads.file_title LIKE ? OR u.username LIKE ? OR res_udownloads.ip_address LIKE ?)`;
      });

      // Join all conditions with AND
      query += ` AND (${searchConditions.join(' AND ')})`;
    }

    // Add date range filter
    if (startDate) {
      query += ` AND res_udownloads.created_at >= ?`;
      queryParams.push(startDate);
    }
    
    if (endDate) {
      query += ` AND res_udownloads.created_at <= ?`;
      queryParams.push(endDate);
    }

    // Add file type filter
    if (fileType === 'file') {
      query += ` AND res_udownloads.item_type = 1`;
    } else if (fileType === 'package') {
      query += ` AND res_udownloads.item_type = 2`;
    }

    // Add ordering
    const validSortColumns = ['created_at', 'file_title', 'username', 'ip_address'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    query += ` ORDER BY res_udownloads.${sortColumn} ${order}`;

    // Execute query
    const [rows] = await pool.execute(query, queryParams);

    // Process the data
    const processedData = rows.map(row => ({
      ...row,
      canDownload: !!row.canDownload
    }));

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Download History");

    // Define columns
    worksheet.columns = [
      { header: "ID", key: "udownload_id", width: 10 },
      { header: "Username", key: "username", width: 20 },
      { header: "Full Name", key: "full_name", width: 25 },
      { header: "Email", key: "email", width: 30 },
      { header: "File/Package Title", key: "file_title", width: 35 },
      { header: "Item Type", key: "item_type", width: 15 },
      { header: "IP Address", key: "ip_address", width: 20 },
      { header: "User Agent", key: "user_agent", width: 40 },
      { header: "Downloaded At", key: "created_at", width: 25 },
      { header: "Expires At", key: "expired_at", width: 25 },
      { header: "Can Download", key: "canDownload", width: 15 }
    ];

    // Add data to worksheet
    processedData.forEach(row => {
      worksheet.addRow({
        udownload_id: row.udownload_id,
        username: row.username,
        full_name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        file_title: row.file_title,
        item_type: row.item_type === 1 ? 'File' : 'Package',
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        created_at: row.created_at,
        expired_at: row.expired_at,
        canDownload: row.canDownload ? 'Yes' : 'No'
      });
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `download-history-${timestamp}.xlsx`;

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
    console.error("Error generating download history Excel:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate Excel file"
    });
  }
}

async function downloadPackagesExcel(req, res) {
  try {
    // Extract query parameters
    const { 
      search = '', 
      startDate, 
      endDate,
      status, // 'active', 'inactive'
      sortBy = 'date_create',
      sortOrder = 'DESC'
    } = req.query;

    // Build the base query
    let query = `
      SELECT 
        res_upackages.*,
        res_download_packages.*,
        COUNT(du.udownload_id) as total_downloads
      FROM res_upackages
      LEFT JOIN res_download_packages 
        ON res_upackages.package_id = res_download_packages.package_id
      LEFT JOIN res_udownloads du 
        ON du.item_id = res_upackages.upackage_id AND du.item_type = 2
      WHERE 1=1
    `;
    
    let queryParams = [];
    let groupByClause = " GROUP BY res_upackages.upackage_id";

    // Add search condition if search term is provided
    if (search.trim() !== '') {
      query += ` AND (res_upackages.title LIKE ? OR res_upackages.description LIKE ?)`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Add date range filter
    if (startDate) {
      query += ` AND res_upackages.date_create >= ?`;
      queryParams.push(startDate);
    }
    
    if (endDate) {
      query += ` AND res_upackages.date_create <= ?`;
      queryParams.push(endDate);
    }

    // Add status filter
    if (status === 'active') {
      query += ` AND res_upackages.is_active = 1`;
    } else if (status === 'inactive') {
      query += ` AND res_upackages.is_active = 0`;
    }

    // Add grouping
    query += groupByClause;

    // Add ordering
    const validSortColumns = ['date_create', 'title', 'price', 'total_downloads'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'date_create';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    query += ` ORDER BY res_upackages.${sortColumn} ${order}`;

    // Execute query
    const [rows] = await pool.execute(query, queryParams);

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Download Packages");

    // Define columns
    worksheet.columns = [
      { header: "ID", key: "upackage_id", width: 10 },
      { header: "Title", key: "title", width: 30 },
      { header: "Description", key: "description", width: 40 },
      { header: "Price", key: "price", width: 15 },
      { header: "Downloads", key: "downloads", width: 15 },
      { header: "Total Downloads", key: "total_downloads", width: 20 },
      { header: "Is Active", key: "is_active", width: 15 },
      { header: "Is New", key: "is_new", width: 15 },
      { header: "Is Featured", key: "is_featured", width: 15 },
      { header: "Created At", key: "date_create", width: 25 },
      { header: "Updated At", key: "date_update", width: 25 }
    ];

    // Add data to worksheet
    rows.forEach(row => {
      worksheet.addRow({
        upackage_id: row.upackage_id,
        title: row.title,
        description: row.description,
        price: row.price,
        downloads: row.downloads,
        total_downloads: row.total_downloads || 0,
        is_active: row.is_active ? 'Yes' : 'No',
        is_new: row.is_new ? 'Yes' : 'No',
        is_featured: row.is_featured ? 'Yes' : 'No',
        date_create: row.date_create,
        date_update: row.date_update
      });
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `download-packages-${timestamp}.xlsx`;

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
    console.error("Error generating download packages Excel:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate Excel file"
    });
  }
}

module.exports = {
  downloadHistoryExcel,
  downloadPackagesExcel
};