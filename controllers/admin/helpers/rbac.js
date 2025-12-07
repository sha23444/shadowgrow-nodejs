const { pool } = require("../../../config/database");

async function getRoleById(roleId) {
  if (!roleId) {
    return null;
  }

  const [[role]] = await pool.execute(
    "SELECT role_id, role_name, role_key, is_system, description FROM res_roles WHERE role_id = ? LIMIT 1",
    [roleId]
  );

  return role || null;
}

async function getRolePermissions(roleId) {
  if (!roleId) {
    return [];
  }

  const [rows] = await pool.execute(
    `SELECT LOWER(CONCAT(m.module_key, ':', p.permission_name)) AS permission_key
       FROM res_role_permissions rp
       JOIN res_permissions p ON rp.permission_id = p.permission_id
       JOIN res_modules m ON p.module_id = m.module_id
      WHERE rp.role_id = ?`,
    [roleId]
  );

  return rows
    .map(row => row.permission_key)
    .filter(Boolean);
}

async function buildAdminAuthPayload(adminRow) {
  if (!adminRow) {
    return null;
  }

  const role = await getRoleById(adminRow.role_id);
  const permissions = await getRolePermissions(adminRow.role_id);
  const isSuperAdmin =
    !adminRow.role_id ||
    (role && (role.role_key === "super_admin" || role.is_system === 1 || role.is_system === true));

  return {
    id: adminRow.id,
    username: adminRow.username,
    email: adminRow.email,
    first_name: adminRow.first_name,
    last_name: adminRow.last_name,
    phone: adminRow.phone,
    avatar: adminRow.avatar,
    status: adminRow.status,
    two_fa_enabled: adminRow.two_fa_enabled,
    two_fa_secret: adminRow.two_fa_secret,
    role_id: adminRow.role_id || null,
    role_key: role ? role.role_key : null,
    role_name: role ? role.role_name : null,
    role_description: role ? role.description : null,
    role_assigned_at: adminRow.role_assigned_at || null,
    role_assigned_by: adminRow.role_assigned_by || null,
    isSuperAdmin,
    permissions,
  };
}

module.exports = {
  getRoleById,
  getRolePermissions,
  buildAdminAuthPayload,
};


