const express = require("express");
const router = express.Router();
const {
  getErrorLogs,
  getErrorLogStats,
  getErrorLogById,
  resolveErrorLog,
  deleteErrorLog,
  bulkDeleteOldLogs
} = require("../../controllers/admin/errorLogs");

// Get all error logs with pagination and filtering
router.get("/", getErrorLogs);

// Get error log statistics
router.get("/stats", getErrorLogStats);

// Get single error log by ID
router.get("/:logId", getErrorLogById);

// Mark error log as resolved
router.patch("/:logId/resolve", resolveErrorLog);

// Delete single error log
router.delete("/:logId", deleteErrorLog);

// Bulk delete old error logs
router.delete("/bulk/old", bulkDeleteOldLogs);

module.exports = router; 