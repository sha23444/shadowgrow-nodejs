const { pool } = require("../../config/database");

// Get all social links with floating filter
async function getSocialLinks(req, res) {
    try {
        const floating = req.query.floating; // 'true' or 'false' or undefined

        let whereClause = "";
        let queryParams = [];

        // Add floating filter if specified
        if (floating !== undefined) {
            const isFloating = floating === 'true' ? 1 : 0;
            whereClause = "WHERE is_floating_enabled = ? AND status = 1";
            queryParams = [isFloating];
        }

        // Query the database for social links
        const [rows] = await pool.query(
            `
        SELECT * FROM res_social_links 
        ${whereClause}
        ORDER BY created_at ASC
      `,
            queryParams
        );

        const result = {
            data: rows,
            status: "success",
        };

        res.status(200).json({
            response: result,
        });
    } catch (err) {
        console.error("Error fetching social links:", err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}


// Update all social links
async function updateSocialLink(req, res) {
    try {
        const { socialLinks } = req.body; // Expecting an array of social links

        // Validate that socialLinks is an array
        if (!Array.isArray(socialLinks)) {
            return res.status(400).json({
                message: "socialLinks must be an array",
                status: "error",
            });
        }

        // Helper function to convert empty values to null (now that DB allows NULL)
        const convertToNullIfEmpty = (value) => {
            // Handle null, undefined, empty string, and whitespace-only strings
            if (value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '')) {
                return null;
            }
            // Also handle string 'null' and 'undefined' as null
            if (typeof value === 'string' && (value.toLowerCase() === 'null' || value.toLowerCase() === 'undefined')) {
                return null;
            }
            return value;
        };

        // Process and validate each social link
        for (let i = 0; i < socialLinks.length; i++) {
            const link = socialLinks[i];

            // Convert empty values to null
            link.platform_name = convertToNullIfEmpty(link.platform_name);
            link.url = convertToNullIfEmpty(link.url);

            // Validate URL format only if URL is provided and not null
            if (link.url !== null && link.url !== '') {
                // More permissive regex for social media URLs that allows @ symbols, longer paths, etc.
                const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,20})([\/\w \.\-@_~#%&+=\?]*)*\/?$/;
                if (!urlRegex.test(link.url)) {
                    return res.status(400).json({
                        message: `Please provide a valid URL for ${link.platform_name || `link at index ${i}`}`,
                        status: "error",
                    });
                }
            }

            // Check if platform name exists for other records (excluding current record)
            // Only check if platform_name is provided and not null
            if (link.platform_name !== null && link.platform_name !== '') {
                const [existingPlatform] = await pool.query(
                    "SELECT * FROM res_social_links WHERE platform_name = ? AND id != ?",
                    [link.platform_name, link.id]
                );

                if (existingPlatform.length > 0) {
                    return res.status(400).json({
                        message: `Platform name '${link.platform_name}' already exists`,
                        status: "error",
                    });
                }
            }
        }

        // Update all social links
        const updatePromises = socialLinks.map(link => {
            const query = `
                UPDATE res_social_links
                SET platform_name = ?, url = ?, is_floating_enabled = ?, status = ?, updated_at = NOW()
                WHERE id = ?
            `;
            return pool.query(query, [link.platform_name, link.url, link.is_floating_enabled, link.status, link.id]);
        });

        await Promise.all(updatePromises);

        res.status(200).json({
            message: "All social links updated successfully",
            status: "success",
            updatedCount: socialLinks.length
        });
    } catch (err) {
        console.error("Error updating social links:", err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}


module.exports = {
    getSocialLinks,
    updateSocialLink,
};
