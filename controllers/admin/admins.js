const { pool } = require("../../config/database");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const adminsController = {
  // List admins with pagination and basic info
  async list(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const perPage = parseInt(req.query.perPage, 10) || 20;
      const offset = (page - 1) * perPage;

      const [countRows] = await pool.execute("SELECT COUNT(*) AS total FROM res_admins");
      const total = countRows[0]?.total || 0;

      const [rows] = await pool.execute(
        `SELECT 
           a.id,
           a.username,
           a.email,
           a.first_name,
           a.last_name,
           a.phone,
           a.avatar,
           a.status,
           a.two_fa_enabled,
           a.created_at,
           a.updated_at,
           a.last_login_at,
           a.role_id,
           a.role_assigned_at,
           a.role_assigned_by,
           r.role_key,
           r.role_name,
           r.role_key AS role
         FROM res_admins a
         LEFT JOIN res_roles r ON a.role_id = r.role_id
         ORDER BY a.id DESC
         LIMIT ? OFFSET ?`,
        [perPage, offset]
      );

      res.status(200).json({
        status: "success",
        data: rows,
        meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) }
      });
    } catch (error) {
      console.error("List admins error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Get single admin details along with (optional) role and permissions
  async getById(req, res) {
    try {
      const { id } = req.params;
      const [[admin]] = await pool.execute(
        `SELECT 
           a.*,
           r.role_key,
           r.role_name,
           r.is_system
         FROM res_admins a
         LEFT JOIN res_roles r ON a.role_id = r.role_id
         WHERE a.id = ?`,
        [id]
      );
      if (!admin) return res.status(404).json({ error: "Admin not found" });

      // Attempt to fetch role and permissions if role_id exists in schema
      let permissions = [];
      const [permRows] = await pool.execute(
        `SELECT 
           p.permission_id,
           p.permission_name,
           p.description,
           m.module_key,
           m.module_name
         FROM res_role_permissions rp
         JOIN res_permissions p ON rp.permission_id = p.permission_id
         JOIN res_modules m ON p.module_id = m.module_id
        WHERE rp.role_id = ?`,
        [admin.role_id || 0]
      );
      permissions = permRows;

      const role =
        admin.role_id && admin.role_key
          ? {
              role_id: admin.role_id,
              role_key: admin.role_key,
              role_name: admin.role_name,
              is_system: !!admin.is_system,
            }
          : null;

      res.status(200).json({
        status: "success",
        data: {
          admin,
          role,
          permissions,
        },
      });
    } catch (error) {
      console.error("Get admin error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  async create(req, res) {
    try {
      const {
        username,
        password,
        email,
        first_name,
        last_name,
        phone,
        status = "active",
        role_id: incomingRoleId,
      } = req.body || {};
      if (!username || !password || !email) {
        return res.status(400).json({ error: "username, password and email are required" });
      }

      const [[existingUsername]] = await pool.execute("SELECT id FROM res_admins WHERE username = ?", [username]);
      if (existingUsername) return res.status(409).json({ error: "Username already exists" });

      const [[existingEmail]] = await pool.execute("SELECT id FROM res_admins WHERE email = ?", [email]);
      if (existingEmail) return res.status(409).json({ error: "Email already exists" });

      let assignedRoleId = null;
      if (incomingRoleId !== undefined && incomingRoleId !== null && incomingRoleId !== "") {
        const roleIdNumeric = Number(incomingRoleId);
        if (Number.isNaN(roleIdNumeric)) {
          return res.status(400).json({ error: "role_id must be a numeric value" });
        }
        const [[role]] = await pool.execute(
          "SELECT role_id, role_key FROM res_roles WHERE role_id = ?",
          [roleIdNumeric]
        );
        if (!role) {
          return res.status(400).json({ error: "Invalid role_id provided" });
        }
        assignedRoleId = role.role_id;
      }

      const hashed = await bcrypt.hash(password, 10);
      // Normalize optional fields to SQL NULL when missing/blank
      const firstNameValue = (first_name === undefined ? null : first_name);
      const lastNameValue = (last_name === undefined ? null : last_name);
      const phoneValue = (phone === undefined || phone === null || String(phone).trim() === "") ? null : phone;
      const [result] = await pool.execute(
        `INSERT INTO res_admins 
          (username, password, email, first_name, last_name, phone, status, role_id, role_assigned_at, role_assigned_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          username,
          hashed,
          email,
          firstNameValue,
          lastNameValue,
          phoneValue,
          status,
          assignedRoleId,
          assignedRoleId ? new Date() : null,
          assignedRoleId ? (req.admin?.username || req.user?.username || null) : null,
        ]
      );

      const [[created]] = await pool.execute(
        `SELECT 
           a.id,
           a.username,
           a.email,
           a.first_name,
           a.last_name,
           a.phone,
           a.status,
           a.role_id,
           a.role_assigned_at,
           a.role_assigned_by,
           r.role_key,
           r.role_name
         FROM res_admins a
         LEFT JOIN res_roles r ON a.role_id = r.role_id
         WHERE a.id = ?`,
        [result.insertId]
      );

      res.status(201).json({ status: "success", data: created });
    } catch (error) {
      console.error("Create admin error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Check username/email availability (validation only, no creation)
  async checkUsernameEmail(req, res) {
    try {
      const { username, email } = req.body;
      if (!username && !email) {
        return res.status(400).json({ error: "Provide username or email to validate" });
      }

      let usernameAvailable = null;
      let emailAvailable = null;

      if (username) {
        const [[userByUsername]] = await pool.execute("SELECT id FROM res_admins WHERE username = ?", [username]);
        usernameAvailable = !userByUsername;
      }

      if (email) {
        const [[userByEmail]] = await pool.execute("SELECT id FROM res_admins WHERE email = ?", [email]);
        emailAvailable = !userByEmail;
      }

      return res.status(200).json({
        status: "success",
        available: { username: usernameAvailable, email: emailAvailable }
      });
    } catch (error) {
      console.error("checkUsernameEmail error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Update admin basic details (optional helper)
  async update(req, res) {
    try {
      const { id } = req.params;
      const { username, email, first_name, last_name, phone, status, role_id } = req.body || {};

      const fields = [];
      const values = [];
      // Optional: change username with uniqueness check
      if (username !== undefined) {
        const [[u]] = await pool.execute("SELECT id FROM res_admins WHERE username = ? AND id != ?", [username, id]);
        if (u) return res.status(409).json({ error: "Username already in use" });
        fields.push("username = ?");
        values.push(username);
      }
      // Optional: change email with uniqueness check
      if (email !== undefined) {
        const [[e]] = await pool.execute("SELECT id FROM res_admins WHERE email = ? AND id != ?", [email, id]);
        if (e) return res.status(409).json({ error: "Email already in use" });
        fields.push("email = ?");
        values.push(email);
      }
      if (first_name !== undefined) { fields.push("first_name = ?"); values.push(first_name); }
      if (last_name !== undefined) { fields.push("last_name = ?"); values.push(last_name); }
      if (phone !== undefined) {
        const phoneValue = (phone === null || String(phone).trim() === "") ? null : phone;
        fields.push("phone = ?");
        values.push(phoneValue);
      }
      if (status !== undefined) {
        const norm = (() => {
          if (typeof status === 'string') {
            const s = status.toLowerCase();
            if (s === '1' || s === 'active' || s === 'true') return 'active';
            if (s === '0' || s === 'disabled' || s === 'inactive' || s === 'false') return 'disabled';
            return status; // pass-through for other schemas
          }
          if (status === 1 || status === true) return 'active';
          if (status === 0 || status === false) return 'disabled';
          return status;
        })();
        fields.push("status = ?");
        values.push(norm);
      }

      if (role_id !== undefined) {
        let newRoleId = null;
        if (role_id !== null && role_id !== "") {
          const numericRoleId = Number(role_id);
          if (Number.isNaN(numericRoleId)) {
            return res.status(400).json({ error: "role_id must be numeric" });
          }
          const [[role]] = await pool.execute(
            "SELECT role_id FROM res_roles WHERE role_id = ?",
            [numericRoleId]
          );
          if (!role) {
            return res.status(400).json({ error: "Invalid role_id provided" });
          }
          newRoleId = numericRoleId;
        }

        fields.push("role_id = ?");
        values.push(newRoleId);
        fields.push("role_assigned_at = ?");
        values.push(newRoleId ? new Date() : null);
        fields.push("role_assigned_by = ?");
        values.push(newRoleId ? (req.admin?.username || req.user?.username || null) : null);
      }

      if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

      values.push(id);
      await pool.execute(`UPDATE res_admins SET ${fields.join(", ")} WHERE id = ?`, values);

      const [[updated]] = await pool.execute(
        `SELECT 
           a.*,
           r.role_key,
           r.role_name
         FROM res_admins a
         LEFT JOIN res_roles r ON a.role_id = r.role_id
         WHERE a.id = ?`,
        [id]
      );
      res.status(200).json({ status: "success", data: updated });
    } catch (error) {
      console.error("Update admin error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Delete admin (prevent self-delete)
  async remove(req, res) {
    try {
      const { id } = req.params;
      if (req.user?.id && Number(id) === Number(req.user.id)) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }

      const [[target]] = await pool.execute(
        `SELECT a.id, a.role_id, r.role_key, r.is_system
           FROM res_admins a
           LEFT JOIN res_roles r ON a.role_id = r.role_id
          WHERE a.id = ?`,
        [id]
      );
      if (!target) {
        return res.status(404).json({ error: "Admin not found" });
      }
      if (target.role_key === "super_admin" && target.is_system) {
        return res.status(403).json({ error: "Super admin account cannot be deleted." });
      }

      await pool.execute("DELETE FROM res_admins WHERE id = ?", [id]);
      res.status(200).json({ status: "success", message: "Admin deleted" });
    } catch (error) {
      console.error("Delete admin error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Enable/disable admin
  async setStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body || {};

      // Read current status first
      const [[current]] = await pool.execute("SELECT status FROM res_admins WHERE id = ?", [id]);
      if (!current) return res.status(404).json({ error: "Admin not found" });

      let newStatus;
      if (status !== undefined) {
        // Normalize incoming variants
        const s = String(status).toLowerCase();
        if (s === "1" || s === "active" || s === "true") newStatus = "active";
        else if (s === "0" || s === "disabled" || s === "inactive" || s === "false") newStatus = "disabled";
        else newStatus = s; // pass-through if you use custom values
      } else {
        // Toggle when not provided
        newStatus = current.status === "active" ? "disabled" : "active";
      }

      await pool.execute("UPDATE res_admins SET status = ? WHERE id = ?", [newStatus, id]);
      const [[row]] = await pool.execute("SELECT * FROM res_admins WHERE id = ?", [id]);
      res.status(200).json({ status: "success", data: row });
    } catch (error) {
      console.error("Set status error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Change password for a specific admin by id
  async changePassword(req, res) {
    try {
      const { id } = req.params;
      const { new_password } = req.body || {};

      if (!new_password) {
        return res.status(400).json({ error: "new_password is required" });
      }
      if (String(new_password).length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const [[admin]] = await pool.execute("SELECT id FROM res_admins WHERE id = ?", [id]);
      if (!admin) return res.status(404).json({ error: "Admin not found" });

      const hashed = await bcrypt.hash(new_password, 10);
      await pool.execute(
        "UPDATE res_admins SET password = ?, updated_at = NOW() WHERE id = ?",
        [hashed, id]
      );

      res.status(200).json({ status: "success", message: "Password updated successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // Generate backup codes for 2FA (reuse from auth controller)
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      // Generate 12-character alphanumeric code
      const code = crypto.randomBytes(6).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  },

  // 1. Download backup codes for any admin
  async downloadBackupCodes(req, res) {
    try {
      const { id } = req.params;
      
      // Get admin details
      const [[admin]] = await pool.execute(
        "SELECT id, username, email, first_name, last_name, two_fa_enabled, two_fa_backup_codes FROM res_admins WHERE id = ?",
        [id]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this admin" });
      }

      if (!admin.two_fa_backup_codes) {
        return res.status(404).json({ error: "No backup codes found for this admin" });
      }

      let backupCodes;
      try {
        backupCodes = JSON.parse(admin.two_fa_backup_codes);
      } catch (error) {
        return res.status(500).json({ error: "Invalid backup codes format" });
      }

      // Return backup codes as JSON array
      res.status(200).json({
        success: true,
        backupCodes: backupCodes
      });
    } catch (error) {
      console.error("Download backup codes error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 2. Reset 2FA for any admin
  async reset2FA(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Get admin details
      const [[admin]] = await pool.execute(
        "SELECT id, username, email, first_name, last_name, two_fa_enabled FROM res_admins WHERE id = ?",
        [id]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this admin" });
      }

      // Disable 2FA and clear secret
      await pool.execute(
        "UPDATE res_admins SET two_fa_enabled = 0, two_fa_secret = NULL, two_fa_backup_codes = NULL WHERE id = ?",
        [id]
      );

      // Log the action (optional - you can add to an audit log table)
      console.log(`2FA reset for admin ${admin.username} (ID: ${id}) by ${req.user.username}. Reason: ${reason || 'Not specified'}`);

      res.status(200).json({
        status: "success",
        message: "2FA has been reset successfully",
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          name: `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.username
        },
        resetBy: req.user.username,
        resetAt: new Date().toISOString(),
        reason: reason || null
      });
    } catch (error) {
      console.error("Reset 2FA error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },

  // 3. Reset backup codes for any admin
  async resetBackupCodes(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Get admin details
      const [[admin]] = await pool.execute(
        "SELECT id, username, email, first_name, last_name, two_fa_enabled FROM res_admins WHERE id = ?",
        [id]
      );

      if (!admin) {
        return res.status(404).json({ error: "Admin not found" });
      }

      if (!admin.two_fa_enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this admin" });
      }

      // Generate new backup codes
      const backupCodes = adminsController.generateBackupCodes();
      const backupCodesJson = JSON.stringify(backupCodes);

      // Update the database with new backup codes
      await pool.execute(
        "UPDATE res_admins SET two_fa_backup_codes = ? WHERE id = ?",
        [backupCodesJson, id]
      );

      // Log the action (optional - you can add to an audit log table)
      console.log(`Backup codes reset for admin ${admin.username} (ID: ${id}) by ${req.user.username}. Reason: ${reason || 'Not specified'}`);

      res.status(200).json({
        status: "success",
        message: "Backup codes have been reset successfully",
        backupCodes: backupCodes,
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          name: `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.username
        },
        resetBy: req.user.username,
        resetAt: new Date().toISOString(),
        reason: reason || null,
        warning: "Please provide these new backup codes to the admin securely. The old backup codes are no longer valid."
      });
    } catch (error) {
      console.error("Reset backup codes error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },


};

module.exports = { adminsController };


