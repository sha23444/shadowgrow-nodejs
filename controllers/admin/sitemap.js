const { pool } = require('../../config/database');
const { STATIC_PAGES } = require('../utils/constants');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Get all folders for sitemap generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAllFolders(req, res) {
    try {
        const siteUrl = process.env.APP_BASE_URL;
        const prefix = `${siteUrl}/folders/`;

        const [folders] = await pool.execute(`SELECT folder_id, slug FROM res_folders`);

        const sitemap = folders.map(folder => {
            return `${prefix}${folder.slug}/${folder.folder_id}`;
        });

        // Send the results to the client
        res.status(200).json({
            status: "success",
            data: sitemap
        });
    } catch (error) {
        console.error('Error in getAllFolders:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Get all files for sitemap generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getAllFiles(req, res) {
    try {
        const siteUrl = process.env.APP_BASE_URL;
        const prefix = `${siteUrl}/files/`;

        const [files] = await pool.execute(`SELECT file_id, slug FROM res_files`);

        const sitemap = files.map(file => {
            return `${prefix}${file.slug}/${file.file_id}`;
        });

        res.status(200).json({
            status: "success",
            data: sitemap
        });
    } catch (error) {
        console.error('Error in getAllFiles:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Get all static pages for sitemap generation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getStaticPages(req, res) {
    try {
        const siteUrl = process.env.APP_BASE_URL;
        const prefix = `${siteUrl}/`;

        const sitemap = STATIC_PAGES.map(page => {
            return `${prefix}${page.slug}`;
        });

        res.status(200).json({
            status: "success",
            data: sitemap
        });
    } catch (error) {
        console.error('Error in getStaticPages:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

async function downloadSitemapXML(req, res) {
    try {
        // Generate sitemap using shared function
        const result = await generateSitemapFiles(req);

        // Set headers for XML download
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', 'attachment; filename=sitemap-index.xml');
        
        // Send the sitemap index for download
        res.status(200).send(result.sitemapIndex);

    } catch (error) {
        console.error('Error in downloadSitemapXML:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

async function getSitemapStatus(req, res) {
    try {
        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        // First try to update existing record
        const [updateResult] = await pool.execute(
            `UPDATE res_options SET option_value = ? WHERE option_name = 'sitemap_last_modified'`,
            [currentTimestamp]
        );
        
        // If no rows were affected, insert new record
        if (updateResult.affectedRows === 0) {
            await pool.execute(
                `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
                ['sitemap_last_modified', currentTimestamp, 0]
            );
        }
        
        // Get the updated/inserted record
        const [lastModifiedDate] = await pool.execute(
            `SELECT option_value FROM res_options WHERE option_name = 'sitemap_last_modified'`
        );

        // Check if sitemap files exist in directory
        const sitemapsDir = path.join(__dirname, '../../public/sitemaps');
        let sitemapStatus = 'error';
        let sitemapFiles = [];
        
        try {
            if (fs.existsSync(sitemapsDir)) {
                const files = fs.readdirSync(sitemapsDir);
                sitemapFiles = files.filter(file => file.endsWith('.xml'));
                
                if (sitemapFiles.length > 0) {
                    // Check if files are not empty and recent (within last 24 hours)
                    const now = new Date();
                    let allFilesValid = true;
                    
                    for (const file of sitemapFiles) {
                        const filePath = path.join(sitemapsDir, file);
                        const stats = fs.statSync(filePath);
                        const fileAge = now - stats.mtime;
                        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
                        
                        if (fileAge > maxAge || stats.size === 0) {
                            allFilesValid = false;
                            break;
                        }
                    }
                    
                    sitemapStatus = allFilesValid ? 'active' : 'error';
                } else {
                    sitemapStatus = 'error';
                }
            } else {
                sitemapStatus = 'error';
            }
        } catch (fsError) {
            console.error('Error checking sitemap files:', fsError);
            sitemapStatus = 'error';
        }

        res.status(200).json({
            status: "success",
            data: { 
                sitemap_last_modified: lastModifiedDate[0]?.option_value || currentTimestamp,
                sitemap_status: sitemapStatus,
                sitemap_files: sitemapFiles,
                sitemap_directory: sitemapsDir
            },
        });
        return { 
            sitemap_last_modified: lastModifiedDate[0]?.option_value || currentTimestamp,
            sitemap_status: sitemapStatus,
            sitemap_files: sitemapFiles,
            sitemap_directory: sitemapsDir
        };
    } catch (error) {
        console.error('Error in getLastModifiedDate:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Update sitemap update frequencies
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateSitemapFrequencies(req, res) {
    try {
        const { frequencies } = req.body;
        
        if (!frequencies || typeof frequencies !== 'object') {
            return res.status(400).json({
                status: "error",
                message: "Invalid frequencies object provided"
            });
        }

        // Validate frequency values
        const validFrequencies = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
        for (const [contentType, frequency] of Object.entries(frequencies)) {
            if (!validFrequencies.includes(frequency)) {
                return res.status(400).json({
                    status: "error",
                    message: `Invalid frequency '${frequency}' for content type '${contentType}'. Valid values: ${validFrequencies.join(', ')}`
                });
            }
        }

        // Store frequencies in database
        for (const [contentType, frequency] of Object.entries(frequencies)) {
            const optionName = `sitemap_frequency_${contentType}`;
            
            // First try to update existing record
            const [updateResult] = await pool.execute(
                `UPDATE res_options SET option_value = ? WHERE option_name = ?`,
                [frequency, optionName]
            );
            
            // If no rows were affected, insert new record
            if (updateResult.affectedRows === 0) {
                await pool.execute(
                    `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
                    [optionName, frequency, 0]
                );
            }
        }

        res.status(200).json({
            status: "success",
            message: "Sitemap frequencies updated successfully",
            data: frequencies
        });
    } catch (error) {
        console.error('Error in updateSitemapFrequencies:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Get current sitemap settings and frequencies
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getSitemapSettings(req, res) {
    try {
        // Get current frequencies from database
        const [frequencies] = await pool.execute(
            `SELECT option_name, option_value FROM res_options WHERE option_name LIKE 'sitemap_frequency_%'`
        );
        
        // Get default frequencies
        const defaultFrequencies = getContentUpdateFrequencies();
        
        // Merge database frequencies with defaults
        const currentFrequencies = { ...defaultFrequencies };
        frequencies.forEach(row => {
            const contentType = row.option_name.replace('sitemap_frequency_', '');
            currentFrequencies[contentType] = row.option_value;
        });

        // Get sitemap status
        const sitemapStatus = await getSitemapStatus(req, res);
        
        res.status(200).json({
            status: "success",
            data: {
                frequencies: currentFrequencies,
                default_frequencies: defaultFrequencies,
                sitemap_status: sitemapStatus
            }
        });
    } catch (error) {
        console.error('Error in getSitemapSettings:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Get content-specific update frequencies for better SEO
 * @returns {Object} - Object mapping content types to their update frequencies
 */
async function getContentUpdateFrequencies() {
    try {
        // Get custom frequencies from database
        const [frequencies] = await pool.execute(
            `SELECT option_name, option_value FROM res_options WHERE option_name LIKE 'sitemap_frequency_%'`
        );
        
        // Default frequencies
        const defaultFrequencies = {
            folders: 'daily',
            files: 'daily', 
            static_pages: 'weekly',
            blogs: 'daily'
        };
        
        // Override with custom frequencies from database
        frequencies.forEach(row => {
            const contentType = row.option_name.replace('sitemap_frequency_', '');
            if (defaultFrequencies.hasOwnProperty(contentType)) {
                defaultFrequencies[contentType] = row.option_value;
            }
        });
        
        return defaultFrequencies;
    } catch (error) {
        console.error('Error getting content update frequencies:', error);
        // Return default frequencies if database query fails
        return {
            folders: 'daily',
            files: 'daily', 
            static_pages: 'weekly',
            blogs: 'daily'
        };
    }
}

/**
 * Generate sitemap files without sending response
 * @param {Object} req - Express request object
 * @returns {Object} - Sitemap generation result
 */
async function generateSitemapFiles(req) {
    try {
        const siteUrl = process.env.APP_BASE_URL;
        const MAX_URLS_PER_SITEMAP = 50000;
        const PAGE_SIZE = 10000; // DB pagination size
        const updateFrequencies = await getContentUpdateFrequencies();

        // Simple DB lock to prevent overlapping runs (TTL 2 hours)
        const lockName = 'sitemap_generation_lock';
        const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        const [lockRows] = await pool.execute(
            `SELECT option_value FROM res_options WHERE option_name = ?`,
            [lockName]
        );
        if (lockRows.length) {
            const lockVal = lockRows[0].option_value;
            if (lockVal && lockVal > twoHoursAgo) {
                throw new Error('Sitemap generation is already running');
            }
            await pool.execute(
                `UPDATE res_options SET option_value = ? WHERE option_name = ?`,
                [nowIso, lockName]
            );
        } else {
            await pool.execute(
                `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, 0)`,
                [lockName, nowIso]
            );
        }

        // Create sitemaps directory if it doesn't exist
        const sitemapsDir = path.join(__dirname, '../../public/sitemaps');
        if (!fs.existsSync(sitemapsDir)) {
            fs.mkdirSync(sitemapsDir, { recursive: true });
        }

        // Helpers to manage a streaming sitemap chunk
        let currentCount = 0;
        let fileIndex = 0;
        let currentStream = null;
        let currentGzip = null;
        let currentPath = null;
        const sitemapFiles = [];

        function openNewSitemapStream() {
            fileIndex += 1;
            const filename = `sitemap-${fileIndex}.xml.gz`;
            currentPath = path.join(sitemapsDir, filename);
            const fileStream = fs.createWriteStream(currentPath);
            currentGzip = zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED });
            currentGzip.pipe(fileStream);
            // header
            currentGzip.write(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`);
            sitemapFiles.push(filename);
            currentStream = fileStream;
            currentCount = 0;
        }

        async function closeCurrentSitemapStream() {
            if (!currentGzip) return;
            return new Promise((resolve) => {
                currentGzip.write(`</urlset>`);
                currentGzip.end(() => {
                    // underlying file stream will finish as gzip ends
                    currentStream.on('finish', resolve);
                });
                currentGzip = null;
                currentStream = null;
                currentPath = null;
                currentCount = 0;
            });
        }

        function writeUrlEntry(url, changefreq, priority, lastmod) {
            const entry = `  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
            currentGzip.write(entry);
            currentCount += 1;
        }

        async function ensureStreamCapacity() {
            if (!currentGzip || currentCount >= MAX_URLS_PER_SITEMAP) {
                if (currentGzip) {
                    await closeCurrentSitemapStream();
                }
                openNewSitemapStream();
            }
        }

        // Paged readers for each content type
        async function streamFolders() {
            let offset = 0;
            while (true) {
                const [rows] = await pool.execute(
                    `SELECT folder_id, slug FROM res_folders ORDER BY folder_id LIMIT ? OFFSET ?`,
                    [PAGE_SIZE, offset]
                );
                if (!rows.length) break;
                for (const folder of rows) {
                    await ensureStreamCapacity();
                    writeUrlEntry(
                        `${siteUrl}/folders/${folder.slug}/${folder.folder_id}`,
                        updateFrequencies.folders,
                        1.0,
                        new Date().toISOString()
                    );
                }
                offset += rows.length;
            }
        }

        async function streamFiles() {
            let offset = 0;
            while (true) {
                const [rows] = await pool.execute(
                    `SELECT file_id, slug FROM res_files ORDER BY file_id LIMIT ? OFFSET ?`,
                    [PAGE_SIZE, offset]
                );
                if (!rows.length) break;
                for (const file of rows) {
                    await ensureStreamCapacity();
                    writeUrlEntry(
                        `${siteUrl}/files/${file.slug}/${file.file_id}`,
                        updateFrequencies.files,
                        1.0,
                        new Date().toISOString()
                    );
                }
                offset += rows.length;
            }
        }

        async function streamBlogs() {
            let offset = 0;
            while (true) {
                const [rows] = await pool.execute(
                    `SELECT blog_id, slug FROM res_blogs WHERE status = 'published' ORDER BY blog_id LIMIT ? OFFSET ?`,
                    [PAGE_SIZE, offset]
                );
                if (!rows.length) break;
                for (const blog of rows) {
                    await ensureStreamCapacity();
                    writeUrlEntry(
                        `${siteUrl}/blogs/${blog.slug}/${blog.blog_id}`,
                        updateFrequencies.blogs,
                        0.8,
                        new Date().toISOString()
                    );
                }
                offset += rows.length;
            }
        }

        async function streamStaticPages() {
            for (const page of STATIC_PAGES) {
                await ensureStreamCapacity();
                writeUrlEntry(
                    `${siteUrl}/${page.slug}`,
                    updateFrequencies.static_pages,
                    1.0,
                    new Date().toISOString()
                );
            }
        }

        // Begin streaming
        openNewSitemapStream();
        await streamFolders();
        await streamFiles();
        await streamBlogs();
        await streamStaticPages();
        await closeCurrentSitemapStream();

        // Generate sitemap index using API_BASE_URL and .xml.gz references
        const sitemapIndex = generateSitemapIndex(process.env.API_BASE_URL, sitemapFiles);

        // Save sitemap index
        const indexPath = path.join(sitemapsDir, 'sitemap-index.xml');
        fs.writeFileSync(indexPath, sitemapIndex);

        // Update sitemap last modified timestamp
        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const [updateResult] = await pool.execute(
            `UPDATE res_options SET option_value = ? WHERE option_name = 'sitemap_last_modified'`,
            [currentTimestamp]
        );
        if (updateResult.affectedRows === 0) {
            await pool.execute(
                `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
                ['sitemap_last_modified', currentTimestamp, 0]
            );
        }

        // Release lock
        await pool.execute(
            `UPDATE res_options SET option_value = ? WHERE option_name = ?`,
            ['', lockName]
        );

        return {
            sitemapFiles,
            sitemapIndex,
            totalUrls: sitemapFiles.length * MAX_URLS_PER_SITEMAP - (MAX_URLS_PER_SITEMAP - currentCount || 0),
            generatedAt: currentTimestamp
        };

    } catch (error) {
        try {
            // Attempt to release lock on error
            await pool.execute(
                `UPDATE res_options SET option_value = ? WHERE option_name = ?`,
                ['', 'sitemap_generation_lock']
            );
        } catch {}
        console.error('Error in generateSitemapFiles:', error);
        throw error;
    }
}

/**
 * Generate XML sitemap and sitemap index
 * @description This function generates XML sitemap and sitemap index for the website.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateSitemapXML(req, res) {
    try {
        const result = await generateSitemapFiles(req);

        // Return success response
        res.status(200).json({
            status: "success",
            message: "Sitemap generated successfully",
            data: {
                sitemap_files: result.sitemapFiles,
                sitemap_index: 'sitemap-index.xml',
                total_urls: result.totalUrls,
                generated_at: result.generatedAt
            }
        });

    } catch (error) {
        console.error('Error in generateSitemapXML:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}


/**
 * Generate sitemap content for a chunk of URLs
 * @param {Array} urlChunk - Array of URL objects with url, priority, changefreq, and lastmod
 * @returns {string} - XML sitemap content
 */
function generateSitemapContent(urlChunk) {
    const urlEntries = urlChunk.map(({ url, priority, changefreq, lastmod }) =>
        `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

/**
 * Generate sitemap index content
 * @param {string} siteUrl - Base URL for the site
 * @param {Array} sitemapFiles - Array of sitemap filenames
 * @returns {string} - XML sitemap index content
 */
function generateSitemapIndex(siteUrl, sitemapFiles) {
    const sitemapEntries = sitemapFiles.map(filename =>
        `  <sitemap>
    <loc>${siteUrl}/static/sitemaps/${filename}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</sitemapindex>`;
}

/**
 * Automatically adjust sitemap frequencies based on content activity
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function autoAdjustSitemapFrequencies(req, res) {
    try {
        const currentFrequencies = await getContentUpdateFrequencies();
        const newFrequencies = { ...currentFrequencies };
        
        // Analyze content update patterns to determine optimal frequencies
        const [recentUpdates] = await pool.execute(`
            SELECT 
                'folders' as content_type,
                COUNT(*) as update_count,
                MAX(updated_at) as last_update
            FROM res_folders 
            WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            UNION ALL
            SELECT 
                'files' as content_type,
                COUNT(*) as update_count,
                MAX(updated_at) as last_update
            FROM res_files 
            WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            UNION ALL
            SELECT 
                'blogs' as content_type,
                COUNT(*) as update_count,
                MAX(updated_at) as last_update
            FROM res_blogs 
            WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            UNION ALL
            SELECT 
                'videos' as content_type,
                COUNT(*) as update_count,
                MAX(updated_at) as last_update
            FROM res_videos 
            WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);

        // Adjust frequencies based on update activity
        recentUpdates.forEach(update => {
            const contentType = update.content_type;
            const updateCount = update.update_count;
            const lastUpdate = update.last_update;
            
            if (updateCount > 50) {
                // Very active content - update hourly
                newFrequencies[contentType] = 'hourly';
            } else if (updateCount > 20) {
                // Active content - update daily
                newFrequencies[contentType] = 'daily';
            } else if (updateCount > 5) {
                // Moderately active content - update daily
                newFrequencies[contentType] = 'daily';
            } else if (updateCount > 0) {
                // Low activity content - update weekly
                newFrequencies[contentType] = 'weekly';
            } else {
                // No recent updates - keep current frequency or set to monthly
                if (newFrequencies[contentType] === 'hourly' || newFrequencies[contentType] === 'daily') {
                    newFrequencies[contentType] = 'weekly';
                }
            }
        });

        // Update frequencies in database
        for (const [contentType, frequency] of Object.entries(newFrequencies)) {
            const optionName = `sitemap_frequency_${contentType}`;
            
            // First try to update existing record
            const [updateResult] = await pool.execute(
                `UPDATE res_options SET option_value = ? WHERE option_name = ?`,
                [frequency, optionName]
            );
            
            // If no rows were affected, insert new record
            if (updateResult.affectedRows === 0) {
                await pool.execute(
                    `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
                    [optionName, frequency, 0]
                );
            }
        }

        // Log the automatic adjustment
        console.log('Sitemap frequencies automatically adjusted based on content activity:', newFrequencies);

        res.status(200).json({
            status: "success",
            message: "Sitemap frequencies automatically adjusted based on content activity",
            data: {
                previous_frequencies: currentFrequencies,
                new_frequencies: newFrequencies,
                adjustment_reason: "Content activity analysis"
            }
        });
    } catch (error) {
        console.error('Error in autoAdjustSitemapFrequencies:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Get content update statistics for frequency optimization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getContentUpdateStats(req, res) {
    try {
        // Get content update statistics for frequency optimization
        const [stats] = await pool.execute(`
            SELECT 
                'folders' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as last_30d,
                MAX(updated_at) as last_update
            FROM res_folders 
            UNION ALL
            SELECT 
                'files' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as last_30d,
                MAX(updated_at) as last_update
            FROM res_files 
            UNION ALL
            SELECT 
                'blogs' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as last_30d,
                MAX(updated_at) as last_update
            FROM res_blogs 
            UNION ALL
            SELECT 
                'videos' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as last_30d,
                MAX(updated_at) as last_update
            FROM res_videos
        `);

        // Get current frequencies
        const currentFrequencies = await getContentUpdateFrequencies();

        res.status(200).json({
            status: "success",
            data: {
                content_stats: stats,
                current_frequencies: currentFrequencies,
                recommendations: generateFrequencyRecommendations(stats)
            }
        });
    } catch (error) {
        console.error('Error in getContentUpdateStats:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Generate frequency recommendations based on content statistics
 * @param {Array} stats - Content update statistics
 * @returns {Object} - Frequency recommendations
 */
function generateFrequencyRecommendations(stats) {
    const recommendations = {};
    
    stats.forEach(stat => {
        const contentType = stat.content_type;
        const last24h = stat.last_24h;
        const last7d = stat.last_7d;
        const last30d = stat.last_30d;
        
        if (last24h > 10) {
            recommendations[contentType] = 'hourly';
        } else if (last7d > 50) {
            recommendations[contentType] = 'daily';
        } else if (last7d > 20) {
            recommendations[contentType] = 'daily';
        } else if (last7d > 5) {
            recommendations[contentType] = 'weekly';
        } else if (last30d > 0) {
            recommendations[contentType] = 'monthly';
        } else {
            recommendations[contentType] = 'yearly';
        }
    });
    
    return recommendations;
}

/**
 * Set hourly updates for high-priority content types
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function setHourlyUpdates(req, res) {
    try {
        const { contentTypes } = req.body;
        
        if (!contentTypes || !Array.isArray(contentTypes)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid contentTypes array provided"
            });
        }

        const hourlyFrequencies = {};
        
        // Set specified content types to hourly updates
        for (const contentType of contentTypes) {
            hourlyFrequencies[contentType] = 'hourly';
        }

        // Update frequencies in database
        for (const [contentType, frequency] of Object.entries(hourlyFrequencies)) {
            const optionName = `sitemap_frequency_${contentType}`;
            
            // First try to update existing record
            const [updateResult] = await pool.execute(
                `UPDATE res_options SET option_value = ? WHERE option_name = ?`,
                [frequency, optionName]
            );
            
            // If no rows were affected, insert new record
            if (updateResult.affectedRows === 0) {
                await pool.execute(
                    `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
                    [optionName, frequency, 0]
                );
            }
        }

        res.status(200).json({
            status: "success",
            message: "Hourly updates set for specified content types",
            data: {
                hourly_content_types: contentTypes,
                frequencies: hourlyFrequencies
            }
        });
    } catch (error) {
        console.error('Error in setHourlyUpdates:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

/**
 * Get optimal crawl schedule for search engines
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getOptimalCrawlSchedule(req, res) {
    try {
        const currentFrequencies = await getContentUpdateFrequencies();
        const [contentStats] = await pool.execute(`
            SELECT 
                'folders' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_1h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
            FROM res_folders 
            UNION ALL
            SELECT 
                'files' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_1h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
            FROM res_files 
            UNION ALL
            SELECT 
                'blogs' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_1h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
            FROM res_blogs 
            UNION ALL
            SELECT 
                'videos' as content_type,
                COUNT(*) as total_count,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 END) as last_1h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                COUNT(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
            FROM res_videos
        `);

        // Generate optimal crawl schedule
        const optimalSchedule = {
            hourly: [],
            daily: [],
            weekly: [],
            monthly: []
        };

        contentStats.forEach(stat => {
            const contentType = stat.content_type;
            const last1h = stat.last_1h;
            const last24h = stat.last_24h;
            const last7d = stat.last_7d;

            if (last1h > 5) {
                optimalSchedule.hourly.push(contentType);
            } else if (last24h > 20) {
                optimalSchedule.daily.push(contentType);
            } else if (last7d > 50) {
                optimalSchedule.weekly.push(contentType);
            } else {
                optimalSchedule.monthly.push(contentType);
            }
        });

        // Get current sitemap status
        const sitemapStatus = await getSitemapStatus(req, res);

        res.status(200).json({
            status: "success",
            data: {
                current_frequencies: currentFrequencies,
                content_statistics: contentStats,
                optimal_crawl_schedule: optimalSchedule,
                sitemap_status: sitemapStatus,
                recommendations: {
                    high_priority: optimalSchedule.hourly,
                    medium_priority: optimalSchedule.daily,
                    low_priority: optimalSchedule.weekly,
                    static_content: optimalSchedule.monthly
                }
            }
        });
    } catch (error) {
        console.error('Error in getOptimalCrawlSchedule:', error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

module.exports = {
    getAllFolders,
    getAllFiles,
    getStaticPages,
    generateSitemapXML,
    generateSitemapFiles,
    downloadSitemapXML,
    getSitemapStatus,
    updateSitemapFrequencies,
    getSitemapSettings,
    autoAdjustSitemapFrequencies,
    getContentUpdateStats,
    setHourlyUpdates,
    getOptimalCrawlSchedule
};