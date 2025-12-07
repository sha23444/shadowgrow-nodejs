-- Cleanup Pending and Completed Modules
-- 
-- This script removes Pending and Completed modules from the database.
-- These are now part of the Orders module and should not exist separately.
-- 
-- WARNING: This will permanently delete modules and their permissions.
-- Run this script before re-seeding modules.
-- 
-- Usage:
--   mysql -u username -p database_name < cleanup-pending-completed-modules.sql

-- Step 1: View modules that will be deleted
SELECT 
  module_id,
  module_key,
  module_name,
  description
FROM res_modules
WHERE LOWER(module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
   OR LOWER(module_name) IN ('pending', 'completed');

-- Step 2: Count affected records
SELECT 
  COUNT(*) as modules_to_delete,
  (SELECT COUNT(*) FROM res_permissions 
   WHERE module_id IN (
     SELECT module_id FROM res_modules 
     WHERE LOWER(module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
        OR LOWER(module_name) IN ('pending', 'completed')
   )) as permissions_to_delete,
  (SELECT COUNT(*) FROM res_role_permissions 
   WHERE permission_id IN (
     SELECT permission_id FROM res_permissions 
     WHERE module_id IN (
       SELECT module_id FROM res_modules 
       WHERE LOWER(module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
          OR LOWER(module_name) IN ('pending', 'completed')
     )
   )) as role_permissions_to_delete
FROM res_modules
WHERE LOWER(module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
   OR LOWER(module_name) IN ('pending', 'completed');

-- Step 3: DELETE role permissions first (foreign key constraint)
DELETE rp FROM res_role_permissions rp
INNER JOIN res_permissions p ON rp.permission_id = p.permission_id
INNER JOIN res_modules m ON p.module_id = m.module_id
WHERE LOWER(m.module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
   OR LOWER(m.module_name) IN ('pending', 'completed');

-- Step 4: DELETE permissions
DELETE p FROM res_permissions p
INNER JOIN res_modules m ON p.module_id = m.module_id
WHERE LOWER(m.module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
   OR LOWER(m.module_name) IN ('pending', 'completed');

-- Step 5: DELETE modules
DELETE FROM res_modules
WHERE LOWER(module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
   OR LOWER(module_name) IN ('pending', 'completed');

-- Step 6: Verify deletion (should return 0)
SELECT 
  COUNT(*) as remaining_modules
FROM res_modules
WHERE LOWER(module_key) IN ('pending', 'completed', 'order_pending', 'order_completed')
   OR LOWER(module_name) IN ('pending', 'completed');

