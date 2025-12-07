const { pool } = require("../../../config/database");

async function getOverview(req, res) {
  const { id } = req.user;

  try {
    const [user] = await pool.execute(
      `SELECT first_name, username, last_name, email, created_at, last_login_at, balance, ip_address, status FROM res_users WHERE user_id = ?`,
      [id]
    );

    res.status(200).json({
      data: user[0],
      status: "success",
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getOverview,
};
