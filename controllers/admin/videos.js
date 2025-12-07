const { pool } = require("../../config/database");
const { clearVideoCache } = require("../../config/smart-cache");

// Create a new YouTube video

async function createYouTubeVideo(req, res) {
    const { video_url, thumbnail, title, description, categories = [] } = req.body;

    try {
        const query = `INSERT INTO res_videos (video_url, thumbnail, title, description) VALUES (?, ?, ?, ?)`;
        const [result] = await pool.query(query, [video_url, thumbnail, title, description]);

        const videoId = result.insertId;

        // Insert categories for the video if provided
        if (categories.length > 0) {
            const categoryQuery = `INSERT INTO res_video_categories_relationship (video_id, category_id) VALUES ?`;
            const categoryData = categories.map(categoryId => [videoId, categoryId]);
            await pool.query(categoryQuery, [categoryData]);
        }
        
        // Clear video cache after creation
        await clearVideoCache();

        res.status(201).json({ message: "Video created successfully", status: "success", videoId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}


// Get all YouTube videos (robust against ONLY_FULL_GROUP_BY)
async function getAllYouTubeVideos(req, res) {
    try {
        const [videos] = await pool.query(`
            SELECT v.video_id, v.video_url, v.thumbnail, v.title, v.description
            FROM res_videos v
            ORDER BY v.video_id DESC
        `);

        const videoIds = videos.map(v => v.video_id);
        let categoriesByVideoId = {};
        if (videoIds.length) {
            const [catRows] = await pool.query(
                `
                SELECT vcr.video_id, vc.category_name
                FROM res_video_categories_relationship vcr
                JOIN res_video_categories vc ON vc.category_id = vcr.category_id
                WHERE vcr.video_id IN (${videoIds.map(() => '?').join(', ')})
                `,
                videoIds
            );
            categoriesByVideoId = catRows.reduce((acc, row) => {
                if (!acc[row.video_id]) acc[row.video_id] = [];
                acc[row.video_id].push(row.category_name);
                return acc;
            }, {});
        }

        const rows = videos.map(v => ({
            ...v,
            categories: (categoriesByVideoId[v.video_id] || []).join(', '),
        }));

        res.status(200).json({
            data: rows,
            status: "success",
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

// Update a YouTube video
async function updateYouTubeVideo(req, res) {
    const { videoId } = req.params; // Expecting videoId as a URL parameter
    const { video_url, thumbnail, title, description, categories = undefined } = req.body; // Fields to update

    try {
        const query = `
            UPDATE res_videos 
            SET video_url = ?, thumbnail = ?, title = ?, description = ? 
            WHERE video_id = ?
        `;
        const [result] = await pool.query(query, [video_url, thumbnail, title, description, videoId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Video not found", status: "error" });
        }

        // If categories are provided as an array, replace relationships
        if (Array.isArray(categories)) {
            await pool.query(`DELETE FROM res_video_categories_relationship WHERE video_id = ?`, [videoId]);
            if (categories.length > 0) {
                const categoryPairs = categories.map((cid) => [videoId, cid]);
                await pool.query(
                    `INSERT INTO res_video_categories_relationship (video_id, category_id) VALUES ?`,
                    [categoryPairs]
                );
            }
        }
        
        // Clear video cache after update
        await clearVideoCache(videoId);

        res.status(200).json({ message: "Video updated successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

// Delete a YouTube video
async function deleteYouTubeVideo(req, res) {
    const { videoId } = req.params; // Expecting videoId as a URL parameter

    try {
        const query = `DELETE FROM res_videos WHERE video_id = ?`;
        const [result] = await pool.query(query, [videoId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Video not found", status: "error" });
        }
        
        // Clear video cache after deletion
        await clearVideoCache(videoId);

        res.status(200).json({ message: "Video deleted successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

// Export the controller functions
module.exports = {
    getAllYouTubeVideos,
    updateYouTubeVideo,
    deleteYouTubeVideo,
    createYouTubeVideo,
};
