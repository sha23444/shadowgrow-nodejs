const { pool } = require('../../config/database');
const { getCrawlStatus } = require('./googleSearchConsole');

/**
 * Google Indexing Timeline Monitoring
 * Tracks how long it takes for URLs to appear in search results
 */

/**
 * Monitor indexing timeline for submitted URLs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getIndexingTimeline(req, res) {
    try {
        // Get URLs submitted in the last 30 days
        const [submittedUrls] = await pool.execute(`
            SELECT 
                url,
                created_at as submitted_at,
                status,
                message
            FROM res_url_submission_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            AND status = 'success'
            ORDER BY created_at DESC
            LIMIT 100
        `);

        // Check current indexing status
        const siteUrl = process.env.APP_BASE_URL;
        const urlsToCheck = submittedUrls.map(log => log.url);
        
        let indexingStatus = [];
        if (urlsToCheck.length > 0) {
            try {
                indexingStatus = await getCrawlStatus(urlsToCheck.slice(0, 10), siteUrl); // Check first 10 URLs
            } catch (error) {
                console.error('Error checking indexing status:', error);
            }
        }

        // Calculate timeline statistics
        const timelineStats = calculateTimelineStats(submittedUrls, indexingStatus);

        res.status(200).json({
            status: "success",
            data: {
                submitted_urls: submittedUrls.length,
                indexing_status: indexingStatus,
                timeline_statistics: timelineStats,
                average_indexing_time: timelineStats.average_days,
                fastest_indexing: timelineStats.fastest_days,
                slowest_indexing: timelineStats.slowest_days
            }
        });

    } catch (error) {
        console.error('Error getting indexing timeline:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Calculate timeline statistics
 * @param {Array} submittedUrls - Array of submitted URL logs
 * @param {Array} indexingStatus - Array of current indexing status
 * @returns {Object} Timeline statistics
 */
function calculateTimelineStats(submittedUrls, indexingStatus) {
    const now = new Date();
    const stats = {
        total_submitted: submittedUrls.length,
        indexed_count: 0,
        pending_count: 0,
        error_count: 0,
        average_days: 0,
        fastest_days: 999,
        slowest_days: 0,
        by_content_type: {
            folders: { count: 0, avg_days: 0 },
            files: { count: 0, avg_days: 0 },
            blogs: { count: 0, avg_days: 0 },
            videos: { count: 0, avg_days: 0 }
        }
    };

    // Process indexing status
    indexingStatus.forEach(status => {
        if (status.status === 'PASS') {
            stats.indexed_count++;
            
            // Find corresponding submission log
            const submission = submittedUrls.find(log => log.url === status.url);
            if (submission) {
                const submittedAt = new Date(submission.submitted_at);
                const daysDiff = Math.ceil((now - submittedAt) / (1000 * 60 * 60 * 24));
                
                stats.fastest_days = Math.min(stats.fastest_days, daysDiff);
                stats.slowest_days = Math.max(stats.slowest_days, daysDiff);
                
                // Categorize by content type
                if (status.url.includes('/folders/')) {
                    stats.by_content_type.folders.count++;
                    stats.by_content_type.folders.avg_days += daysDiff;
                } else if (status.url.includes('/files/')) {
                    stats.by_content_type.files.count++;
                    stats.by_content_type.files.avg_days += daysDiff;
                } else if (status.url.includes('/blogs/')) {
                    stats.by_content_type.blogs.count++;
                    stats.by_content_type.blogs.avg_days += daysDiff;
                } else if (status.url.includes('/videos/')) {
                    stats.by_content_type.videos.count++;
                    stats.by_content_type.videos.avg_days += daysDiff;
                }
            }
        } else if (status.status === 'PENDING') {
            stats.pending_count++;
        } else {
            stats.error_count++;
        }
    });

    // Calculate averages
    if (stats.indexed_count > 0) {
        stats.average_days = Math.round((stats.fastest_days + stats.slowest_days) / 2);
        
        // Calculate averages by content type
        Object.keys(stats.by_content_type).forEach(type => {
            if (stats.by_content_type[type].count > 0) {
                stats.by_content_type[type].avg_days = Math.round(
                    stats.by_content_type[type].avg_days / stats.by_content_type[type].count
                );
            }
        });
    }

    return stats;
}

/**
 * Get indexing predictions based on historical data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getIndexingPredictions(req, res) {
    try {
        const { content_type } = req.query;
        
        // Get historical data for predictions
        const [historicalData] = await pool.execute(`
            SELECT 
                CASE 
                    WHEN url LIKE '%/folders/%' THEN 'folders'
                    WHEN url LIKE '%/files/%' THEN 'files'
                    WHEN url LIKE '%/blogs/%' THEN 'blogs'
                    WHEN url LIKE '%/videos/%' THEN 'videos'
                    ELSE 'other'
                END as content_type,
                COUNT(*) as total_submitted,
                AVG(TIMESTAMPDIFF(HOUR, created_at, NOW())) as avg_hours_to_index,
                MIN(TIMESTAMPDIFF(HOUR, created_at, NOW())) as fastest_hours,
                MAX(TIMESTAMPDIFF(HOUR, created_at, NOW())) as slowest_hours
            FROM res_url_submission_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            AND status = 'success'
            GROUP BY content_type
        `);

        // Generate predictions
        const predictions = historicalData.map(data => ({
            content_type: data.content_type,
            total_submitted: data.total_submitted,
            predicted_indexing_time: {
                average_hours: Math.round(data.avg_hours_to_index),
                average_days: Math.round(data.avg_hours_to_index / 24),
                fastest_hours: data.fastest_hours,
                slowest_hours: data.slowest_hours,
                confidence_level: data.total_submitted > 10 ? 'high' : data.total_submitted > 5 ? 'medium' : 'low'
            }
        }));

        res.status(200).json({
            status: "success",
            data: {
                predictions,
                recommendations: generateIndexingRecommendations(predictions)
            }
        });

    } catch (error) {
        console.error('Error getting indexing predictions:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

/**
 * Generate indexing recommendations
 * @param {Array} predictions - Array of content type predictions
 * @returns {Array} Recommendations
 */
function generateIndexingRecommendations(predictions) {
    const recommendations = [];

    predictions.forEach(prediction => {
        const avgDays = prediction.predicted_indexing_time.average_days;
        
        if (avgDays <= 3) {
            recommendations.push({
                content_type: prediction.content_type,
                status: 'excellent',
                message: `${prediction.content_type} content indexes very quickly (${avgDays} days average)`,
                suggestion: 'Keep up the current submission frequency'
            });
        } else if (avgDays <= 7) {
            recommendations.push({
                content_type: prediction.content_type,
                status: 'good',
                message: `${prediction.content_type} content indexes reasonably fast (${avgDays} days average)`,
                suggestion: 'Consider increasing submission frequency for faster indexing'
            });
        } else if (avgDays <= 14) {
            recommendations.push({
                content_type: prediction.content_type,
                status: 'moderate',
                message: `${prediction.content_type} content takes moderate time to index (${avgDays} days average)`,
                suggestion: 'Focus on improving content quality and site authority'
            });
        } else {
            recommendations.push({
                content_type: prediction.content_type,
                status: 'slow',
                message: `${prediction.content_type} content takes longer to index (${avgDays} days average)`,
                suggestion: 'Review content quality, add more internal links, and improve site structure'
            });
        }
    });

    return recommendations;
}

/**
 * Monitor real-time indexing progress
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getRealTimeIndexingProgress(req, res) {
    try {
        // Get URLs submitted in the last 24 hours
        const [recentSubmissions] = await pool.execute(`
            SELECT 
                url,
                created_at as submitted_at,
                status
            FROM res_url_submission_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            AND status = 'success'
            ORDER BY created_at DESC
        `);

        // Check indexing status for recent submissions
        const siteUrl = process.env.APP_BASE_URL;
        const urlsToCheck = recentSubmissions.map(log => log.url);
        
        let indexingStatus = [];
        if (urlsToCheck.length > 0) {
            try {
                indexingStatus = await getCrawlStatus(urlsToCheck.slice(0, 20), siteUrl);
            } catch (error) {
                console.error('Error checking real-time indexing status:', error);
            }
        }

        // Calculate progress metrics
        const progress = {
            total_submitted_24h: recentSubmissions.length,
            indexed_24h: indexingStatus.filter(s => s.status === 'PASS').length,
            pending_24h: indexingStatus.filter(s => s.status === 'PENDING').length,
            error_24h: indexingStatus.filter(s => s.status === 'error').length,
            indexing_rate: recentSubmissions.length > 0 ? 
                Math.round((indexingStatus.filter(s => s.status === 'PASS').length / recentSubmissions.length) * 100) : 0
        };

        res.status(200).json({
            status: "success",
            data: {
                progress,
                recent_submissions: recentSubmissions.slice(0, 10),
                indexing_status: indexingStatus.slice(0, 10),
                next_check_recommended: 'Check again in 1 hour for updated status'
            }
        });

    } catch (error) {
        console.error('Error getting real-time indexing progress:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
            error: error.message
        });
    }
}

module.exports = {
    getIndexingTimeline,
    getIndexingPredictions,
    getRealTimeIndexingProgress
};
