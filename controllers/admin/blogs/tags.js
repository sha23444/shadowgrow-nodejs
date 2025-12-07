const { pool } = require("../../../config/database");

// Create a new tag
async function createTag(req, res) {
    try {
        const { name } = req.body;

        // Check if the tag name already exists
        const [existingTag] = await pool.query(`SELECT * FROM res_blogs_tags WHERE name = ?  `, [name]);
        if (existingTag.length > 0) {
            return res.status(400).json({ message: "Tag name already exists", status: "error" });
        }

        const query = `INSERT INTO res_blogs_tags (name) VALUES (?)`;
        await pool.query(query, [name]);

        res.status(201).json({ message: "Tag created successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

// Get all tags

async function getTags(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Fetch paginated tags
        const [rows] = await pool.query(
            `SELECT * FROM res_blogs_tags ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        

        // Get total count for pagination metadata
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM res_blogs_tags`
        );

        const result = {
            data: rows,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            status: "success",
        };

        res.status(200).json({
            response: result,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}



// Delete a tag
async function deleteTag(req, res) {
    try {
        const { id } = req.params;

        const query = `DELETE FROM res_blogs_tags WHERE tag_id = ?`;
        await pool.query(query, [id]);

        res.status(200).json({ message: "Tag deleted successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

module.exports = { createTag, getTags, deleteTag };
