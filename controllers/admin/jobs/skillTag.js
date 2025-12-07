const { pool } = require("../../../config/database");

// Add a new skill tag
async function addSkillTag(req, res) {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Skill name is required." });
  }

  try {
    const [existingSkill] = await pool.execute(
      `SELECT * FROM res_skill_tags WHERE name = ?`,
      [name]
    );

    if (existingSkill.length) {
      return res.status(400).json({ error: "Skill name already exists." });
    }

    await pool.execute(`INSERT INTO res_skill_tags (name) VALUES (?)`, [name]);
    res.status(201).json({ message: "Skill added successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all skill tags
async function getSkillTags(req, res) {
  try {
    const [skills] = await pool.execute(
      `SELECT skill_id, name FROM res_skill_tags`
    );
    res.status(200).json(skills);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update a skill tag
async function updateSkillTag(req, res) {
  const { skill_id, name } = req.body;

  if (!skill_id || !name) {
    return res.status(400).json({ error: "Skill ID and name are required." });
  }

  try {
    await pool.execute(
      `UPDATE res_skill_tags SET name = ? WHERE skill_id = ?`,
      [name, skill_id]
    );
    res.status(200).json({ message: "Skill updated successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Delete a skill tag
async function deleteSkillTag(req, res) {
  const { skill_id } = req.body;

  if (!skill_id) {
    return res.status(400).json({ error: "Skill ID is required." });
  }

  try {
    await pool.execute(`DELETE FROM res_skill_tags WHERE skill_id = ?`, [
      skill_id,
    ]);
    res.status(200).json({ message: "Skill deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addSkillTag,
  getSkillTags,
  updateSkillTag,
  deleteSkillTag,
};
