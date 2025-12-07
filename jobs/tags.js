const { pool } = require('../config/database');

const BATCH_SIZE = 1000;
const tagCache = new Map(); // Cache tag text => id

async function migrateSplitTags(connection) {
    // 1. Get all source data
    const [compoundTags] = await connection.query(`SELECT * FROM res_tags`);
    const [allMappings] = await connection.query(`SELECT * FROM res_tags_map`);

    // 2. Create lookup maps
    const tagIdToCompoundTag = new Map(compoundTags.map(t => [t.tag_id, t.tag]));
    
    // 3. Pre-cache existing tags
    const [existingTags] = await connection.query(`SELECT id, tag FROM tags`);
    existingTags.forEach(t => tagCache.set(t.tag, t.id));

    // 4. Process mappings in batches
    for (let i = 0; i < allMappings.length; i += BATCH_SIZE) {
        const batch = allMappings.slice(i, i + BATCH_SIZE);
        const newTags = [];
        const newMappings = [];
        const tagsToCheck = new Set();

        // 5. First collect all tags in this batch
        for (const map of batch) {
            const compoundTag = tagIdToCompoundTag.get(map.tag_id);
            if (!compoundTag) continue;

            compoundTag.split('+')
                .map(t => t.trim())
                .filter(t => t) // Remove empty tags
                .forEach(tag => {
                    if (!tagCache.has(tag)) {
                        tagsToCheck.add(tag);
                    }
                });
        }

        // 6. Resolve tags - find existing or mark for insert
        if (tagsToCheck.size > 0) {
            // Check which tags already exist
            const [existing] = await connection.query(
                `SELECT id, tag FROM tags WHERE tag IN (?)`, 
                [Array.from(tagsToCheck)]
            );

            // Cache existing tags
            existing.forEach(t => {
                tagCache.set(t.tag, t.id);
                tagsToCheck.delete(t.tag);
            });

            // Prepare new tags for insertion
            if (tagsToCheck.size > 0) {
                const tagsToInsert = Array.from(tagsToCheck).map(t => [t, 1]);
                await connection.query(
                    `INSERT IGNORE INTO tags (tag, hits) VALUES ?`,
                    [tagsToInsert]
                );

                // Get IDs of newly inserted tags
                const [inserted] = await connection.query(
                    `SELECT id, tag FROM tags WHERE tag IN (?)`,
                    [Array.from(tagsToCheck)]
                );
                inserted.forEach(t => tagCache.set(t.tag, t.id));
            }
        }

        // 7. Create mappings for this batch
        for (const map of batch) {
            const compoundTag = tagIdToCompoundTag.get(map.tag_id);
            if (!compoundTag) continue;

            const individualTags = compoundTag.split('+')
                .map(t => t.trim())
                .filter(t => t);

            for (const tagText of individualTags) {
                const tagId = tagCache.get(tagText);
                if (tagId) {
                    newMappings.push([tagId, map.ref_id, map.ref_type]);
                }
            }
        }

        // 8. Insert mappings (ignore duplicates)
        if (newMappings.length > 0) {
            await connection.query(
                `INSERT IGNORE INTO tag_map (tag_id, ref_id, ref_type) VALUES ?`,
                [newMappings]
            );
        }

        console.log(`Processed batch ${i}-${i + batch.length}: ${newMappings.length} mappings`);
    }
}

async function runMigration() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        // Optional: Clear existing mappings if needed
        // await conn.query('TRUNCATE TABLE tag_map');
        
        await migrateSplitTags(conn);
        await conn.commit();
        console.log('Migration completed successfully');
    } catch (error) {
        await conn.rollback();
        console.error('Migration failed:', error);
        throw error;
    } finally {
        conn.release();
    }
}

// Verification function
async function verifyFileTags(fileId) {
    const conn = await pool.getConnection();
    try {
        const [tags] = await conn.query(`
            SELECT t.id, t.tag 
            FROM tags t
            JOIN tag_map tm ON t.id = tm.tag_id
            WHERE tm.ref_id = ? AND tm.ref_type = 'file'
            ORDER BY t.tag
        `, [fileId]);
        
        console.log(`Tags for file ${fileId}:`, tags.map(t => t.tag));
        return tags;
    } finally {
        conn.release();
    }
}

// Run migration and verify specific files
runMigration()
    .then(() => verifyFileTags(17373)) // Verify the problem file
    .then(() => verifyFileTags(29195)) // Verify another file if needed
    .catch(err => {
        console.error('Migration error:', err);
        process.exit(1);
    });


    