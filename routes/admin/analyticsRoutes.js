const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/admin/analyticsController');

// Define routes
router.get('/', analyticsController.getReport);
router.get('/live-user', analyticsController.getLiveUsers);
router.get('/live-country', analyticsController.getLiveUsersByCountry);
router.get('/page-view', analyticsController.getPageViewsByDate)

module.exports = router;
