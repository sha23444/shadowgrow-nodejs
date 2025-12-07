const { pool } = require("../../config/database");

// Get all error logs with pagination and filtering
async function getErrorLogs(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    
    // Filter parameters
    const errorType = req.query.errorType || null;
    const errorLevel = req.query.errorLevel || null;
    const isResolved = req.query.isResolved || null;
    const search = req.query.search || null;
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    // Build WHERE clause
    const whereClauses = [];
    const queryParams = [];

    if (errorType) {
      whereClauses.push('error_type = ?');
      queryParams.push(errorType);
    }

    if (errorLevel) {
      whereClauses.push('error_level = ?');
      queryParams.push(errorLevel);
    }

    if (isResolved !== null) {
      whereClauses.push('is_resolved = ?');
      queryParams.push(isResolved === 'true' ? 1 : 0);
    }

    if (search) {
      whereClauses.push('(error_message LIKE ? OR user_email LIKE ? OR error_details LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }

    if (startDate) {
      whereClauses.push('created_at >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClauses.push('created_at <= ?');
      queryParams.push(endDate + ' 23:59:59');
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM res_error_logs ${whereSQL}`;
    const [[{ total }]] = await pool.execute(countQuery, queryParams);

    // Main query
    const logsQuery = `
      SELECT 
        log_id,
        error_type,
        error_level,
        error_message,
        error_details,
        user_id,
        user_email,
        ip_address,
        user_agent,
        endpoint,
        method,
        status_code,
        created_at,
        is_resolved,
        resolved_at,
        resolved_by,
        resolution_notes
      FROM res_error_logs 
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logsParams = [...queryParams, limit, offset];
    const [logs] = await pool.execute(logsQuery, logsParams);

    // Parse error_details JSON
    const formattedLogs = logs.map(log => ({
      ...log,
      error_details: log.error_details ? JSON.parse(log.error_details) : null,
      is_resolved: Boolean(log.is_resolved)
    }));

    return res.status(200).json({
      status: "success",
      response: {
        data: formattedLogs,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    console.error("Error fetching error logs:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

// Get error log statistics
async function getErrorLogStats(req, res) {
  try {
    // Get counts by error type
    const [errorTypeStats] = await pool.execute(`
      SELECT error_type, COUNT(*) as count
      FROM res_error_logs
      GROUP BY error_type
      ORDER BY count DESC
    `);

    // Get counts by error level
    const [errorLevelStats] = await pool.execute(`
      SELECT error_level, COUNT(*) as count
      FROM res_error_logs
      GROUP BY error_level
      ORDER BY count DESC
    `);

    // Get resolved vs unresolved counts
    const [resolutionStats] = await pool.execute(`
      SELECT 
        is_resolved,
        COUNT(*) as count
      FROM res_error_logs
      GROUP BY is_resolved
    `);

    // Get recent error trends (last 7 days)
    const [recentTrends] = await pool.execute(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM res_error_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Get total counts
    const [[{ totalErrors }]] = await pool.execute('SELECT COUNT(*) as totalErrors FROM res_error_logs');
    const [[{ resolvedErrors }]] = await pool.execute('SELECT COUNT(*) as resolvedErrors FROM res_error_logs WHERE is_resolved = 1');
    const [[{ unresolvedErrors }]] = await pool.execute('SELECT COUNT(*) as unresolvedErrors FROM res_error_logs WHERE is_resolved = 0');

    return res.status(200).json({
      status: "success",
      data: {
        errorTypeStats,
        errorLevelStats,
        resolutionStats,
        recentTrends,
        summary: {
          totalErrors,
          resolvedErrors,
          unresolvedErrors,
          resolutionRate: totalErrors > 0 ? ((resolvedErrors / totalErrors) * 100).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    console.error("Error fetching error log stats:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

// Get single error log by ID
async function getErrorLogById(req, res) {
  try {
    const { logId } = req.params;

    const [logs] = await pool.execute(`
      SELECT 
        log_id,
        error_type,
        error_level,
        error_message,
        error_details,
        user_id,
        user_email,
        ip_address,
        user_agent,
        endpoint,
        method,
        status_code,
        created_at,
        is_resolved,
        resolved_at,
        resolved_by,
        resolution_notes
      FROM res_error_logs 
      WHERE log_id = ?
    `, [logId]);

    if (logs.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Error log not found",
      });
    }

    const log = logs[0];
    log.error_details = log.error_details ? JSON.parse(log.error_details) : null;
    log.is_resolved = Boolean(log.is_resolved);

    return res.status(200).json({
      status: "success",
      data: log,
    });
  } catch (error) {
    console.error("Error fetching error log:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

// Mark error log as resolved
async function resolveErrorLog(req, res) {
  try {
    const { logId } = req.params;
    const { resolutionNotes } = req.body;
    const resolvedBy = req.user?.username || 'admin'; // Assuming you have user info in req.user

    const [result] = await pool.execute(`
      UPDATE res_error_logs 
      SET is_resolved = 1, resolved_at = NOW(), resolved_by = ?, resolution_notes = ?
      WHERE log_id = ?
    `, [resolvedBy, resolutionNotes, logId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Error log not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Error log marked as resolved",
    });
  } catch (error) {
    console.error("Error resolving error log:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

// Delete error log
async function deleteErrorLog(req, res) {
  try {
    const { logId } = req.params;

    const [result] = await pool.execute(`
      DELETE FROM res_error_logs 
      WHERE log_id = ?
    `, [logId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Error log not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Error log deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting error log:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

// Bulk delete old error logs
async function bulkDeleteOldLogs(req, res) {
  try {
    const { days = 30 } = req.body; // Default to 30 days

    const [result] = await pool.execute(`
      DELETE FROM res_error_logs 
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);

    return res.status(200).json({
      status: "success",
      message: `${result.affectedRows} old error logs deleted successfully`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error("Error bulk deleting old logs:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

module.exports = {
  getErrorLogs,
  getErrorLogStats,
  getErrorLogById,
  resolveErrorLog,
  deleteErrorLog,
  bulkDeleteOldLogs
}; 