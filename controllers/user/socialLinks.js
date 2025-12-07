const { pool } = require("../../config/database");

// Get active social links with non-null URLs for user side
async function getUserSocialLinks(req, res) {
    try {
        const floating = req.query.floating; // 'true' or 'false' or undefined

        let whereClause = "WHERE url IS NOT NULL AND url != '' AND status = 1";
        let queryParams = [];

        // Add floating filter if specified
        if (floating !== undefined) {
            const isFloating = floating === 'true' ? 1 : 0;
            whereClause += " AND is_floating_enabled = ?";
            queryParams = [isFloating];
        }

        // Query the database for active social links with non-null URLs
        const [rows] = await pool.query(
            `
        SELECT id, platform_name, url, is_floating_enabled 
        FROM res_social_links 
        ${whereClause}
        ORDER BY created_at ASC
      `,
            queryParams
        );

        const result = {
            data: rows,
            status: "success",
            count: rows.length
        };

        res.status(200).json({
            response: result,
        });
    } catch (err) {
        // console.error("Error fetching user social links:", err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

module.exports = {
    getUserSocialLinks,
};
