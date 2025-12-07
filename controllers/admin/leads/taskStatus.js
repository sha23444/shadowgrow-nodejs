const { pool } = require("../../../config/database");

// Get paginated task statuses
async function getTaskStatuses(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const [statuses] = await pool.query(
      `SELECT * FROM res_task_status ORDER BY created_at DESC LIMIT ?, ?`,
      [offset, limit]
    );

    const [totalCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_task_status`
    );

    res.status(200).json({
//       data: statuses,
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

// Add a new task status
async function addTaskStatus(req, res) {
  const { title, color } = req.body;

  if (!title || !color) {
    return res.status(400).json({
//       message: "Title and color are required",
//       status: "error",
    });
  }

  try {
    await pool.query(
      `INSERT INTO res_task_status (title, color) VALUES (?, ?)`,
      [title, color]
    );

    res.status(201).json({
//       message: "Task status added successfully",
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

// Update an existing task status
async function updateTaskStatus(req, res) {
  const { task_status_id, title, color } = req.body;

  if (!task_status_id || !title || !color) {
    return res.status(400).json({
//       message: "Task status ID, title, and color are required",
//       status: "error",
    });
  }

  try {
    await pool.query(
      `UPDATE res_task_status SET title = ?, color = ? WHERE task_status_id = ?`,
      [title, color, task_status_id]
    );

    res.status(200).json({
//       message: "Task status updated successfully",
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

// Delete an existing task status
async function deleteTaskStatus(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
//       message: "Task status ID is required",
//       status: "error",
    });
  }

  try {
    await pool.query(`DELETE FROM res_task_status WHERE task_status_id = ?`, [id]);

    res.status(200).json({
//       message: "Task status deleted successfully",
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
  getTaskStatuses,
  addTaskStatus,
  updateTaskStatus,
  deleteTaskStatus,
};
