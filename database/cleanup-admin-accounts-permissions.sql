-- Cleanup Admin Accounts Permissions
-- 
-- This removes Admin Accounts permissions from all roles except super_admin.
-- 
-- WARNING: This will permanently delete permission assignments.
-- Review the SELECT query first to see what will be deleted.

-- Step 1: View what will be deleted
SELECT 
  r.role_id,
  r.role_key,
  r.role_name,
  m.module_key,
  m.module_name,
  p.permission_id,
  p.permission_name
FROM res_role_permissions rp
JOIN res_roles r ON rp.role_id = r.role_id
JOIN res_permissions p ON rp.permission_id = p.permission_id
JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (m.module_key = 'admins' OR m.module_key = 'admin_accounts')
ORDER BY r.role_key, p.permission_name;

-- Step 2: Count affected records
SELECT 
  COUNT(*) as total_to_delete,
  COUNT(DISTINCT rp.role_id) as affected_roles
FROM res_role_permissions rp
JOIN res_roles r ON rp.role_id = r.role_id
JOIN res_permissions p ON rp.permission_id = p.permission_id
JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (m.module_key = 'admins' OR m.module_key = 'admin_accounts');

-- Step 3: DELETE Admin Accounts permissions from non-super-admin roles
-- UNCOMMENT BELOW AFTER REVIEWING THE ABOVE QUERIES

/*
DELETE rp FROM res_role_permissions rp
INNER JOIN res_roles r ON rp.role_id = r.role_id
INNER JOIN res_permissions p ON rp.permission_id = p.permission_id
INNER JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (m.module_key = 'admins' OR m.module_key = 'admin_accounts');
*/

-- Step 4: Verify deletion (should return 0)
SELECT 
  COUNT(*) as remaining_admin_accounts_permissions
FROM res_role_permissions rp
JOIN res_roles r ON rp.role_id = r.role_id
JOIN res_permissions p ON rp.permission_id = p.permission_id
JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (m.module_key = 'admins' OR m.module_key = 'admin_accounts');

