const { pool } = require("../../../config/database");

// Get paginated task labels
async function getTaskLabels(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const [labels] = await pool.query(
      `SELECT * FROM res_task_labels ORDER BY created_at DESC LIMIT ?, ?`,
      [offset, limit]
    );

    const [totalCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_task_labels`
    );

    res.status(200).json({
//       data: labels,
//       total: totalCount[0].total,
      page,
      limit,
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

// Add a new task label
async function addTaskLabel(req, res) {
  const { title, description, color } = req.body;

  if (!title || !color) {
    return res.status(400).json({
//       message: "Title and color are required",
//       status: "error",
    });
  }

  try {
    await pool.query(
      `INSERT INTO res_task_labels (title, description, color) VALUES (?, ?, ?)`,
      [title, description || null, color]
    );

    res.status(201).json({
//       message: "Task label added successfully",
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

// Update an existing task label
async function updateTaskLabel(req, res) {
  const { task_label_id, title, description, color } = req.body;

  if (!task_label_id || !title || !color) {
    return res.status(400).json({
//       message: "Label ID, title, and color are required",
//       status: "error",
    });
  }

  try {
    await pool.query(
      `UPDATE res_task_labels SET title = ?, description = ?, color = ? WHERE task_label_id = ?`,
      [title, description || null, color, task_label_id]
    );

    res.status(200).json({
//       message: "Task label updated successfully",
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

// Delete an existing task label
async function deleteTaskLabel(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
//       message: "Label ID is required",
//       status: "error",
    });
  }

  try {
    await pool.query(`DELETE FROM res_task_labels WHERE task_label_id = ?`, [id]);

    res.status(200).json({
//       message: "Task label deleted successfully",
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

module.exports = {
  getTaskLabels,
  addTaskLabel,
  updateTaskLabel,
  deleteTaskLabel,
};
