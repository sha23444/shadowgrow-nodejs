const express = require('express');
const router = express.Router();
const authenticateAdmin = require('../../middlewars/authenticateAdmin');
const bunnyController = require('../../controllers/admin/bunny');

// All routes require admin authentication
router.use(authenticateAdmin);

// Settings
router.get('/settings', bunnyController.getSettings);
router.post('/settings', bunnyController.updateSettings);
router.post('/test-connection', bunnyController.testConnection);

module.exports = router;

