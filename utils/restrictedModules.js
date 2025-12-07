/**
 * Restricted Modules Configuration
 * 
 * These modules can only be assigned to super_admin role.
 * They will not appear in the permission matrix for other roles.
 */

const RESTRICTED_MODULE_KEYS = new Set([
  'telegram_bot_configuration',
  'telegram_bot_config',
  'roles',
  'admin_roles',
  'profile',
  'profile_tab_2fa',
  'profile_tab_password',
  'profile_tab_email',
  'offline_payment_methods',
  'admins',
  'admin_accounts',
]);

/**
 * Check if a module key is restricted (super-admin only)
 * @param {string} moduleKey - The module key to check
 * @returns {boolean} - True if the module is restricted
 */
function isRestrictedModule(moduleKey) {
  if (!moduleKey) return false;
  
  // Check for settings-related modules
  if (moduleKey.startsWith('settings_') || moduleKey.startsWith('seo_settings')) {
    return true;
  }
  
  // Check for other restricted modules
  return RESTRICTED_MODULE_KEYS.has(moduleKey);
}

/**
 * Get all restricted module keys
 * @returns {Set<string>} - Set of restricted module keys
 */
function getRestrictedModuleKeys() {
  return new Set(RESTRICTED_MODULE_KEYS);
}

module.exports = {
  RESTRICTED_MODULE_KEYS,
  isRestrictedModule,
  getRestrictedModuleKeys,
};

