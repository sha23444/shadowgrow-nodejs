const express = require('express');
const router = express.Router();
const { 
    submitNewUrlsToGoogle, 
    checkCrawlStatus, 
    getSubmissionLogs,
    submitSitemapController,
    getCrawlStats,
    triggerManualCrawl,
    getCrawlLogsController
} = require('../../controllers/admin/googleSearchConsole');
const { 
    getIndexingTimeline, 
    getIndexingPredictions, 
    getRealTimeIndexingProgress 
} = require('../../controllers/admin/indexingTimeline');
const authenticateAdmin = require('../../middlewars/authenticateAdmin');

/**
 * Google Search Console and Indexing API Routes
 * Handles automatic URL submission and crawl status monitoring
 */

// Submit new URLs to Google for indexing
router.post('/submit-urls', authenticateAdmin, submitNewUrlsToGoogle);

// Check crawl status for specific URLs
router.post('/check-status', authenticateAdmin, checkCrawlStatus);

// Get URL submission logs
router.get('/logs', authenticateAdmin, getSubmissionLogs);

// Submit sitemap to Google Search Console
router.post('/submit-sitemap', authenticateAdmin, submitSitemapController);

// Get crawl statistics
router.get('/stats', authenticateAdmin, getCrawlStats);

// Manual crawl trigger (for testing)
router.post('/trigger-crawl', authenticateAdmin, triggerManualCrawl);

// Get crawl logs
router.get('/crawl-logs', authenticateAdmin, getCrawlLogsController);

// Get indexing timeline and statistics
router.get('/indexing-timeline', authenticateAdmin, getIndexingTimeline);

// Get indexing predictions based on historical data
router.get('/indexing-predictions', authenticateAdmin, getIndexingPredictions);

// Get real-time indexing progress
router.get('/indexing-progress', authenticateAdmin, getRealTimeIndexingProgress);

module.exports = router;
