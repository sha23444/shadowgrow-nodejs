const { pool } = require("../../../config/database");

async function getLeadSources(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const [result] = await pool.query(
      `SELECT * FROM res_lead_sources LIMIT ?, ?`,
      [offset, limit]
    );
    const [totalCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_lead_sources`
    );

    res.status(200).json({
      data: result,
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

async function addSource(req, res) {
  const { name, status = 1, color, type } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "Name is required",
      status: "error",
    });
  }

  try {
    
    // Insert the new record with the calculated position
    await pool.query(
      `INSERT INTO res_lead_sources (name, status, color, type) VALUES (?, ?, ?, ?)`,
      [name, status, type, color]
    );

    res.status(201).json({
      message: "Source added successfully",
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

async function updateSource(req, res) {
  const { name, status, color, source_id, type } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "Name is required",
      status: "error",
    });
  }

  try {
    await pool.query(
      `UPDATE res_lead_sources SET name = ?, status = ?, color = ?, type = ? WHERE source_id = ?`,
      [name, status, color, type, source_id]
    );

    res.status(200).json({
      message: "Source updated successfully",
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

async function deleteSource(req, res) {
  const { id } = req.params;

  try {
    await pool.query(`DELETE FROM res_lead_sources WHERE source_id = ?`, [id]);

    res.status(200).json({
      message: "Source deleted successfully",
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
  getLeadSources,
  addSource,
  updateSource,
  deleteSource,
};
