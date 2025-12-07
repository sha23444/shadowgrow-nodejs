const jwt = require("jsonwebtoken");
const { pool, secretKey } = require("../config/database");
const { buildAdminAuthPayload } = require("../controllers/admin/helpers/rbac");

const isDisabledStatus = (status) => {
  if (status === undefined || status === null) return false;
  const normalized = String(status).trim().toLowerCase();
  return ["disabled", "inactive", "0", "false"].includes(normalized);
};

async function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authorization header missing or invalid" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, secretKey);

    const [rows] = await pool.execute(
      "SELECT * FROM res_admins WHERE username = ? LIMIT 1",
      [decoded.username]
    );

    const adminRow = rows[0];
    if (!adminRow) {
      return res.status(403).json({ error: "Forbidden: user is not an admin" });
    }

    if (isDisabledStatus(adminRow.status)) {
      return res.status(403).json({
        error: "Admin account is disabled. Please contact a super administrator.",
      });
    }

    const adminContext = await buildAdminAuthPayload(adminRow);
    req.admin = adminContext;
    req.user = { ...adminContext };

    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired, please login again" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token, please login again" });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = authenticateAdmin;
