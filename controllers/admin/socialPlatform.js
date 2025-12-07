const { pool } = require("../../config/database");

// Create a new social platform
async function createSocialPlatform(req, res) {
  try {
    const { platform, url, icon, status = 1} = req.body;

    // Check if the platform name already exists
    const [existingPlatform] = await pool.query(
      "SELECT * FROM res_social_platforms WHERE platform = ?",
      [platform]
    );

    if (existingPlatform.length > 0) {
      return res.status(400).json({
        message: "Platform name already exists",
        status: "error",
      });
    }

    const query = `
            INSERT INTO res_social_platforms (platform, url, icon, status)
            VALUES (?, ?, ?, ?)
        `;
    await pool.query(query, [platform, url, icon, status]);

    res.status(201).json({
      message: "Social platform created successfully",
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

async function getSocialPlatforms(req, res) {
  try {
    // Fetch the base URL from environment variables or configuration
    const appBaseUrl = config.APP_BASE_URL;

    // Extract pagination parameters from query string
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const pageSize = parseInt(req.query.pageSize) || 10; // Default to 10 items per page if not provided

    // Calculate the offset based on page and pageSize
    const offset = (page - 1) * pageSize;

    // Query the database for social platforms with pagination
    const [rows] = await pool.query(
      `
            SELECT * FROM res_social_platforms ORDER BY social_link_id DESC 
            LIMIT ? OFFSET ?
        `,
      [pageSize, offset]
    );

    // Get the total count of records (for pagination metadata)
    const [totalCount] = await pool.query(
      "SELECT COUNT(*) AS count FROM res_social_platforms"
    );

    // Calculate the total pages
    const totalPages = Math.ceil(totalCount[0].count / pageSize);

    const result = {
      data: rows,

      currentPage: page,
      totalPages: totalPages,
      pageSize: pageSize,
      totalItems: totalCount[0].count,
      status: "success",
    };

    res.status(200).json({
      response: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

// Delete a social platform

async function deleteSocialPlatform(req, res) {
  try {
    const { id } = req.params;

    const query = `
            DELETE FROM res_social_platforms
            WHERE social_link_id = ?
        `;
    await pool.query(query, [id]);

    res.status(200).json({
      message: "Social platform deleted successfully",
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

async function updateSocialPlatform(req, res) {
  try {
    const { id } = req.params;
    const { platform, url, icon, status  } = req.body;

    const query = `
            UPDATE res_social_platforms
            SET platform = ?, url = ?, icon = ?,
            status = ?
            WHERE social_link_id = ?
        `;
    await pool.query(query, [platform, url, icon, status, id]);

    res.status(200).json({
      message: "Social platform updated successfully",
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
  createSocialPlatform,
  getSocialPlatforms,
  deleteSocialPlatform,
  updateSocialPlatform,
};
