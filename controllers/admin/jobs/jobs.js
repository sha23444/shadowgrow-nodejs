const { pool } = require("../../../config/database");

// Add a new job
async function addJob(req, res) {
  const {
    title,
    description,
    location,
    salary_range,
    employment_type,
    experience_level,
    expiration_date,
    status = "open",
  } = req.body;

  if (!title || !description || !location || !employment_type || !experience_level || !expiration_date) {
    return res.status(400).json({ error: "All required fields must be provided." });
  }

  try {
    await pool.execute(
      `INSERT INTO res_jobs 
        (title, description, location, salary_range, employment_type, experience_level, posted_date, expiration_date, status) 
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [title, description, location, salary_range, employment_type, experience_level, expiration_date, status]
    );

    res.status(201).json({ message: "Job posted successfully." });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all jobs
async function getAllJobs(req, res) {
  try {
    const [jobs] = await pool.execute(`SELECT * FROM res_jobs`);
    res.status(200).json(jobs);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get a single job by ID
async function getJobById(req, res) {
  const { job_id } = req.params;

  try {
    const [job] = await pool.execute(`SELECT * FROM res_jobs WHERE job_id = ?`, [job_id]);

    if (job.length === 0) {
      return res.status(404).json({ error: "Job not found." });
    }

    res.status(200).json(job[0]);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update a job
async function updateJob(req, res) {
  const { job_id } = req.params;
  const {
    title,
    description,
    location,
    salary_range,
    employment_type,
    experience_level,
    expiration_date,
    status,
  } = req.body;

  if (!title && !description && !location && !salary_range && !employment_type && !experience_level && !expiration_date && !status) {
    return res.status(400).json({ error: "At least one field must be provided to update." });
  }

  const fields = [];
  const values = [];

  if (title) {
    fields.push("title = ?");
    values.push(title);
  }
  if (description) {
    fields.push("description = ?");
    values.push(description);
  }
  if (location) {
    fields.push("location = ?");
    values.push(location);
  }
  if (salary_range) {
    fields.push("salary_range = ?");
    values.push(salary_range);
  }
  if (employment_type) {
    fields.push("employment_type = ?");
    values.push(employment_type);
  }
  if (experience_level) {
    fields.push("experience_level = ?");
    values.push(experience_level);
  }
  if (expiration_date) {
    fields.push("expiration_date = ?");
    values.push(expiration_date);
  }
  if (status) {
    fields.push("status = ?");
    values.push(status);
  }

  values.push(job_id);

  try {
    const [result] = await pool.execute(
      `UPDATE res_jobs SET ${fields.join(", ")} WHERE job_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Job not found." });
    }

    res.status(200).json({ message: "Job updated successfully." });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Delete a job
async function deleteJob(req, res) {
  const { job_id } = req.params;

  try {
    const [result] = await pool.execute(`DELETE FROM res_jobs WHERE job_id = ?`, [job_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Job not found." });
    }

    res.status(200).json({ message: "Job deleted successfully." });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
};
