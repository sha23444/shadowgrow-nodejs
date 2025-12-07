const { pool } = require("../config/database");

const checkApiKeyMiddleware = async (req, res, next) => {
  try {



    if (req.hostname === "localhost") {
      return next(); // Skip API key validation for localhost
    }

    const apiKey = req.headers["x-api-key"]; // Expect API key in headers
    if (!apiKey) {
      return res.status(401).json({ error: "API Key is required" });
    }

    const connection = await pool.getConnection();

    // Fetch API key details
    const [apiKeys] = await connection.execute(
      `SELECT * FROM res_apis WHERE api_key = ?`,
      [apiKey]
    );

    if (apiKeys.length === 0) {
      connection.release();
      return res.status(403).json({ error: "Invalid API Key" });
    }

    const apiKeyData = apiKeys[0];

    // Check if API Key is active
    if (apiKeyData.status !== 0) {
      connection.release();
      return res.status(403).json({ error: "API Key is not active" });
    }

    // Get the client IP
    const clientIp = 'l';

    // Check blacklisted IPs
    const blacklistedIps = JSON.parse(apiKeyData.blacklisted_ips || "[]");
    if (blacklistedIps.includes(clientIp)) {
      connection.release();
      return res.status(403).json({ error: "Access denied: Blacklisted IP" });
    }

    // Check whitelisted IPs (if whitelist is not empty)
    const whitelistedIps = JSON.parse(apiKeyData.whitelisted_ips || "[]");
    if (whitelistedIps.length > 0 && !whitelistedIps.includes(clientIp)) {
      connection.release();
      return res
        .status(403)
        .json({ error: "Access denied: IP not whitelisted" });
    }

    // Fetch API Key permissions
    
    // will implement later based on permission to acess the particular route

    connection.release();
    next(); // Continue to the actual API route
  } catch (error) {
//     // console.error("Middleware Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = checkApiKeyMiddleware;