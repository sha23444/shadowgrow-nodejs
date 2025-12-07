const { pool } = require("../../../config/database");

// Add a new job application
async function addJobApplication(req, res) {
  const { job_id, candidate_name, candidate_email, resume, cover_letter } =
    req.body;

  if (!job_id || !candidate_name || !candidate_email) {
    return res
      .status(400)
      .json({ error: "Job ID, candidate name, and email are required." });
  }

  try {
    await pool.execute(
      `INSERT INTO res_job_applications (job_id, candidate_name, candidate_email, resume, cover_letter)
       VALUES (?, ?, ?, ?, ?)`,
      [job_id, candidate_name, candidate_email, resume, cover_letter]
    );
    res.status(201).json({ message: "Job application submitted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all job applications
async function getJobApplications(req, res) {
  try {
    const [applications] = await pool.execute(
      `SELECT application_id, job_id, candidate_name, candidate_email, resume, cover_letter, application_status, applied_date FROM res_job_applications`
    );
    res.status(200).json(applications);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update job application status
async function updateApplicationStatus(req, res) {
  const { application_id, application_status } = req.body;

  if (!application_id || !application_status) {
    return res
      .status(400)
      .json({ error: "Application ID and status are required." });
  }

  try {
    await pool.execute(
      `UPDATE res_job_applications SET application_status = ? WHERE application_id = ?`,
      [application_status, application_id]
    );
    res
      .status(200)
      .json({ message: "Application status updated successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Delete a job application
async function deleteJobApplication(req, res) {
  const { application_id } = req.body;

  if (!application_id) {
    return res.status(400).json({ error: "Application ID is required." });
  }

  try {
    await pool.execute(
      `DELETE FROM res_job_applications WHERE application_id = ?`,
      [application_id]
    );
    res.status(200).json({ message: "Application deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addJobApplication,
  getJobApplications,
  updateApplicationStatus,
  deleteJobApplication,
};
