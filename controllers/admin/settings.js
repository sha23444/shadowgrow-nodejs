const { pool } = require("../../config/database");

// Get all options
async function getAllOptions(req, res) {
  try {
    const [optionsResult] = await pool.execute(
      `SELECT option_id, option_name, option_value FROM res_options`
    );

    const options = {};

    optionsResult.forEach((option) => {
      options[option.option_name] = option.option_value;
    });

    return res.status(200).json({
      options,
    });
  } catch (error) {
    console.error("Error fetching options:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getAllOptions,
};
