const { pool } = require("../../../config/database");

async function getCourses(req, res) {
  const { id } = req.user; // User ID from the request
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
          rp.subtitle,
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
    const result = {};

    // Return the response
    return res.status(200).json({
      status: "success",
      data: courses,
      pagination: {
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getCourseDetails(req, res) {
  const { id } = req.user; // User ID from the request
  const { course_id } = req.params; // Extract course_id from request params

  try {
    // Fetch all columns from related tables
    const [course] = await pool.execute(
      `
        SELECT 
          up.*, 
          rp.*, 
          m.file_name AS image
        FROM res_ucourses AS up
        INNER JOIN res_courses AS rp ON up.course_id = rp.course_id
        LEFT JOIN res_course_media AS m ON rp.course_id = m.course_id AND m.is_cover = 1
        WHERE up.user_id = ? AND up.course_id = ?
      `,
      [id, course_id]
    );

    // Check if the course was found
    if (course.length === 0) {
      return res.status(403).json({
        status: "error",
        message: "Course not purchased",
      });
    }

    // Respond with course details
    return res.status(200).json({
      status: "success",
      response: course[0],
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getCourseContent(req, res) {
  const { course_id } = req.params;
  const { id } = req.user;

  try {
    // Check if the user has purchased the course

    const [course] = await pool.execute(
      `SELECT * FROM res_ucourses WHERE course_id = ? AND user_id = ?`,
      [course_id, id]
    );

    if (course.length === 0) {
      return res
        .status(403)
        .json({ status: "error", message: "Course not purchased" });
    }

    // Fetch topics for the course
    const [topics] = await pool.execute(
      `SELECT topic_id, topic_name, description FROM res_course_topics WHERE course_id = ?`,
      [course_id]
    );

    if (topics.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "No topics found for this course." });
    }

    // Fetch content for each topic
    for (const topic of topics) {
      const [content] = await pool.execute(
        `SELECT * FROM res_topic_content WHERE topic_id = ?`,
        [topic.topic_id]
      );

      // Initialize total duration in seconds
      let totalDuration = 0;

      for (const item of content) {
        if (item.content_type === "video" && item.video_duration) {
          const [hours, minutes, seconds] = item.video_duration
            .split(":")
            .map(Number);

          // Check if parsed values are valid numbers
          if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
            totalDuration += hours * 3600 + minutes * 60 + seconds;
          }
        }
      }

      // Convert total duration back to HH:mm:ss format
      const hours = Math.floor(totalDuration / 3600);
      const minutes = Math.floor((totalDuration % 3600) / 60);
      const seconds = totalDuration % 60;
      const formattedDuration = [
        hours.toString().padStart(2, "0"),
        minutes.toString().padStart(2, "0"),
        seconds.toString().padStart(2, "0"),
      ].join(":");

      topic.total_duration = formattedDuration;
      topic.content = content;
    }

    res.status(200).json({ status: "success", data: topics });
  } catch (error) {
    console.error("Error fetching topics and content:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

async function getLectureDetailsById(req, res) {
  const { lectureId } = req.params;

  if (!lectureId) {
    return res
      .status(400)
      .json({ status: "error", message: "Lecture ID is required" });
  }

  try {
    // Fetch lecture details from the database
    const [lecture] = await pool.execute(
      `SELECT * FROM res_topic_content WHERE content_id = ?`,
      [lectureId]
    );

    if (!lecture.length) {
      return res
        .status(404)
        .json({ status: "error", message: "Lecture not found" });
    }

    const data = lecture[0];

    // Check if the lecture is a video
    // if (data.content_type === "video") {
    //   const params = {
    //     Bucket: process.env.AWS_S3_BUCKET_NAME,
    //     Key: `videos/${data.file_name}`,
    //     //  Expires: 60 * 24, // Signed URL valid for 5 minutes
    //   };

    //   try {
    //     const url = await s3.getSignedUrlPromise("getObject", params);
    //     data.file_url = url; // Add the signed URL to the response data
    //   } catch (err) {
    //     console.error("Error generating signed URL:", err);
    //     return res
    //       .status(500)
    //       .json({ status: "error", message: "Failed to generate video URL" });
    //   }
    // }

    // Return the lecture data
    return res.status(200).json({ status: "success", data });
  } catch (error) {
    console.error("Error fetching lecture details:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
}

module.exports = {
  getCourses,
  getCourseDetails,
  getCourseContent,
  getLectureDetailsById,
};
