const { pool } = require("../../../config/database");

// Add a job-skill mapping (unused but included as requested)
async function addJobSkill(req, res) {
  const { job_id, skill_id } = req.body;

  if (!job_id || !skill_id) {
    return res.status(400).json({ error: "Job ID and Skill ID are required." });
  }

  try {
    await pool.execute(
      `INSERT INTO res_job_skills (job_id, skill_id) VALUES (?, ?)`,
      [job_id, skill_id]
    );
    res.status(201).json({ message: "Job skill mapping added successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all job-skill mappings
async function getJobSkills(req, res) {
  try {
    const [jobSkills] = await pool.execute(`SELECT job_id, skill_id FROM res_job_skills`);
    res.status(200).json(jobSkills);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Delete a job-skill mapping
async function deleteJobSkill(req, res) {
  const { job_id, skill_id } = req.body;

  if (!job_id || !skill_id) {
    return res.status(400).json({ error: "Job ID and Skill ID are required." });
  }

  try {
    await pool.execute(
      `DELETE FROM res_job_skills WHERE job_id = ? AND skill_id = ?`,
      [job_id, skill_id]
    );
    res.status(200).json({ message: "Job skill mapping deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addJobSkill,
  getJobSkills,
  deleteJobSkill,
};
