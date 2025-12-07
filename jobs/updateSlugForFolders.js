const { pool } = require('../config/database');  // Import MySQL pool
const slugify = require('slugify');
require('dotenv').config();

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 1000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 3;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY) || 5000;
const CONCURRENCY_LIMIT = 10; // Limit the number of concurrent promises

async function updateSlugsInBatches() {
    let connection;

    try {
        connection = await pool.getConnection();

        // Get the total records with NULL, empty, or invalid slugs
        const [[{ total }]] = await connection.query(`
            SELECT COUNT(*) AS total 
            FROM res_folders 
            WHERE slug IS NULL OR slug = '' OR slug LIKE '%/%' OR slug LIKE '%_%'
        `);

        console.log(`📊 Total records to update: ${total}`);
        const totalBatches = Math.ceil(total / BATCH_SIZE);

        for (let batch = 0; batch < totalBatches; batch++) {
            const offset = batch * BATCH_SIZE;
            console.log(`🚀 Processing batch ${batch + 1}/${totalBatches} (offset: ${offset}, limit: ${BATCH_SIZE})`);

            let retries = 0;
            let batchSuccess = false;

            while (!batchSuccess && retries < MAX_RETRIES) {
                try {
                    await processBatch(connection, offset, BATCH_SIZE);
                    batchSuccess = true;
                    console.log(`✅ Batch ${batch + 1} processed successfully.`);
                } catch (error) {
                    retries++;
                    console.error(`❌ Error in batch ${batch + 1} (attempt ${retries}):`, error);
                    if (retries < MAX_RETRIES) {
                        console.log(`🔁 Retrying in ${RETRY_DELAY / 1000} seconds...`);
                        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
                    } else {
                        console.log(`🚫 Max retries reached. Skipping batch ${batch + 1}.`);
                    }
                }
            }
        }

        console.log(`🎉 All batches processed.`);

    } catch (error) {
        console.error('🔥 Error during batch processing:', error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

async function processBatch(connection, offset, limit) {
    const [folders] = await connection.query(`
        SELECT folder_id, title, slug
        FROM res_folders 
        WHERE slug IS NULL OR slug = '' OR slug LIKE '%/%' OR slug LIKE '%_%'
        LIMIT ? OFFSET ?
    `, [limit, offset]);

    if (folders.length === 0) return;

    // Prepare slugs to be checked for uniqueness
    const fileIds = folders.map(folder => folder.folder_id);
    const baseSlugs = folders.map(folder => {
        let title = folder.title || '';
        return folder.slug || slugify(title, {
            lower: true,
            replacement: '-',
            remove: /[*+~.()'"!:@]/g
        }).replace(/[/_]/g, '-').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
    });

    // Get unique slugs
    const uniqueSlugs = await getUniqueSlugs(connection, baseSlugs, fileIds);

    // Update the records in bulk
    const updates = folders.map(folder => {
        const uniqueSlug = uniqueSlugs[folder.folder_id] || `folder-${folder.folder_id}`;
        return connection.query(`
            UPDATE res_folders
            SET slug = ?
            WHERE folder_id = ?
        `, [uniqueSlug, folder.folder_id]);
    });

    await Promise.all(updates);  // Run all the updates in parallel

    console.log(`Processed ${folders.length} folders in this batch.`);
}

async function getUniqueSlugs(connection, baseSlugs, folderIds) {
    const query = `
        SELECT slug, folder_id FROM res_folders WHERE slug IN (?) AND folder_id NOT IN (?)
    `;
    
    const [rows] = await connection.query(query, [baseSlugs, folderIds]);
    
    const existingSlugs = new Set(rows.map(row => row.slug));
    const uniqueSlugs = {};

    for (let i = 0; i < baseSlugs.length; i++) {
        let uniqueSlug = baseSlugs[i];
        let counter = 1;
        
        while (existingSlugs.has(uniqueSlug)) {
            uniqueSlug = `${baseSlugs[i]}-${counter}`;
            counter++;
        }

        uniqueSlugs[folderIds[i]] = uniqueSlug;
    }

    return uniqueSlugs;
}

// Run the batch update process
updateSlugsInBatches();
