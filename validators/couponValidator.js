function validateCoupon(data, isUpdate = false) {
  // Basic Information validation
  if (!isUpdate && !data.code) {
    return "Coupon code is required";
  }
  if (data.code && !/^[A-Z0-9_-]+$/.test(data.code.toUpperCase())) {
    return "Coupon code must contain only uppercase letters, numbers, hyphens, and underscores";
  }
  if (!data.name) {
    return "Coupon name is required";
  }

  // Discount Settings validation
  if (!data.type || !['percentage', 'fixed'].includes(data.type)) {
    return "Invalid discount type. Must be 'percentage' or 'fixed'";
  }
  if (typeof data.value !== 'number' || data.value <= 0) {
    return "Discount value must be a positive number";
  }
  if (data.type === 'percentage' && (data.value < 1 || data.value > 100)) {
    return "Percentage discount must be between 1 and 100";
  }
  if (data.minimum_amount && (typeof data.minimum_amount !== 'number' || data.minimum_amount < 0)) {
    return "Minimum amount must be a non-negative number";
  }
  if (data.maximum_discount && (typeof data.maximum_discount !== 'number' || data.maximum_discount < 0)) {
    return "Maximum discount must be a non-negative number";
  }
  if (data.usage_limit && (typeof data.usage_limit !== 'number' || data.usage_limit < 1)) {
    return "Usage limit must be a positive number";
  }

  // Application Settings validation
  if (!data.applies_to || !['all', '1', '2'].includes(data.applies_to)) {
    return "Invalid applies_to value. Must be 'all', '1', or '2'";
  }
  if (data.applies_to === '2' && (!data.package_ids || !Array.isArray(data.package_ids) || data.package_ids.length === 0)) {
    return "Package IDs are required when applies_to is set to subscription package";
  }

  // User Targeting validation
  if (!data.user_targeting || !['all_users', 'first_time_users', 'selected_users'].includes(data.user_targeting)) {
    return "Invalid user targeting value";
  }
  if (data.user_targeting === 'selected_users' && (!data.selected_user_ids || !Array.isArray(data.selected_user_ids) || data.selected_user_ids.length === 0)) {
    return "Selected user IDs are required when user targeting is set to selected users";
  }
  if (!data.user_redemption_limit || !['once_per_user', 'multiple_per_user'].includes(data.user_redemption_limit)) {
    return "Invalid user redemption limit value";
  }

  // Payment Methods validation
  if (!data.payment_method_restriction || !['all', 'selected'].includes(data.payment_method_restriction)) {
    return "Invalid payment method restriction value";
  }
  if (data.payment_method_restriction === 'selected' && (!data.allowed_payment_methods || !Array.isArray(data.allowed_payment_methods) || data.allowed_payment_methods.length === 0)) {
    return "Allowed payment methods are required when payment method restriction is set to selected";
  }

  // Validity validation
  if (!data.valid_from || !isValidDate(data.valid_from)) {
    return "Valid from date is required and must be in YYYY-MM-DD format";
  }
  if (!data.valid_until || !isValidDate(data.valid_until)) {
    return "Valid until date is required and must be in YYYY-MM-DD format";
  }
  if (new Date(data.valid_from) >= new Date(data.valid_until)) {
    return "Valid from date must be before valid until date";
  }

  // Status validation
  if (typeof data.is_active !== 'boolean') {
    return "Is active must be a boolean value";
  }
  if (typeof data.is_public !== 'boolean') {
    return "Is public must be a boolean value";
  }
  if (data.display_order && (typeof data.display_order !== 'number' || data.display_order < 0)) {
    return "Display order must be a non-negative number";
  }

  // Bulk Generation validation
  if (!isUpdate) {
    if (data.bulk_generate !== undefined && typeof data.bulk_generate !== 'boolean') {
      return "Bulk generate must be a boolean value";
    }
    if (data.bulk_generate === true && (!data.bulk_count || !Number.isInteger(data.bulk_count) || data.bulk_count < 1 || data.bulk_count > 1000)) {
      return "Bulk count must be an integer between 1 and 1000 when bulk generate is true";
    }
  }

  return null;
}

function isValidDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

module.exports = {
  validateCoupon
};
