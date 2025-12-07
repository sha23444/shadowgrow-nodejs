const { pool } = require("../../config/database");

async function getAllModules(req, res) {
  try {
    const [modules] = await pool.query(`SELECT * FROM res_modules`);

    res.status(200).json({
      data: modules,
      status: "success",
    });
  } catch (err) {
    console.log(err);
    
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

module.exports = {
  getAllModules,
};
