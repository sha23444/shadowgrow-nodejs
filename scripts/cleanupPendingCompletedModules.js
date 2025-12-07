/* eslint-disable no-console */
/**
 * Cleanup Pending and Completed Modules Script
 * 
 * This script removes Pending and Completed modules from the database.
 * These are now part of the Orders module and should not exist separately.
 * 
 * Usage: node scripts/cleanupPendingCompletedModules.js [--dry-run]
 * 
 * Options:
 *   --dry-run  : Show what would be deleted without actually deleting
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { pool } = require("../config/database");

const MODULES_TO_DELETE = ['pending', 'completed', 'order_pending', 'order_completed'];

async function cleanupPendingCompletedModules(dryRun = false) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    console.log("🔍 Starting cleanup of Pending and Completed modules...\n");

    // Find modules to delete
    const [modules] = await connection.query(
      `SELECT module_id, module_key, module_name, description
       FROM res_modules
       WHERE LOWER(module_key) IN (?)
          OR LOWER(module_name) IN (?)`,
      [MODULES_TO_DELETE, ['pending', 'completed']]
    );

    if (modules.length === 0) {
      console.log("✅ No Pending or Completed modules found. Database is clean!\n");
      await connection.rollback();
      return;
    }

    console.log(`📊 Found ${modules.length} module(s) to remove:\n`);
    modules.forEach(module => {
      console.log(`  - ${module.module_name} (${module.module_key})`);
    });
    console.log();

    // Get permissions count
    const moduleIds = modules.map(m => m.module_id);
    const [permissions] = await connection.query(
      `SELECT COUNT(*) as count FROM res_permissions WHERE module_id IN (?)`,
      [moduleIds]
    );
    const permissionCount = permissions[0]?.count || 0;

    // Get role permissions count
    const [rolePermissions] = await connection.query(
      `SELECT COUNT(*) as count 
       FROM res_role_permissions rp
       INNER JOIN res_permissions p ON rp.permission_id = p.permission_id
       WHERE p.module_id IN (?)`,
      [moduleIds]
    );
    const rolePermissionCount = rolePermissions[0]?.count || 0;

    console.log(`📋 Summary:`);
    console.log(`  - Modules to delete: ${modules.length}`);
    console.log(`  - Permissions to delete: ${permissionCount}`);
    console.log(`  - Role permissions to delete: ${rolePermissionCount}`);
    console.log();

    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No changes will be made\n");
      await connection.rollback();
      return;
    }

    // Delete role permissions first (foreign key constraint)
    const [rolePermsResult] = await connection.query(
      `DELETE rp FROM res_role_permissions rp
       INNER JOIN res_permissions p ON rp.permission_id = p.permission_id
       WHERE p.module_id IN (?)`,
      [moduleIds]
    );
    console.log(`✅ Deleted ${rolePermsResult.affectedRows} role permission(s)`);

    // Delete permissions
    const [permsResult] = await connection.query(
      `DELETE FROM res_permissions WHERE module_id IN (?)`,
      [moduleIds]
    );
    console.log(`✅ Deleted ${permsResult.affectedRows} permission(s)`);

    // Delete modules
    const [modulesResult] = await connection.query(
      `DELETE FROM res_modules WHERE module_id IN (?)`,
      [moduleIds]
    );
    console.log(`✅ Deleted ${modulesResult.affectedRows} module(s)`);

    await connection.commit();
    console.log(`\n🎉 Cleanup completed successfully!\n`);

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
    await cleanupPendingCompletedModules(dryRun);
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

module.exports = { cleanupPendingCompletedModules };

