const express = require('express');
const router = express.Router();
const dashboardAnalyticsController = require('../../controllers/admin/dashboard-google-analytics');
const authenticateUser = require('../../middlewars/authenticateAdmin');

// Get overall analytics data
router.get('/overall', authenticateUser, dashboardAnalyticsController.getOverallAnalytics);

// Get user acquisition data
router.get('/acquisition', authenticateUser, dashboardAnalyticsController.getUserAcquisition);

// Get page views over time
router.get('/page-views', authenticateUser, dashboardAnalyticsController.getPageViewsOverTime);

// Get user demographics
router.get('/demographics', authenticateUser, dashboardAnalyticsController.getUserDemographics);

// Get top pages
router.get('/top-pages', authenticateUser, dashboardAnalyticsController.getTopPages);

module.exports = router; 