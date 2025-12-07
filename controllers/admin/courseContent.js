const { pool } = require("../../config/database");


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
    console.error("Error fetching topics and content:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

// 4. Create Content for a Topic
async function createContent(req, res) {
  const { topicId } = req.params;
  const { content_type, file_name, file_url, description, is_preview } =
    req.body;

  if (!content_type || !file_name || !file_url) {
    return res.status(400).json({
      status: "error",
      message: "Content type, file name, and file URL are required.",
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO res_topic_content (topic_id, content_type, file_name, file_url, description, is_preview) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        topicId,
        content_type,
        file_name,
        file_url,
        description,
        is_preview || false,
      ]
    );

    res.status(201).json({
      status: "success",
      message: "Content added successfully.",
      data: {
        content_id: result.insertId,
        content_type,
        file_name,
        file_url,
        description,
        is_preview,
      },
    });
  } catch (error) {
    console.error("Error adding content:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

// 5. Update Content for a Topic
async function updateContent(req, res) {
  const { contentId } = req.params;
  const { content_type, file_name, file_url, description, is_preview } =
    req.body;

  try {
    const [result] = await pool.execute(
      `UPDATE res_topic_content SET content_type = ?, file_name = ?, file_url = ?, description = ?, is_preview = ? 
      WHERE content_id = ?`,
      [
        content_type,
        file_name,
        file_url,
        description,
        is_preview || false,
        contentId,
      ]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Content not found." });
    }

    res.status(200).json({
      status: "success",
      message: "Content updated successfully.",
      data: {
        content_id: contentId,
        content_type,
        file_name,
        file_url,
        description,
        is_preview,
      },
    });
  } catch (error) {
    console.error("Error updating content:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

// 6. Delete Content from a Topic
async function deleteContent(req, res) {
  const { contentId } = req.params;

  try {
    const [result] = await pool.execute(
      `DELETE FROM res_topic_content WHERE content_id = ?`,
      [contentId]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Content not found." });
    }

    res.status(200).json({
      status: "success",
      message: "Content deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting content:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

module.exports = {
  createContent,
  updateContent,
  deleteContent,
  getCourseContent,
};
