const { pool } = require("../../../config/database");

async function getLeadStatuses(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const [result] = await pool.query(
      `SELECT * FROM res_lead_statuses LIMIT ?, ?`,
      [offset, limit]
    );
    const [totalCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_lead_statuses`
    );

    res.status(200).json({
//       data: result,
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

async function addStatus(req, res) {
  const { name, status = 1, color } = req.body;

  if (!name) {
    return res.status(400).json({
//       message: "Name is required",
//       status: "error",
    });
  }

  try {
    // Find the maximum position
    const [rows] = await pool.query(
      `SELECT COALESCE(MAX(position), 0) AS max_position FROM res_lead_statuses`
    );

    const nextPosition = rows[0].max_position + 1;

    // Insert the new record with the calculated position
    await pool.query(
      `INSERT INTO res_lead_statuses (name, position, status, color) VALUES (?, ?, ?, ?)`,
      [name, nextPosition, status, color]
    );

    res.status(201).json({
//       message: "Status added successfully",
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

async function updateStatus(req, res) {
  const { name, status, color, status_id } = req.body;

  if (!name) {
    return res.status(400).json({
//       message: "Name is required",
//       status: "error",
    });
  }

  try {
    await pool.query(
      `UPDATE res_lead_statuses SET name = ?, status = ?, color = ? WHERE status_id = ?`,
      [name, status, color, status_id]
    );

    res.status(200).json({
//       message: "Status updated successfully",
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

async function deleteStatus(req, res) {
  const { id } = req.params;

  try {
    await pool.query(`DELETE FROM res_lead_statuses WHERE status_id = ?`, [id]);

    res.status(200).json({
//       message: "Status deleted successfully",
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
  getLeadStatuses,
  addStatus,
  updateStatus,
  deleteStatus,

};
