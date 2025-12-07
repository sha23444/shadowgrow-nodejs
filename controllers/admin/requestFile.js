const { pool } = require("../../config/database");


// Create a new file request
async function createRequestFile(req, res) {
    try {
        const { name, email, phone, subject, message, user_id = null } = req.body;

        const query = `
            INSERT INTO res_file_requests (name, email, phone, subject, message, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await pool.query(query, [name, email, phone, subject, message, user_id]);

        res.status(201).json({
            message: "File request created successfully",
            status: "success",
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

// Get a list of file requests with pagination
async function getRequestFiles(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const query = `
            SELECT * FROM res_file_requests ORDER BY created_at DESC LIMIT ? OFFSET ? 
        `;

        // Fetch paginated file requests
        const [rows] = await pool.query(query, [limit, offset]);

        // Get total count for pagination metadata
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM res_file_requests`
        );

        let result = {
            data: rows,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            status: "success"
        }

        res.status(200).json({
            response: result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

// update a file request by id with all fields

async function updateRequestFile(req, res) {
    try {
        const { id, name, email, phone, subject, message, user_id = null } = req.body;

        const query = `
            UPDATE res_file_requests
            SET name = ?, email = ?, phone = ?, subject = ?, message = ?, user_id = ?
            WHERE id = ?
        `;
        await pool.query(query, [name, email, phone, subject, message, user_id, id]);

        res.status(200).json({
            message: "File request updated successfully",
            status: "success",
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

module.exports = {
    createRequestFile,
    getRequestFiles,
    updateRequestFile
};