const { pool } = require("../../../config/database");

// Get paginated leads
async function getLeads(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const [leads] = await pool.query(
      `SELECT * FROM res_leads ORDER BY created_at DESC LIMIT ?, ?`,
      [offset, limit]
    );

    const [totalCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_leads`
    );

    res.status(200).json({
      data: leads,
      total: totalCount[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}

// Add a new lead
async function addLead(req, res) {
  const { status_id, source_id, user_id, phone, dial_code, company_name, email, label_id, reference, address, comments } = req.body;

  if (!status_id || !source_id || !user_id || !phone || !dial_code || !label_id) {
    return res.status(400).json({ message: "Missing required fields", status: "error" });
  }

  try {
    await pool.query(
      `INSERT INTO res_leads (status_id, source_id, user_id, phone, dial_code, company_name, email, label_id, reference, address, comments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [status_id, source_id, user_id, phone, dial_code, company_name, email, label_id, reference, address, comments]
    );

    res.status(201).json({ message: "Lead added successfully", status: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}

// Update an existing lead
async function updateLead(req, res) {
  const { lead_id, status_id, source_id, user_id, phone, dial_code, company_name, email, label_id, reference, address, comments } = req.body;

  if (!lead_id) {
    return res.status(400).json({ message: "Lead ID is required", status: "error" });
  }

  try {
    await pool.query(
      `UPDATE res_leads SET status_id = ?, source_id = ?, user_id = ?, phone = ?, dial_code = ?, company_name = ?, email = ?, label_id = ?, reference = ?, address = ?, comments = ? WHERE lead_id = ?`,
      [status_id, source_id, user_id, phone, dial_code, company_name, email, label_id, reference, address, comments, lead_id]
    );

    res.status(200).json({ message: "Lead updated successfully", status: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}

// Delete a lead
async function deleteLead(req, res) {
  const { lead_id } = req.params;

  try {
    await pool.query(`DELETE FROM res_leads WHERE lead_id = ?`, [lead_id]);

    res.status(200).json({ message: "Lead deleted successfully", status: "success" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}

module.exports = { getLeads, addLead, updateLead, deleteLead };
