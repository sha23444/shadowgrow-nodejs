const { pool } = require("../../config/database");

// Create a new video category
async function createVideoCategory(req, res) {
    const { category_name } = req.body;

    try {
        const query = `INSERT INTO res_video_categories (category_name) VALUES (?)`;
        const [result] = await pool.query(query, [category_name]);

        res.status(201).json({ message: "Category created successfully", status: "success", categoryId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

// Get all video categories
async function getAllVideoCategories(req, res) {
    try {
        const [rows] = await pool.query(`SELECT * FROM res_video_categories`);

        res.status(200).json({ data: rows, status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}


// Delete a video category
async function deleteVideoCategory(req, res) {
    const { categoryId } = req.params; // Expecting categoryId as a URL parameter

    try {
        const query = `DELETE FROM res_video_categories WHERE category_id = ?`;
        const [result] = await pool.query(query, [categoryId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Category not found", status: "error" });
        }

        res.status(200).json({ message: "Category deleted successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

// Export the controller functions
module.exports = {
    createVideoCategory,
    getAllVideoCategories,
    deleteVideoCategory,
};
