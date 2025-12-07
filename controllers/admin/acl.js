const { pool } = require("../../config/database");

async function getUserList(req, res) {
  try {
    // Extract page and perPage from query parameters, with defaults
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 20;

    // Calculate the offset for the SQL query
    const offset = (page - 1) * perPage;

    // Get the total count of users
    const [totalCountResult] = await pool.query(
      "SELECT COUNT(*) AS totalCount FROM res_users WHERE user_type = 2"
    );
    const totalCount = totalCountResult[0].totalCount;

    // Fetch the paginated users with roles
    const [users] = await pool.query(
      `SELECT 
         u.user_id, 
         u.first_name, 
         u.last_name, 
         u.email, 
         u.status, 
         r.role_name 
       FROM res_users u
       LEFT JOIN res_roles r ON u.role_id = r.role_id
       WHERE u.user_type = 2
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / perPage);

    // Respond with the paginated data and metadata
    res.status(200).json({
      status: "success",
      response: {
        data: users,
        perPage,
        totalCount,
        totalPages,
        currentPage: page,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error fetching users",
      status: "error",
    });
  }
}

module.exports = {
  getUserList,
};
