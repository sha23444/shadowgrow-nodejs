const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");
const { generateSitemapFiles } = require("../controllers/admin/sitemap");
const { 
    submitNewUrlsToGoogle, 
    submitSitemapToGoogle, 
    submitUrlsToGoogle,
    discoverNewUrls,
    logUrlSubmission 
} = require("../controllers/admin/googleSearchConsole");

// Path to log file
const logFilePath = path.join(__dirname, "../logs/crawl_logs.json");

/**
 * Automatic URL Crawling and Google Indexing Service
 * Runs every minute to discover and submit new URLs to Google
 */

// Helper function to log crawl job activity
function logCrawlJob(status, message, data = null) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        status, // "success" or "error"
        message,
        data
    };

    // Read existing log file if it exists
    fs.readFile(logFilePath, "utf8", (err, fileData) => {
        let logs = [];

        // Handle empty or invalid JSON file
        if (!err && fileData) {
            try {
                logs = JSON.parse(fileData);
            } catch (parseErr) {
                console.error("Invalid JSON in crawl log file, starting with a fresh log.");
                logs = [];
            }
        }

        // Append the new log entry
        logs.push(logEntry);

        // Keep only last 1000 entries to prevent log file from growing too large
        if (logs.length > 1000) {
            logs = logs.slice(-1000);
        }

        // Write back to the log file
        fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), (writeErr) => {
            if (writeErr) {
                console.error(`Failed to write crawl log: ${writeErr.message}`);
            }
        });
    });
}

/**
 * Discover and submit new URLs to Google
 */
async function crawlAndSubmitNewUrls() {
    let connection;
    try {
        connection = await pool.getConnection();
        
        console.log('🔄 Starting URL crawl...');
        
        // Discover new URLs from the last hour
        const newUrls = await discoverNewUrls(1);
        
        if (newUrls.length === 0) {
            logCrawlJob("success", "No new URLs found in the last hour", { new_urls_count: 0 });
            return;
        }

        console.log(`📝 Found ${newUrls.length} new URLs`);
        
        // Submit URLs to Google
        const siteUrl = process.env.APP_BASE_URL;
        const submissionResults = [];
        
        // Submit URLs in batches of 10 to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < newUrls.length; i += batchSize) {
            const batch = newUrls.slice(i, i + batchSize);
            
            try {
                // Submit batch to Google Indexing API
                const { submitUrlsToGoogle } = require("./googleSearchConsole");
                const batchResults = await submitUrlsToGoogle(batch, siteUrl);
                submissionResults.push(...batchResults);
                
                // Log each URL submission
                batch.forEach(url => {
                    logUrlSubmission(url, 'success', 'submitted_via_cron');
                });
                
                // Small delay between batches to respect rate limits
                if (i + batchSize < newUrls.length) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
            } catch (error) {
                console.error(`Error submitting batch ${i}-${i + batchSize}:`, error);
                
                // Log failed submissions
                batch.forEach(url => {
                    logUrlSubmission(url, 'error', `Batch submission failed: ${error.message}`);
                });
            }
        }

        // Submit updated sitemap to Google Search Console
        try {
            const sitemapUrl = `${process.env.API_BASE_URL}/static/sitemaps/sitemap-index.xml`;
            await submitSitemapToGoogle(sitemapUrl, siteUrl);
            console.log('✅ Sitemap submitted');
        } catch (sitemapError) {
            console.error('Error submitting sitemap:', sitemapError);
        }

        const successCount = submissionResults.filter(r => r.status === 'submitted').length;
        const errorCount = submissionResults.filter(r => r.status === 'error').length;

        logCrawlJob("success", `Crawl completed: ${successCount} URLs submitted, ${errorCount} errors`, {
            new_urls_count: newUrls.length,
            submitted_count: successCount,
            error_count: errorCount,
            urls: newUrls
        });

        console.log(`✅ Crawl completed: ${successCount} URLs submitted, ${errorCount} errors`);

    } catch (error) {
        console.error('Error in crawlAndSubmitNewUrls:', error);
        logCrawlJob("error", `Crawl job failed: ${error.message}`, { error: error.message });
    } finally {
        if (connection) connection.release();
    }
}

/**
 * Regenerate sitemap files
 */
async function regenerateSitemap() {
    try {
        console.log('🔄 Regenerating sitemap...');
        
        // Generate sitemap files
        const result = await generateSitemapFiles({});
        
        logCrawlJob("success", "Sitemap regenerated successfully", {
            sitemap_files: result.sitemapFiles,
            total_urls: result.totalUrls,
            generated_at: result.generatedAt
        });
        
        console.log(`✅ Sitemap regenerated: ${result.totalUrls} URLs`);
        
    } catch (error) {
        console.error('Error regenerating sitemap:', error);
        logCrawlJob("error", `Sitemap regeneration failed: ${error.message}`, { error: error.message });
    }
}

/**
 * Check and update crawl frequencies based on content activity
 */
async function updateCrawlFrequencies() {
    try {
        console.log('🔄 Updating crawl frequencies...');
        
        // Get content update statistics
        const [stats] = await pool.execute(`
            SELECT 
                'folders' as content_type,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_1h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h
            FROM res_folders 
            UNION ALL
            SELECT 
                'files' as content_type,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_1h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h
            FROM res_files 
            UNION ALL
            SELECT 
                'blogs' as content_type,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_1h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h
            FROM res_blogs
        `);

        // Update frequencies based on activity
        for (const stat of stats) {
            const contentType = stat.content_type;
            const last1h = stat.last_1h;
            const last24h = stat.last_24h;
            
            let newFrequency = 'daily'; // default
            
            if (last1h > 5) {
                newFrequency = 'hourly';
            } else if (last24h > 20) {
                newFrequency = 'daily';
            } else if (last24h > 5) {
                newFrequency = 'daily';
            } else {
                newFrequency = 'weekly';
            }

            // Update frequency in database
            const optionName = `sitemap_frequency_${contentType}`;
            
            await pool.execute(
                `INSERT INTO res_options (option_name, option_value, is_public) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE option_value = ?`,
                [optionName, newFrequency, 0, newFrequency]
            );
        }

        logCrawlJob("success", "Crawl frequencies updated based on content activity", { stats });
        console.log('Crawl frequencies updated successfully');

    } catch (error) {
        console.error('Error updating crawl frequencies:', error);
        logCrawlJob("error", `Frequency update failed: ${error.message}`, { error: error.message });
    }
}

/**
 * Get crawl job logs
 */
function getCrawlLogs() {
    try {
        if (fs.existsSync(logFilePath)) {
            const data = fs.readFileSync(logFilePath, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error reading crawl logs:', error);
        return [];
    }
}

/**
 * Clear old crawl logs (keep only last 500 entries)
 */
function cleanupCrawlLogs() {
    try {
        const logs = getCrawlLogs();
        if (logs.length > 500) {
            const recentLogs = logs.slice(-500);
            fs.writeFileSync(logFilePath, JSON.stringify(recentLogs, null, 2));
            console.log('🧹 Logs cleaned up');
        }
    } catch (error) {
        console.error('Error cleaning up crawl logs:', error);
    }
}

// === Notification cleanup cron job ===
async function deleteOldNotifications() {
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute(
            `DELETE FROM res_admin_notifications WHERE created_at < (NOW() - INTERVAL 7 DAY)`
        );
        const deletedCount = result.affectedRows;
        // Log to cron_logs.json
        const fs = require('fs');
        const path = require('path');
        const logFilePath = path.join(__dirname, 'cron_logs.json');
        const logEntry = {
            timestamp: new Date().toISOString(),
            status: 'success',
            job: 'deleteOldNotifications',
            message: `Successfully deleted ${deletedCount} notifications older than 1 week.`
        };
        fs.readFile(logFilePath, "utf8", (err, data) => {
            let logs = [];
            if (!err && data) {
                try { logs = JSON.parse(data); } catch { logs = []; }
            }
            logs.push(logEntry);
            // keep last 1000 entries
            if (logs.length > 1000) logs = logs.slice(-1000);
            fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), () => {});
        });
    } catch (error) {
        // Log error
        const fs = require('fs');
        const path = require('path');
        const logFilePath = path.join(__dirname, 'cron_logs.json');
        const logEntry = {
            timestamp: new Date().toISOString(),
            status: 'error',
            job: 'deleteOldNotifications',
            message: `Error deleting old notifications: ${error.message}`
        };
        fs.readFile(logFilePath, "utf8", (err, data) => {
            let logs = [];
            if (!err && data) {
                try { logs = JSON.parse(data); } catch { logs = []; }
            }
            logs.push(logEntry);
            if (logs.length > 1000) logs = logs.slice(-1000);
            fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), () => {});
        });
    } finally {
        if (connection) connection.release();
    }
}

// Cleanup error and cron logs (keep last N entries or last 30 days)
function cleanupErrorAndCronLogs() {
    try {
        const fs = require('fs');
        const path = require('path');
        const filesToClean = [
            path.join(__dirname, '../logs/crawl_logs.json'),
            path.join(__dirname, 'cron_logs.json')
        ];
        const maxEntries = 1000;
        const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
        filesToClean.forEach((filePath) => {
            if (!fs.existsSync(filePath)) return;
            try {
                const raw = fs.readFileSync(filePath, 'utf8');
                let logs = [];
                if (raw) {
                    try { logs = JSON.parse(raw); } catch { logs = []; }
                }
                if (!Array.isArray(logs)) return;
                // Filter by age and trim to last N
                const filtered = logs.filter(e => {
                    const ts = Date.parse(e?.timestamp || '');
                    return isFinite(ts) ? ts >= cutoff : true;
                });
                const trimmed = filtered.length > maxEntries ? filtered.slice(-maxEntries) : filtered;
                fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2));
            } catch (err) {
                console.error('Error cleaning log file:', filePath, err.message);
            }
        });
        console.log('🧹 Error/Cron logs cleaned');
    } catch (error) {
        console.error('Error in cleanupErrorAndCronLogs:', error.message);
    }
}

// Concurrency guards to avoid overlapping heavy jobs
let isCrawling = false;
let isRegeneratingSitemap = false;
let isUpdatingFrequencies = false;

// Wrap heavy functions with guards
async function safeCrawlAndSubmitNewUrls() {
    if (isCrawling) {
        console.log('crawlAndSubmitNewUrls skipped: previous run still in progress');
        return;
    }
    isCrawling = true;
    try {
        await crawlAndSubmitNewUrls();
    } finally {
        isCrawling = false;
    }
}

async function safeRegenerateSitemap() {
    if (isRegeneratingSitemap) {
        console.log('regenerateSitemap skipped: previous run still in progress');
        return;
    }
    isRegeneratingSitemap = true;
    try {
        await regenerateSitemap();
    } finally {
        isRegeneratingSitemap = false;
    }
}

async function safeUpdateCrawlFrequencies() {
    if (isUpdatingFrequencies) {
        console.log('updateCrawlFrequencies skipped: previous run still in progress');
        return;
    }
    isUpdatingFrequencies = true;
    try {
        await updateCrawlFrequencies();
    } finally {
        isUpdatingFrequencies = false;
    }
}

// Schedule cron jobs - consolidated to low-traffic night window
// 2:00 AM: Regenerate sitemap - RUNS IN BACKGROUND
cron.schedule("0 2 * * *", () => {
    setImmediate(async () => {
        try {
            await safeRegenerateSitemap();
        } catch (error) {
            console.error('Background nightly sitemap job error:', error.message);
        }
    });
});

// 2:10 AM: Discover and submit new URLs - RUNS IN BACKGROUND
cron.schedule("10 2 * * *", () => {
    setImmediate(async () => {
        try {
            await safeCrawlAndSubmitNewUrls();
        } catch (error) {
            console.error('Background nightly crawl job error:', error.message);
        }
    });
});

// 2:20 AM: Update crawl frequencies - RUNS IN BACKGROUND
cron.schedule("20 2 * * *", () => {
    setImmediate(async () => {
        try {
            await safeUpdateCrawlFrequencies();
        } catch (error) {
            console.error('Background nightly crawl frequencies job error:', error.message);
        }
    });
});

// 2:30 AM: Clean up old logs - RUNS IN BACKGROUND
cron.schedule("30 2 * * *", () => {
    setImmediate(() => {
        try {
            cleanupCrawlLogs();
        } catch (error) {
            console.error('Background nightly cleanup job error:', error.message);
        }
    });
});

// Schedule job to run every day at 02:00 AM
cron.schedule('0 2 * * *', () => {
    setImmediate(() => {
        deleteOldNotifications();
    });
});

// Additional nightly cleanup at 2:40 AM: prune error and cron logs
cron.schedule("40 2 * * *", () => {
    setImmediate(() => {
        try {
            cleanupErrorAndCronLogs();
        } catch (error) {
            console.error('Background nightly error log cleanup error:', error.message);
        }
    });
});

console.log('🚀 URL crawling service started - Background jobs scheduled');

module.exports = {
    crawlAndSubmitNewUrls,
    regenerateSitemap,
    updateCrawlFrequencies,
    getCrawlLogs,
    cleanupCrawlLogs
}
