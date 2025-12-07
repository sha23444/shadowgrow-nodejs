var express = require('express');
var router = express.Router();

const DashboardController = require('../../controllers/admin/dashboard');
const DashboardChartController = require('../../controllers/admin/dashboard-charts');
const DashboardGoogleAnalyticsController = require('../../controllers/admin/dashboard-google-analytics');
const AnalyticsSettingsController = require('../../controllers/admin/analytics-settings');
const DashboardGoogleAnalyticsRealtimeController = require('../../controllers/admin/dashboard-google-analytics-realtime');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/recent-users', authenticateUser, DashboardController.getRecentUsers);
router.get('/recent-orders', authenticateUser, DashboardController.getRecentOrders);
router.get('/recent-enquiry', authenticateUser, DashboardController.getRecentEnquiry)
router.get('/recent-request-files', authenticateUser, DashboardController.getRecentRequestFiles)
router.get('/recent-transactions', authenticateUser, DashboardController.getRecentTransactions)
router.get('/top-downloads', authenticateUser, DashboardController.getTopDownloads);
router.get('/recent-downloads', authenticateUser, DashboardController.getRecentDownloads);
router.get('/recent-wallet-transactions', authenticateUser, DashboardController.getRecentWalletTransactions);

router.get('/stats', authenticateUser, DashboardController.getStats);

// CHarts
router.get('/charts/users', authenticateUser,    DashboardChartController.getUsersChartData);
router.get('/charts/orders', authenticateUser, DashboardChartController.getOrdersChartData);
router.get('/charts/downloads', authenticateUser, DashboardChartController.getFileDownloadsChartData);
router.get('/charts/transactions', authenticateUser, DashboardChartController.getTransactionsChartData);

// Google Analytics
router.get('/google-analytics', authenticateUser, DashboardGoogleAnalyticsController.getOverallAnalytics);
router.get('/google-analytics/user-acquisition', authenticateUser, DashboardGoogleAnalyticsController.getUserAcquisition);
router.get('/google-analytics/page-views-over-time', authenticateUser, DashboardGoogleAnalyticsController.getPageViewsOverTime);
router.get('/google-analytics/user-demographics', authenticateUser, DashboardGoogleAnalyticsController.getUserDemographics);
router.get('/google-analytics/top-pages', authenticateUser, DashboardGoogleAnalyticsController.getTopPages);
router.get('/google-analytics/config', authenticateUser, AnalyticsSettingsController.getConfig);
router.post('/google-analytics/config', authenticateUser, AnalyticsSettingsController.updateConfig);
router.post('/google-analytics/config/test', authenticateUser, AnalyticsSettingsController.testConnection);
router.get(
  '/google-analytics/active-users',
  authenticateUser,
  DashboardGoogleAnalyticsRealtimeController.getActiveUsersRealtime,
);
router.get(
  '/google-analytics/active-users/history',
  authenticateUser,
  DashboardGoogleAnalyticsRealtimeController.getActiveUsersHistory,
);

module.exports = router;

