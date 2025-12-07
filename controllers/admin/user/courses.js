const { pool } = require("../../../config/database");

async function getCourses(req, res) {
  const { userId : id } = req.query; // User ID from the request
  const page = parseInt(req.query.page, 10) || 1; // Current page, default to 1
  const limit = parseInt(req.query.limit, 10) || 20; // Items per page, default to 20
  const offset = (page - 1) * limit; // Calculate offset for pagination
  const search = req.query.search || ""; // Search term, default to empty string

  try {
    // Fetch total count of purchased courses for pagination
    const [[{ total }]] = await pool.execute(
      `
        SELECT COUNT(*) AS total
        FROM res_ucourses AS up
        INNER JOIN res_courses AS rp ON up.course_id = rp.course_id
        WHERE up.user_id = ? AND rp.title LIKE ?
      `,
      [id, `%${search}%`]
    );

    // Fetch paginated list of purchased courses
    const [courses] = await pool.execute(
      `
        SELECT 
          up.course_id, 
          rp.title, 
          rp.sale_price, 
          rp.slug,
          m.file_name AS image
        FROM res_ucourses AS up
        INNER JOIN res_courses AS rp ON up.course_id = rp.course_id
        LEFT JOIN res_course_media AS m ON rp.course_id = m.course_id AND m.is_cover = 1
        WHERE up.user_id = ? AND rp.title LIKE ?
        LIMIT ? OFFSET ?
      `,
      [id, `%${search}%`, limit, offset]
    );

    // Construct the paginated response
    const result = {
//       data: courses,
//       perPage: limit,
//       totalCount: total,
//       totalPages: Math.ceil(total / limit),
//       currentPage: page,
    };

    // Return the response
    return res.status(200).json({
//       status: "success",
//       response: result,
    });
  } catch (err) {
//     // console.error("Database error:", err);
    return res.status(500).json({
//       status: "error",
//       message: "Internal Server Error",
    });
  }
}

module.exports = { getCourses };
