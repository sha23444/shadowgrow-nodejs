const { pool } = require("../../config/database");

async function getApiPermissions(req, res) {
  try {
    const [rows] = await pool.execute("SELECT * FROM res_api_permissions");

    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching API Permissions:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function addApiKey(req, res) {
  try {
    const {
      title,
      api_key,
      api_secret,
      whitelisted_ips,
      blacklisted_ips,
      status,
      permissions,
    } = req.body;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO res_apis (title, api_key, api_secret, whitelisted_ips, blacklisted_ips, status) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        title,
        api_key,
        api_secret,
        JSON.stringify(whitelisted_ips),
        JSON.stringify(blacklisted_ips),
        status,
      ]
    );

    const apiKeyId = result.insertId;

    if (permissions && permissions.length > 0) {
      const permissionValues = permissions.map(({ id, status }) => [
        apiKeyId,
        id,
        status,
      ]);

      await connection.query(
        `INSERT INTO res_api_key_permissions (api_key_id, permission_id, status) VALUES ?`,
        [permissionValues]
      );
    }

    await connection.commit();
    connection.release();

    return res.status(201).json({
      message: "API Key added successfully",
      apiKeyId,
    });
  } catch (error) {
    console.error("Error adding API Key:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}


async function getApiKeys(req, res) {
    try {
        const limit = parseInt(req.query.limit, 10) || 10;
        const offset = parseInt(req.query.offset, 10) || 0;

        const [rows] = await pool.execute(
            `SELECT api_key_id, title, api_key, status FROM res_apis ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [[{ total }]] = await pool.execute(
            `SELECT COUNT(*) as total FROM res_apis`
        );

        return res.status(200).json({
            data: rows,
            pagination: {
                total,
                limit,
                offset,
            },
        });
    } catch (error) {
        console.error("Error fetching API Keys:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}

async function getApiKeyDetails(req, res) {
    try {

        const id = req.params.id;

        const [rows] = await pool.execute(
            `SELECT * FROM res_apis WHERE api_key_id = ?`,
            [id]
        );

        const [permissions] = await pool.execute(
            `SELECT permission_id, status FROM res_api_key_permissions WHERE api_key_id = ?`,
            [id]
        );

        return res.status(200).json({
            ...rows[0],
            whitelisted_ips: JSON.parse(rows[0].whitelisted_ips),
            blacklisted_ips: JSON.parse(rows[0].blacklisted_ips),
            permissions,
        });
    } catch (error) {
        console.error("Error fetching API Key details:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}

async function updateApiKey(req, res) {
    try {
      const {
        id,
        title,
        api_key,
        api_secret,
        whitelisted_ips,
        blacklisted_ips,
        status,
        permissions,
      } = req.body;
  
      const connection = await pool.getConnection();
      await connection.beginTransaction();
  
      // Corrected SQL syntax
      await connection.execute(
        `UPDATE res_apis 
         SET title = ?, api_key = ?, api_secret = ?, whitelisted_ips = ?, blacklisted_ips = ?, status = ? 
         WHERE api_key_id = ?`,
        [
          title,
          api_key,
          api_secret,
          JSON.stringify(whitelisted_ips),
          JSON.stringify(blacklisted_ips),
          status,
          id,
        ]
      );
  
      // Fix: Use api_key_id instead of id
      await connection.execute(
        `DELETE FROM res_api_key_permissions WHERE api_key_id = ?`,
        [id]
      );
  
      if (permissions && permissions.length > 0) {
        const permissionValues = permissions.map(({ id, status }) => [
          id,
          status,
        ]).map(([permissionId, status]) => [id, permissionId, status]);
  
        await connection.query(
          `INSERT INTO res_api_key_permissions (api_key_id, permission_id, status) VALUES ?`,
          [permissionValues]
        );
      }
  
      await connection.commit();
      connection.release();
  
      return res.status(200).json({ message: "API Key updated successfully" });
    } catch (error) {
      console.error("Error updating API Key:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
  

async function deleteApiKey(req, res) {
  try {
    const id = req.params.id;

    await pool.execute(`DELETE FROM res_apis WHERE api_key_id = ?`, [id]);

    await pool.execute(
      `DELETE FROM res_api_key_permissions WHERE api_key_id = ?`,
      [id]
    );

    return res.status(200).json({ message: "API Key deleted successfully" });
  } catch (error) {
    console.error("Error deleting API Key:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getApiPermissions,
  addApiKey,
  getApiKeys,
    getApiKeyDetails,
  updateApiKey,
  deleteApiKey,
};
