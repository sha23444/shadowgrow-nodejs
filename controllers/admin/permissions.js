const { pool } = require("../../config/database");
const { isRestrictedModule } = require("../../utils/restrictedModules");

async function listModulesWithPermissions(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT 
          m.module_id,
          m.module_key,
          m.module_name,
          m.description AS module_description,
          m.is_system,
          p.permission_id,
          p.permission_name,
          p.description AS permission_description
        FROM res_modules m
        LEFT JOIN res_permissions p ON p.module_id = m.module_id
        ORDER BY m.module_key ASC, p.permission_name ASC`
    );

    const modules = [];
    const moduleMap = new Map();

    for (const row of rows) {
      const moduleKey = row.module_key || '';
      
      // Filter out restricted modules (super-admin only)
      if (isRestrictedModule(moduleKey)) {
        continue;
      }

      if (!moduleMap.has(row.module_id)) {
        const module = {
          module_id: row.module_id,
          module_key: row.module_key,
          module_name: row.module_name,
          description: row.module_description,
          is_system: Boolean(row.is_system),
          permissions: [],
        };
        moduleMap.set(row.module_id, module);
        modules.push(module);
      }

      if (row.permission_id) {
        moduleMap.get(row.module_id).permissions.push({
          permission_id: row.permission_id,
          permission_name: row.permission_name,
          description: row.permission_description,
          permission_key: `${row.module_key}:${row.permission_name}`.toLowerCase(),
        });
      }
    }

    return res.status(200).json({
      status: "success",
      data: modules,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error fetching modules and permissions",
    });
  }
}

module.exports = {
  listModulesWithPermissions,
};


