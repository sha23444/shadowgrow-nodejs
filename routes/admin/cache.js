// routes/cacheRoutes.js
const express = require("express");
const router = express.Router();
const cacheController = require("../../controllers/admin/cache");

// Route to clear all caches
router.get("/clear-all", cacheController.clearAllCaches);

module.exports = router;
