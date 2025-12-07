var express = require('express');
var router = express.Router();
const databaseDumpController = require("../../controllers/admin/databaseDump");
const authenticateAdmin = require("../../middlewars/authenticateAdmin");

// Apply admin authentication middleware to all routes
router.use(authenticateAdmin);

// Create database dump and upload to Google Drive
router.post("/create", databaseDumpController.createDatabaseDump);

// List all database dumps with pagination
router.get("/list", databaseDumpController.listDatabaseDumps);

// Get specific database dump details
router.get("/details/:id", databaseDumpController.getDatabaseDumpDetails);

// Download database dump from Google Drive
router.get("/download/:id", databaseDumpController.downloadDatabaseDump);

// Delete database dump from both Google Drive and database
router.delete("/delete/:id", databaseDumpController.deleteDatabaseDump);

module.exports = router;
