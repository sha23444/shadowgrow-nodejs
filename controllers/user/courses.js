const { pool } = require("../../config/database");

async function getCourseList(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const categorySlug = req.query.category || null; // Default to null if not provided

    let categoryId = null;

    // Resolve category_id if categorySlug is provided
    if (categorySlug) {
      const [categoryResult] = await pool.execute(
        `SELECT category_id FROM res_course_categories WHERE slug = ?`,
        [categorySlug]
      );

      if (categoryResult.length === 0) {
        return res.status(404).json({ error: "Invalid category" });
      }

      categoryId = categoryResult[0].category_id;
    }

    // Base query
    let baseQuery = `SELECT p.* FROM res_courses p`;
    let whereClause = "";
    const queryParams = [limit, offset];

    if (categoryId) {
      baseQuery += ` 
        JOIN res_course_category_relationships pcr ON p.course_id = pcr.course_id
      `;
      whereClause = `WHERE pcr.category_id = ?`;
      queryParams.unshift(categoryId); // Add category_id to query params
    }

    baseQuery += ` ${whereClause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;

    // Fetch course details
    const [courses] = await pool.execute(baseQuery, queryParams);

    if (courses.length === 0) {
      return res.status(404).json({ error: "No courses found" });
    }

    // Get total course count
    let countQuery = `SELECT COUNT(*) AS total FROM res_courses p`;
    if (categoryId) {
      countQuery += `
        JOIN res_course_category_relationships pcr ON p.course_id = pcr.course_id
        WHERE pcr.category_id = ?`;
    }

    const [[{ total }]] = await pool.execute(
      countQuery,
      categoryId ? [categoryId] : []
    );

    // Fetch associated media
    const courseIds = courses.map((course) => course.course_id);

    const [media] = await pool.execute(
      `SELECT media_id, course_id, type, file_name, is_cover 
      FROM res_course_media 
      WHERE course_id IN (${courseIds.join(",")}) AND is_cover = 1`
    );

    // Fetch associated categories
    const [categories] = await pool.execute(
      `SELECT c.category_id, c.category_name, pcr.course_id 
      FROM res_course_categories c
      JOIN res_course_category_relationships pcr ON c.category_id = pcr.category_id
      WHERE pcr.course_id IN (${courseIds.join(",")})`
    );

    // Organize media and categories by course ID
    const mediaMap = media.reduce((acc, item) => {
      if (!acc[item.course_id]) {
        acc[item.course_id] = [];
      }
      acc[item.course_id].push(item);
      return acc;
    }, {});

    const categoryMap = categories.reduce((acc, item) => {
      if (!acc[item.course_id]) {
        acc[item.course_id] = [];
      }
      acc[item.course_id].push(item);
      return acc;
    }, {});

    // Structure course data
    const courseList = courses.map((course) => ({
//       course_id: course.course_id,
//       title: course.title,
//       slug: course.slug,
//       subtitle: course.subtitle,
//       language: course.language,
//       sale_price: course.sale_price,
//       original_price: course.original_price,
//       media: mediaMap[course.course_id] || [],
//       categories: categoryMap[course.course_id] || [],
    }));

    // Final response
    return res.status(200).json({
//       status: "success",
//       data: courseList,
//       perPage: limit,
//       totalCount: total,
//       totalPages: Math.ceil(total / limit),
//       currentPage: page,
    });
  } catch (error) {
//     // console.error("Error fetching course list:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCourseDetails(req, res) {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({ error: "Course slug is required" });
    }

    // Execute the course query
    const [course] = await pool.execute(
      `SELECT * FROM res_courses WHERE slug = ?`,
      [slug]
    );

    if (course.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Get the course details (we'll also fetch associated media and categories)
    const courseDetails = course[0]; // Assuming course[0] is the only course result

    // Fetch associated media
    const [media] = await pool.execute(
      `SELECT media_id, course_id, type, file_name, is_cover 
      FROM res_course_media 
      WHERE course_id = ? AND is_cover = 1`,
      [courseDetails.course_id]
    );

    // Fetch associated categories
    const [categories] = await pool.execute(
      `SELECT c.category_id, c.category_name 
      FROM res_course_categories c
      JOIN res_course_category_relationships pcr ON c.category_id = pcr.category_id
      WHERE pcr.course_id = ?`,
      [courseDetails.course_id]
    );

    // Structure the course data response
    const response = {
      ...courseDetails,
//       media: media || [],
//       categories: categories || [],
    };

    return res.status(200).json({
//       status: "success",
//       data: response,
    });
  } catch (error) {
//     // console.error("Error fetching course details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCourseContent(req, res) {
  const { courseId } = req.params;

  try {
    // Fetch topics for the course
    const [topics] = await pool.execute(
      `SELECT topic_id, topic_name, description FROM res_course_topics WHERE course_id = ?`,
      [courseId]
    );

    if (topics.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "No topics found for this course." });
    }

    // Fetch content for each topic
    for (const topic of topics) {
      const [content] = await pool.execute(
        `SELECT content_id, content_type, file_name, file_url, description, is_preview 
        FROM res_topic_content WHERE topic_id = ?`,
        [topic.topic_id]
      );
      topic.content = content;
    }

    res.status(200).json({ status: "success", data: topics });
  } catch (error) {
//     // console.error("Error fetching topics and content:", error);
    res.status(500).json({
//       status: "error",
//       message: "Internal Server Error",
//       error: error.message,
    });
  }
}

module.exports = {
  getCourseList,
  getCourseDetails,
  getCourseContent,
};
