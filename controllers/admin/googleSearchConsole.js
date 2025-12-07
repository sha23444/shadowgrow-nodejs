const { google } = require('googleapis');
const { pool } = require('../../config/database');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Google Search Console API Integration
 * Handles automatic URL submission and indexing requests
 */

// Initialize Google Search Console API
let searchConsoleClient = null;

/**
 * Initialize Google Search Console API client
 */
async function initializeSearchConsoleClient() {
    try {
        // Check if credentials file exists
        const credentialsPath = path.join(__dirname, 'google-search-console-credentials.json');
        
        if (!fs.existsSync(credentialsPath)) {
            console.log('Google Search Console credentials not found. Please add google-search-console-credentials.json');
            return null;
        }

        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/webmasters']
        });

        searchConsoleClient = google.searchconsole({ version: 'v1', auth });
        console.log('Google Search Console client initialized successfully');
        return searchConsoleClient;
    } catch (error) {
        console.error('Error initializing Google Search Console client:', error);
        return null;
    }
}

/**
 * Submit URLs to Google Search Console for indexing
 * @param {Array} urls - Array of URLs to submit
 * @param {string} siteUrl - The site URL registered in Search Console
 */
async function submitUrlsToGoogle(urls, siteUrl) {
    try {
        if (!searchConsoleClient) {
            await initializeSearchConsoleClient();
        }

        if (!searchConsoleClient) {
            throw new Error('Google Search Console client not initialized');
        }

        // Submit URLs using the Indexing API (faster than sitemap submission)
        const results = [];
        
        for (const url of urls) {
            try {
                // Use Google Indexing API for immediate submission
                const response = await submitUrlToIndexingAPI(url);
                results.push({
                    url,
                    status: 'submitted',
                    response: response
                });
                
                // Log successful submission
                await logUrlSubmission(url, 'success', 'submitted_to_indexing_api');
                
            } catch (error) {
                console.error(`Error submitting URL ${url}:`, error);
                results.push({
                    url,
                    status: 'error',
                    error: error.message
                });
                
                // Log failed submission
                await logUrlSubmission(url, 'error', error.message);
            }
        }

        return results;
    } catch (error) {
        console.error('Error in submitUrlsToGoogle:', error);
        throw error;
    }
}

/**
 * Submit URL to Google Web Search Indexing API (faster than Search Console)
 * @param {string} url - URL to submit
 */
async function submitUrlToIndexingAPI(url) {
    try {
        // Get OAuth2 credentials for Web Search Indexing API
        const credentialsPath = path.join(__dirname, 'google-indexing-credentials.json');
        
        if (!fs.existsSync(credentialsPath)) {
            throw new Error('Google Web Search Indexing API credentials not found');
        }

        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        
        // Get access token
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/indexing']
        });

        const authClient = await auth.getClient();
        const accessToken = await authClient.getAccessToken();

        // Submit URL to Web Search Indexing API
        const response = await axios.post(
            'https://indexing.googleapis.com/v3/urlNotifications:publish',
            {
                url: url,
                type: 'URL_UPDATED'
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken.token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('Error submitting to Web Search Indexing API:', error);
        throw error;
    }
}

/**
 * Submit sitemap to Google Search Console
 * @param {string} sitemapUrl - URL of the sitemap
 * @param {string} siteUrl - The site URL registered in Search Console
 */
async function submitSitemapToGoogle(sitemapUrl, siteUrl) {
    try {
        if (!searchConsoleClient) {
            await initializeSearchConsoleClient();
        }

        if (!searchConsoleClient) {
            throw new Error('Google Search Console client not initialized');
        }

        const response = await searchConsoleClient.sitemaps.submit({
            siteUrl: siteUrl,
            feedpath: sitemapUrl
        });

        console.log('Sitemap submitted successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error submitting sitemap:', error);
        throw error;
    }
}

/**
 * Get crawl status for URLs from Google Search Console
 * @param {Array} urls - Array of URLs to check
 * @param {string} siteUrl - The site URL registered in Search Console
 */
async function getCrawlStatus(urls, siteUrl) {
    try {
        if (!searchConsoleClient) {
            await initializeSearchConsoleClient();
        }

        if (!searchConsoleClient) {
            throw new Error('Google Search Console client not initialized');
        }

        const results = [];
        
        for (const url of urls) {
            try {
                const response = await searchConsoleClient.urlInspection.index.inspect({
                    requestBody: {
                        inspectionUrl: url,
                        siteUrl: siteUrl
                    }
                });

                results.push({
                    url,
                    status: response.data.inspectionResult?.indexStatusResult?.verdict || 'unknown',
                    lastCrawled: response.data.inspectionResult?.indexStatusResult?.lastCrawlTime || null,
                    coverageState: response.data.inspectionResult?.indexStatusResult?.coverageState || 'unknown'
                });
            } catch (error) {
                console.error(`Error checking crawl status for ${url}:`, error);
                results.push({
                    url,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return results;
    } catch (error) {
        console.error('Error in getCrawlStatus:', error);
        throw error;
    }
}

/**
 * Log URL submission attempts
 * @param {string} url - URL that was submitted
 * @param {string} status - Submission status (success/error)
 * @param {string} message - Additional message
 */
async function logUrlSubmission(url, status, message) {
    try {
        const logEntry = {
            url,
            status,
            message,
            timestamp: new Date().toISOString()
        };

        // Store in database
        await pool.execute(
            `INSERT INTO res_url_submission_logs (url, status, message, created_at) VALUES (?, ?, ?, NOW())`,
            [url, status, message]
        );

        // Also log to file
        const logFilePath = path.join(__dirname, '../../logs/url_submission.log');
        const logLine = `${new Date().toISOString()} - ${status.toUpperCase()} - ${url} - ${message}\n`;
        
        fs.appendFileSync(logFilePath, logLine);
    } catch (error) {
        console.error('Error logging URL submission:', error);
    }
}

/**
 * Get recent URL submission logs
 * @param {number} limit - Number of logs to retrieve
 */
async function getUrlSubmissionLogs(limit = 100) {
    try {
        const [logs] = await pool.execute(
            `SELECT * FROM res_url_submission_logs ORDER BY created_at DESC LIMIT ?`,
            [limit]
        );

        return logs;
    } catch (error) {
        console.error('Error getting URL submission logs:', error);
        throw error;
    }
}

/**
 * Discover new URLs from database
 * @param {number} hours - Hours to look back for new content
 */
async function discoverNewUrls(hours = 1) {
    try {
        const newUrls = [];

        // Get new folders
        const [newFolders] = await pool.execute(`
            SELECT folder_id, slug FROM res_folders 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        `, [hours]);

        // Get new files
        const [newFiles] = await pool.execute(`
            SELECT file_id, slug FROM res_files 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        `, [hours]);

        // Get new blogs
        const [newBlogs] = await pool.execute(`
            SELECT blog_id, slug FROM res_blogs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) AND status = 'published'
        `, [hours]);


        const siteUrl = process.env.APP_BASE_URL;

        // Generate URLs
        newFolders.forEach(folder => {
            newUrls.push(`${siteUrl}/folders/${folder.slug}/${folder.folder_id}`);
        });

        newFiles.forEach(file => {
            newUrls.push(`${siteUrl}/files/${file.slug}/${file.file_id}`);
        });

        newBlogs.forEach(blog => {
            newUrls.push(`${siteUrl}/blogs/${blog.slug}/${blog.blog_id}`);
        });


        return newUrls;
    } catch (error) {
        console.error('Error discovering new URLs:', error);
        throw error;
    }
}

/**
 * Submit new URLs to Google automatically
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function submitNewUrlsToGoogle(req, res) {
    try {
        const { hours = 1 } = req.body;
        const siteUrl = process.env.APP_BASE_URL;

        // Discover new URLs
        const newUrls = await discoverNewUrls(hours);

        if (newUrls.length === 0) {
            return res.status(200).json({
                status: "success",
                message: "No new URLs found in the specified time period",
                data: {
                    new_urls_count: 0,
                    submitted_urls: []
                }
            });
        }

        // Submit URLs to Google
        const submissionResults = await submitUrlsToGoogle(newUrls, siteUrl);

        // Submit sitemap as well
        try {
            const sitemapUrl = `${process.env.API_BASE_URL}/static/sitemaps/sitemap-index.xml`;
            await submitSitemapToGoogle(sitemapUrl, siteUrl);
        } catch (sitemapError) {
            console.error('Error submitting sitemap:', sitemapError);
        }

        res.status(200).json({
            status: "success",
            message: "URLs submitted to Google successfully",
            data: {
                new_urls_count: newUrls.length,
                submitted_urls: submissionResults,
                sitemap_submitted: true
            }
        });

    } catch (error) {
        console.error('Error in submitNewUrlsToGoogle:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Get crawl status for URLs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function checkCrawlStatus(req, res) {
    try {
        const { urls } = req.body;
        const siteUrl = process.env.APP_BASE_URL;

        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({
                status: "error",
                message: "URLs array is required"
            });
        }

        const crawlStatus = await getCrawlStatus(urls, siteUrl);

        res.status(200).json({
            status: "success",
            data: {
                crawl_status: crawlStatus
            }
        });

    } catch (error) {
        console.error('Error in checkCrawlStatus:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Get URL submission logs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getSubmissionLogs(req, res) {
    try {
        const { limit = 100 } = req.query;
        const logs = await getUrlSubmissionLogs(parseInt(limit));

        res.status(200).json({
            status: "success",
            data: {
                logs,
                total_count: logs.length
            }
        });

    } catch (error) {
        console.error('Error in getSubmissionLogs:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Submit sitemap to Google Search Console
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function submitSitemapController(req, res) {
    try {
        const siteUrl = process.env.APP_BASE_URL;
        const sitemapUrl = `${process.env.API_BASE_URL}/static/sitemaps/sitemap-index.xml`;
        
        const result = await submitSitemapToGoogle(sitemapUrl, siteUrl);
        
        res.status(200).json({
            status: "success",
            message: "Sitemap submitted to Google Search Console successfully",
            data: result
        });
    } catch (error) {
        console.error('Error submitting sitemap:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Get crawl statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getCrawlStats(req, res) {
    try {
        // Get submission statistics
        const [submissionStats] = await pool.execute(`
            SELECT 
                status,
                COUNT(*) as count,
                DATE(created_at) as date
            FROM res_url_submission_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY status, DATE(created_at)
            ORDER BY date DESC
        `);

        // Get recent activity
        const [recentActivity] = await pool.execute(`
            SELECT 
                COUNT(*) as total_submissions,
                COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_submissions,
                COUNT(CASE WHEN status = 'error' THEN 1 END) as failed_submissions,
                MAX(created_at) as last_submission
            FROM res_url_submission_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);

        // Get content creation statistics
        const [contentStats] = await pool.execute(`
            SELECT 
                'folders' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
            FROM res_folders 
            UNION ALL
            SELECT 
                'files' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
            FROM res_files 
            UNION ALL
            SELECT 
                'blogs' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
            FROM res_blogs
        `);

        res.status(200).json({
            status: "success",
            data: {
                submission_stats: submissionStats,
                recent_activity: recentActivity[0] || {},
                content_stats: contentStats,
                crawl_schedule: {
                    url_discovery: "Every minute",
                    sitemap_regeneration: "Every 5 minutes",
                    frequency_update: "Every hour",
                    log_cleanup: "Every 6 hours",
                    full_sitemap: "Daily at 2 AM"
                }
            }
        });

    } catch (error) {
        console.error('Error getting crawl stats:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Trigger manual crawl
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function triggerManualCrawl(req, res) {
    try {
        const { crawlAndSubmitNewUrls } = require('../../jobs/autoCrawlAndIndex');
        
        await crawlAndSubmitNewUrls();
        
        res.status(200).json({
            status: "success",
            message: "Manual crawl triggered successfully"
        });
    } catch (error) {
        console.error('Error triggering manual crawl:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Get crawl logs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getCrawlLogsController(req, res) {
    try {
        const { getCrawlLogs } = require('../../jobs/autoCrawlAndIndex');
        const logs = getCrawlLogs();
        
        res.status(200).json({
            status: "success",
            data: {
                logs,
                total_count: logs.length
            }
        });
    } catch (error) {
        console.error('Error getting crawl logs:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

module.exports = {
    initializeSearchConsoleClient,
    submitUrlsToGoogle,
    submitSitemapToGoogle,
    getCrawlStatus,
    logUrlSubmission,
    getUrlSubmissionLogs,
    discoverNewUrls,
    submitNewUrlsToGoogle,
    checkCrawlStatus,
    getSubmissionLogs,
    submitSitemapController,
    getCrawlStats,
    triggerManualCrawl,
    getCrawlLogsController
};
