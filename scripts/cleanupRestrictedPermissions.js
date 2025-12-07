/* eslint-disable no-console */
/**
 * Cleanup Restricted Permissions Script
 * 
 * This script removes restricted permissions from all roles except super_admin.
 * Restricted modules include:
 * - Settings-related modules (settings_*, seo_settings_*)
 * - Telegram Bot Configuration
 * - Roles & Permissions
 * - Profile (including 2FA, password, email tabs)
 * - Offline Payment Methods
 * - Admin Accounts (Admins)
 * 
 * Usage: node scripts/cleanupRestrictedPermissions.js [--dry-run]
 * 
 * Options:
 *   --dry-run  : Show what would be deleted without actually deleting
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { pool } = require("../config/database");
const { isRestrictedModule } = require("../utils/restrictedModules");

const SUPER_ADMIN_ROLE_KEY = "super_admin";

async function cleanupRestrictedPermissions(dryRun = false) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    console.log("🔍 Starting cleanup of restricted permissions...\n");

    // Get super_admin role_id
    const [[superAdminRole]] = await connection.query(
      "SELECT role_id FROM res_roles WHERE role_key = ? LIMIT 1",
      [SUPER_ADMIN_ROLE_KEY]
    );

    if (!superAdminRole) {
      throw new Error("Super admin role not found in database");
    }

    const superAdminRoleId = superAdminRole.role_id;
    console.log(`✓ Found super_admin role (ID: ${superAdminRoleId})\n`);

    // Get all restricted permissions
    const [restrictedPermissions] = await connection.query(
      `SELECT 
         rp.role_id,
         rp.permission_id,
         r.role_key,
         r.role_name,
         m.module_key,
         m.module_name,
         p.permission_name
       FROM res_role_permissions rp
       JOIN res_roles r ON rp.role_id = r.role_id
       JOIN res_permissions p ON rp.permission_id = p.permission_id
       JOIN res_modules m ON p.module_id = m.module_id
       WHERE rp.role_id != ?
       ORDER BY r.role_key, m.module_key, p.permission_name`,
      [superAdminRoleId]
    );

    // Filter to find restricted permissions
    const toDelete = restrictedPermissions.filter((rp) =>
      isRestrictedModule(rp.module_key)
    );

    if (toDelete.length === 0) {
      console.log("✅ No restricted permissions found. Database is clean!\n");
      await connection.rollback();
      return;
    }

    // Group by role for reporting
    const byRole = {};
    toDelete.forEach((rp) => {
      if (!byRole[rp.role_key]) {
        byRole[rp.role_key] = {
          role_name: rp.role_name,
          role_id: rp.role_id,
          permissions: [],
        };
      }
      byRole[rp.role_key].permissions.push({
        module_key: rp.module_key,
        module_name: rp.module_name,
        permission_name: rp.permission_name,
        permission_id: rp.permission_id,
      });
    });

    // Display what will be deleted
    console.log(`📊 Found ${toDelete.length} restricted permission(s) to remove:\n`);
    Object.keys(byRole).forEach((roleKey) => {
      const roleData = byRole[roleKey];
      console.log(`  Role: ${roleData.role_name} (${roleKey})`);
      console.log(`  Permissions to remove: ${roleData.permissions.length}`);
      roleData.permissions.forEach((perm) => {
        console.log(`    - ${perm.module_name}:${perm.permission_name} (${perm.module_key})`);
      });
      console.log();
    });

    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be made\n");
      await connection.rollback();
      return;
    }

    // Delete restricted permissions
    let deletedCount = 0;
    for (const rp of toDelete) {
      const [result] = await connection.query(
        "DELETE FROM res_role_permissions WHERE role_id = ? AND permission_id = ?",
        [rp.role_id, rp.permission_id]
      );
      deletedCount += result.affectedRows;
    }

    await connection.commit();
    console.log(`✅ Successfully removed ${deletedCount} restricted permission(s) from non-super-admin roles.\n`);

    // Display summary
    console.log("📋 Summary:");
    console.log(`  - Roles affected: ${Object.keys(byRole).length}`);
    console.log(`  - Permissions removed: ${deletedCount}`);
    console.log(`  - Super admin permissions preserved: ✓\n`);

  } catch (error) {
    await connection.rollback();
    console.error("❌ Error during cleanup:", error);
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  try {
    await cleanupRestrictedPermissions(dryRun);
    console.log("🎉 Cleanup completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n💥 Cleanup failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { cleanupRestrictedPermissions };

