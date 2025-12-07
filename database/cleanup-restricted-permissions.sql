-- Cleanup Restricted Permissions SQL Script
-- 
-- This script removes restricted permissions from all roles except super_admin.
-- 
-- WARNING: This will permanently delete permission assignments.
-- Run this script after reviewing what will be deleted.
-- 
-- Usage:
--   1. Review the SELECT queries to see what will be deleted
--   2. Uncomment the DELETE statements after confirmation
--   3. Run: mysql -u username -p database_name < cleanup-restricted-permissions.sql

-- Step 1: View restricted permissions that will be deleted
-- (Run this first to see what will be affected)

SELECT 
  r.role_id,
  r.role_key,
  r.role_name,
  m.module_key,
  m.module_name,
  p.permission_id,
  p.permission_name,
  p.description
FROM res_role_permissions rp
JOIN res_roles r ON rp.role_id = r.role_id
JOIN res_permissions p ON rp.permission_id = p.permission_id
JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (
    -- Settings-related modules
    m.module_key LIKE 'settings_%' 
    OR m.module_key LIKE 'seo_settings%'
    -- Other restricted modules
    OR m.module_key = 'telegram_bot_configuration'
    OR m.module_key = 'telegram_bot_config'
    OR m.module_key = 'roles'
    OR m.module_key = 'admin_roles'
    OR m.module_key = 'profile'
    OR m.module_key = 'profile_tab_2fa'
    OR m.module_key = 'profile_tab_password'
    OR m.module_key = 'profile_tab_email'
    OR m.module_key = 'offline_payment_methods'
    OR m.module_key = 'admins'
    OR m.module_key = 'admin_accounts'
  )
ORDER BY r.role_key, m.module_key, p.permission_name;

-- Step 2: Count affected records
-- (Check the count before proceeding)

SELECT 
  COUNT(*) as total_permissions_to_delete,
  COUNT(DISTINCT rp.role_id) as affected_roles
FROM res_role_permissions rp
JOIN res_roles r ON rp.role_id = r.role_id
JOIN res_permissions p ON rp.permission_id = p.permission_id
JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (
    m.module_key LIKE 'settings_%' 
    OR m.module_key LIKE 'seo_settings%'
    OR m.module_key = 'telegram_bot_configuration'
    OR m.module_key = 'telegram_bot_config'
    OR m.module_key = 'roles'
    OR m.module_key = 'admin_roles'
    OR m.module_key = 'profile'
    OR m.module_key = 'profile_tab_2fa'
    OR m.module_key = 'profile_tab_password'
    OR m.module_key = 'profile_tab_email'
    OR m.module_key = 'offline_payment_methods'
    OR m.module_key = 'admins'
    OR m.module_key = 'admin_accounts'
  );

-- Step 3: DELETE restricted permissions
-- UNCOMMENT BELOW AFTER REVIEWING THE ABOVE QUERIES

/*
DELETE rp FROM res_role_permissions rp
INNER JOIN res_roles r ON rp.role_id = r.role_id
INNER JOIN res_permissions p ON rp.permission_id = p.permission_id
INNER JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (
    m.module_key LIKE 'settings_%' 
    OR m.module_key LIKE 'seo_settings%'
    OR m.module_key = 'telegram_bot_configuration'
    OR m.module_key = 'telegram_bot_config'
    OR m.module_key = 'roles'
    OR m.module_key = 'admin_roles'
    OR m.module_key = 'profile'
    OR m.module_key = 'profile_tab_2fa'
    OR m.module_key = 'profile_tab_password'
    OR m.module_key = 'profile_tab_email'
    OR m.module_key = 'offline_payment_methods'
    OR m.module_key = 'admins'
    OR m.module_key = 'admin_accounts'
  );
*/

-- Step 4: Verify deletion
-- (Run this after deletion to confirm)

SELECT 
  COUNT(*) as remaining_restricted_permissions
FROM res_role_permissions rp
JOIN res_roles r ON rp.role_id = r.role_id
JOIN res_permissions p ON rp.permission_id = p.permission_id
JOIN res_modules m ON p.module_id = m.module_id
WHERE r.role_key != 'super_admin'
  AND (
    m.module_key LIKE 'settings_%' 
    OR m.module_key LIKE 'seo_settings%'
    OR m.module_key = 'telegram_bot_configuration'
    OR m.module_key = 'telegram_bot_config'
    OR m.module_key = 'roles'
    OR m.module_key = 'admin_roles'
    OR m.module_key = 'profile'
    OR m.module_key = 'profile_tab_2fa'
    OR m.module_key = 'profile_tab_password'
    OR m.module_key = 'profile_tab_email'
    OR m.module_key = 'offline_payment_methods'
    OR m.module_key = 'admins'
    OR m.module_key = 'admin_accounts'
  );

