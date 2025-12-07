const { pool } = require("../../config/database");
const { isRestrictedModule } = require("../../utils/restrictedModules");

const ROLE_TABLE = "res_roles";
const PERMISSION_TABLE = "res_permissions";
const ROLE_PERMISSION_TABLE = "res_role_permissions";
const MODULE_TABLE = "res_modules";
const SUPER_ADMIN_ROLE_KEY = "super_admin";

const slugify = (value) =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);

async function getRoleByKey(roleKey) {
  const [rows] = await pool.query(`SELECT * FROM ${ROLE_TABLE} WHERE role_key = ? LIMIT 1`, [
    roleKey,
  ]);
  return rows[0];
}

async function createRole(req, res) {
  const { role_name, role_key, description } = req.body || {};

  if (!role_name || !role_name.trim()) {
    return res.status(400).json({ status: "error", message: "role_name is required" });
  }

  const normalizedKey = (role_key && slugify(role_key)) || slugify(role_name);

  try {
    const [existing] = await pool.query(
      `SELECT role_id FROM ${ROLE_TABLE} WHERE role_name = ? OR role_key = ? LIMIT 1`,
      [role_name.trim(), normalizedKey]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "A role with the same name or key already exists.",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO ${ROLE_TABLE} (role_name, role_key, description, is_system) VALUES (?, ?, ?, 0)`,
      [role_name.trim(), normalizedKey, description || null]
    );

    const [[created]] = await pool.query(
      `SELECT role_id, role_name, role_key, description, is_system FROM ${ROLE_TABLE} WHERE role_id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      status: "success",
      message: "Role created successfully.",
      data: created,
    });
  } catch (error) {
    console.error("createRole error:", error);
    return res.status(500).json({ status: "error", message: "Error creating role" });
  }
}

async function getRoles(req, res) {
  try {
    const [roles] = await pool.query(
      `SELECT r.role_id, r.role_name, r.role_key, r.description, r.is_system, 
              COUNT(DISTINCT rp.permission_id) AS permission_count,
              COUNT(DISTINCT a.id) AS admin_count
         FROM ${ROLE_TABLE} r
         LEFT JOIN ${ROLE_PERMISSION_TABLE} rp ON rp.role_id = r.role_id
         LEFT JOIN res_admins a ON a.role_id = r.role_id
        GROUP BY r.role_id
        ORDER BY r.role_name ASC`
    );

    return res.status(200).json({
      status: "success",
      data: roles,
    });
  } catch (error) {
    console.error("getRoles error:", error);
    return res.status(500).json({ status: "error", message: "Error fetching roles" });
  }
}

async function getRoleById(req, res) {
  const { roleId } = req.params;
  try {
    const [[role]] = await pool.query(
      `SELECT role_id, role_name, role_key, description, is_system FROM ${ROLE_TABLE} WHERE role_id = ?`,
      [roleId]
    );
    if (!role) {
      return res.status(404).json({ status: "error", message: "Role not found" });
    }

    const [permissions] = await pool.query(
      `SELECT p.permission_id,
              p.permission_name,
              m.module_id,
              m.module_key,
              m.module_name
         FROM ${ROLE_PERMISSION_TABLE} rp
         JOIN ${PERMISSION_TABLE} p ON p.permission_id = rp.permission_id
         JOIN ${MODULE_TABLE} m ON m.module_id = p.module_id
        WHERE rp.role_id = ?
        ORDER BY m.module_key, p.permission_name`,
      [roleId]
    );

    return res.status(200).json({
      status: "success",
      data: { ...role, permissions },
    });
  } catch (error) {
    console.error("getRoleById error:", error);
    return res.status(500).json({ status: "error", message: "Error fetching role" });
  }
}

async function updateRole(req, res) {
  const { roleId } = req.params;
  const { role_name, role_key, description } = req.body || {};

  try {
    const [[existing]] = await pool.query(
      `SELECT role_id, role_key, role_name, is_system FROM ${ROLE_TABLE} WHERE role_id = ?`,
      [roleId]
    );
    if (!existing) {
      return res.status(404).json({ status: "error", message: "Role not found" });
    }

    if (existing.is_system && existing.role_key === SUPER_ADMIN_ROLE_KEY) {
      return res.status(403).json({
        status: "error",
        message: "Super admin role cannot be modified.",
      });
    }

    const updates = [];
    const values = [];

    if (role_name !== undefined) {
      const nameValue = role_name && role_name.trim();
      if (!nameValue) {
        return res
          .status(400)
          .json({ status: "error", message: "role_name cannot be empty" });
      }
      updates.push("role_name = ?");
      values.push(nameValue);
    }

    if (role_key !== undefined) {
      const keyValue = slugify(role_key);
      if (!keyValue) {
        return res.status(400).json({ status: "error", message: "role_key cannot be empty" });
      }
      updates.push("role_key = ?");
      values.push(keyValue);
    }

    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ status: "error", message: "No updates provided" });
    }

    const [dupCheck] = await pool.query(
      `SELECT role_id FROM ${ROLE_TABLE} WHERE (role_name = ? OR role_key = ?) AND role_id <> ? LIMIT 1`,
      [role_name || existing.role_name, role_key ? slugify(role_key) : existing.role_key, roleId]
    );
    if (dupCheck.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "Another role with the same name or key already exists.",
      });
    }

    values.push(roleId);
    await pool.query(
      `UPDATE ${ROLE_TABLE} SET ${updates.join(", ")} WHERE role_id = ?`,
      values
    );

    const [[updated]] = await pool.query(
      `SELECT role_id, role_name, role_key, description, is_system FROM ${ROLE_TABLE} WHERE role_id = ?`,
      [roleId]
    );

    return res.status(200).json({
      status: "success",
      message: "Role updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("updateRole error:", error);
    return res.status(500).json({ status: "error", message: "Error updating role" });
  }
}

async function deleteRole(req, res) {
  const { roleId } = req.params;
  try {
    const [[role]] = await pool.query(
      `SELECT role_id, role_key, is_system FROM ${ROLE_TABLE} WHERE role_id = ?`,
      [roleId]
    );
    if (!role) {
      return res.status(404).json({ status: "error", message: "Role not found" });
    }

    if (role.is_system) {
      return res.status(403).json({
        status: "error",
        message: "System roles cannot be deleted.",
      });
    }

    const [adminUsage] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM res_admins WHERE role_id = ?",
      [roleId]
    );
    if (adminUsage[0].cnt > 0) {
      return res.status(409).json({
        status: "error",
        message: "Role is assigned to administrators and cannot be deleted.",
      });
    }

    await pool.query(`DELETE FROM ${ROLE_PERMISSION_TABLE} WHERE role_id = ?`, [roleId]);
    await pool.query(`DELETE FROM ${ROLE_TABLE} WHERE role_id = ?`, [roleId]);

    return res.status(200).json({
      status: "success",
      message: "Role deleted successfully.",
    });
  } catch (error) {
    console.error("deleteRole error:", error);
    return res.status(500).json({ status: "error", message: "Error deleting role" });
  }
}

async function assignPermissions(req, res) {
  const { roleId } = req.params;
  const { permissions } = req.body || {};

  if (!Array.isArray(permissions)) {
    return res.status(400).json({
      status: "error",
      message: "permissions must be an array of permission IDs.",
    });
  }

  const uniquePermissionIds = [...new Set(permissions.map(Number).filter((id) => !isNaN(id)))];

  try {
    const [[role]] = await pool.query(
      `SELECT role_id, role_key, is_system FROM ${ROLE_TABLE} WHERE role_id = ?`,
      [roleId]
    );

    if (!role) {
      return res.status(404).json({ status: "error", message: "Role not found" });
    }

    if (role.role_key === SUPER_ADMIN_ROLE_KEY && role.is_system) {
      return res.status(403).json({
        status: "error",
        message: "Super admin role automatically has full access and cannot be modified.",
      });
    }

    // Check if trying to assign restricted permissions to non-super-admin role
    if (role.role_key !== SUPER_ADMIN_ROLE_KEY && uniquePermissionIds.length > 0) {
      const [permissionsWithModules] = await pool.query(
        `SELECT p.permission_id, m.module_key
         FROM ${PERMISSION_TABLE} p
         JOIN ${MODULE_TABLE} m ON p.module_id = m.module_id
         WHERE p.permission_id IN (?)`,
        [uniquePermissionIds]
      );

      const restrictedPermissions = permissionsWithModules.filter((perm) =>
        isRestrictedModule(perm.module_key)
      );

      if (restrictedPermissions.length > 0) {
        const restrictedModuleNames = [...new Set(restrictedPermissions.map((p) => p.module_key))];
        return res.status(403).json({
          status: "error",
          message: "These permissions can only be assigned to super admin role.",
          invalidPermissionIds: restrictedPermissions.map((p) => p.permission_id),
          restrictedModules: restrictedModuleNames,
        });
      }
    }

    const [existingPermissions] = await pool.query(
      `SELECT permission_id FROM ${PERMISSION_TABLE} WHERE permission_id IN (?)`,
      [uniquePermissionIds.length > 0 ? uniquePermissionIds : [0]]
    );
    const foundPermissionIds = new Set(existingPermissions.map((row) => row.permission_id));

    const missing = uniquePermissionIds.filter((id) => !foundPermissionIds.has(id));
    if (missing.length > 0) {
      return res.status(400).json({
        status: "error",
        message: "One or more permission IDs are invalid.",
        invalidPermissionIds: missing,
      });
    }

    await pool.query(
      `DELETE FROM ${ROLE_PERMISSION_TABLE} WHERE role_id = ?`,
      [roleId]
    );

    if (uniquePermissionIds.length > 0) {
      const values = uniquePermissionIds.map((permissionId) => [roleId, permissionId]);
      await pool.query(
        `INSERT INTO ${ROLE_PERMISSION_TABLE} (role_id, permission_id) VALUES ?`,
        [values]
      );
    }

    return res.status(200).json({
      status: "success",
      message: "Permissions updated successfully.",
    });
  } catch (error) {
    console.error("assignPermissions error:", error);
    return res.status(500).json({ status: "error", message: "Error assigning permissions" });
  }
}

async function getPermissionsForRole(req, res) {
  const { roleId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT p.permission_id,
              p.permission_name,
              p.description,
              m.module_id,
              m.module_key,
              m.module_name
         FROM ${ROLE_PERMISSION_TABLE} rp
         JOIN ${PERMISSION_TABLE} p ON p.permission_id = rp.permission_id
         JOIN ${MODULE_TABLE} m ON m.module_id = p.module_id
        WHERE rp.role_id = ?
        ORDER BY m.module_key, p.permission_name`,
      [roleId]
    );

    return res.status(200).json({
      status: "success",
      data: rows,
    });
  } catch (error) {
    console.error("getPermissionsForRole error:", error);
    return res.status(500).json({ status: "error", message: "Error fetching permissions" });
  }
}

module.exports = {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
  assignPermissions,
  getPermissionsForRole,
};
