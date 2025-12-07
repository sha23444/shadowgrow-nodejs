const { pool } = require("../../../config/database");

// Get paginated labels
async function getLabels(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const [labels] = await pool.query(
      `SELECT * FROM res_lead_labels ORDER BY created_at DESC LIMIT ?, ?`,
      [offset, limit]
    );

    const [totalCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_lead_labels`
    );

    res.status(200).json({
      data: labels,
      total: totalCount[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

// Add a new label
async function addLabel(req, res) {
  const { title, color } = req.body;

  if (!title || !color) {
    return res.status(400).json({
      message: "Title and color are required",
      status: "error",
    });
  }

  try {
    await pool.query(
      `INSERT INTO res_lead_labels (title, color) VALUES (?, ?)`,
      [title, color]
    );

    res.status(201).json({
      message: "Label added successfully",
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

// Update an existing label
async function updateLabel(req, res) {
  const { label_id, title, color } = req.body;

  if (!label_id || !title || !color) {
    return res.status(400).json({
      message: "Label ID, title, and color are required",
      status: "error",
    });
  }

  try {
    await pool.query(
      `UPDATE res_lead_labels SET title = ?, color = ? WHERE label_id = ?`,
      [title, color, label_id]
    );

    res.status(200).json({
      message: "Label updated successfully",
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

// Delete a label
async function deleteLabel(req, res) {
  const { id } = req.params;

  try {
    await pool.query(`DELETE FROM res_lead_labels WHERE label_id = ?`, [id]);

    res.status(200).json({
      message: "Label deleted successfully",
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
  getLabels,
  addLabel,
  updateLabel,
  deleteLabel,
};
