-- Drop existing tables if they exist
DROP TABLE IF EXISTS discount_usage;
DROP TABLE IF EXISTS discounts;

-- Main Discounts Table
CREATE TABLE discounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- Basic Information
    code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Unique coupon code (uppercase, numbers, hyphens, underscores)',
    name VARCHAR(100) NOT NULL COMMENT 'Display name for the coupon',
    description TEXT COMMENT 'Optional description of the coupon',
    
    -- Discount Settings
    type ENUM('percentage', 'fixed') NOT NULL COMMENT 'Percentage or fixed amount discount',
    value DECIMAL(10, 2) NOT NULL COMMENT 'Discount value (1-100 for percentage, > 0 for fixed)',
    minimum_amount DECIMAL(10, 2) NULL COMMENT 'Minimum order amount required',
    maximum_discount DECIMAL(10, 2) NULL COMMENT 'Maximum discount cap',
    usage_limit INT UNSIGNED NULL COMMENT 'Total usage limit for this coupon',
    current_usage INT UNSIGNED DEFAULT 0 COMMENT 'Current number of times used',
    
    -- Application Settings
    applies_to ENUM('all', '1', '2') NOT NULL COMMENT 'all=All Products, 1=Digital Files, 2=Subscription Package',
    package_ids JSON NULL COMMENT 'Array of package IDs when applies_to is "2"',
    
    -- User Targeting
    user_targeting ENUM('all_users', 'first_time_users', 'selected_users') NOT NULL,
    selected_user_ids JSON NULL COMMENT 'Array of user IDs when user_targeting is "selected_users"',
    user_redemption_limit ENUM('once_per_user', 'multiple_per_user') NOT NULL,
    
    -- Payment Method Restriction
    payment_method_restriction ENUM('all', 'selected') NOT NULL,
    allowed_payment_methods JSON NULL COMMENT 'Array of payment method IDs when payment_method_restriction is "selected"',
    
    -- Validity
    valid_from DATE NOT NULL COMMENT 'Start date of the coupon',
    valid_until DATE NOT NULL COMMENT 'End date of the coupon',
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Whether the coupon is currently active',
    is_public BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether the coupon is publicly visible',
    display_order INT NULL COMMENT 'Order for displaying public coupons',
    
    -- Bulk Generation Info
    is_bulk_generated BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether this is a bulk-generated coupon',
    parent_coupon_id BIGINT UNSIGNED NULL COMMENT 'Parent coupon ID for bulk-generated coupons',
    
    -- Timestamps and Soft Delete
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL COMMENT 'Soft delete timestamp',
    
    -- Indexes
    INDEX idx_code (code),
    INDEX idx_valid_dates (valid_from, valid_until),
    INDEX idx_status (is_active, is_public),
    INDEX idx_bulk (is_bulk_generated, parent_coupon_id),
    INDEX idx_targeting (user_targeting),
    INDEX idx_applies_to (applies_to),
    
    -- Constraints
    CONSTRAINT valid_percentage CHECK (type != 'percentage' OR (value >= 1 AND value <= 100)),
    CONSTRAINT valid_fixed_amount CHECK (type != 'fixed' OR value > 0),
    CONSTRAINT valid_dates CHECK (valid_from <= valid_until),
    
    -- Foreign Key
    FOREIGN KEY (parent_coupon_id) REFERENCES discounts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discount Usage Tracking Table
CREATE TABLE discount_usage (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    
    -- Relations
    discount_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED NOT NULL,
    
    -- Usage Details
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    discount_amount DECIMAL(10, 2) NOT NULL COMMENT 'Actual discount amount applied',
    order_total DECIMAL(10, 2) NOT NULL COMMENT 'Total order amount before discount',
    
    -- Additional Details
    payment_method VARCHAR(50) NOT NULL COMMENT 'Payment method used',
    order_type ENUM('1', '2') NOT NULL COMMENT '1=Digital Files, 2=Subscription Package',
    package_id BIGINT UNSIGNED NULL COMMENT 'Package ID if order_type is 2',
    
    -- Indexes
    INDEX idx_discount_user (discount_id, user_id),
    INDEX idx_order (order_id),
    INDEX idx_used_at (used_at),
    INDEX idx_payment_method (payment_method),
    INDEX idx_order_type (order_type),
    
    -- Foreign Keys
    FOREIGN KEY (discount_id) REFERENCES discounts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Constraints
    CONSTRAINT valid_package_id CHECK ((order_type = '2' AND package_id IS NOT NULL) OR 
                                     (order_type = '1' AND package_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add helpful comments for future reference
DELIMITER //

SELECT "
Simplified Coupon System Schema Notes:

1. Main Tables:
   - discounts: Primary coupon information with JSON fields for related data
   - discount_usage: Comprehensive usage tracking with order details

2. JSON Fields in discounts table:
   - package_ids: Array of package IDs for subscription packages
   - selected_user_ids: Array of user IDs for targeted coupons
   - allowed_payment_methods: Array of payment method IDs

3. Key Features:
   - Soft delete support via deleted_at
   - Bulk coupon generation support
   - JSON fields for flexible data storage
   - Comprehensive usage tracking
   - CHECK constraints for data integrity

4. Usage Tracking in discount_usage:
   - Tracks payment method used
   - Tracks order type and package details
   - Records both discount and total amounts
   - Links to user and order

5. Data Integrity:
   - CHECK constraints ensure valid values
   - Foreign key constraints maintain referential integrity
   - Appropriate indexes for common queries
   - ENUM fields for controlled values

6. Example JSON Usage:
   package_ids: [1, 2, 3]
   selected_user_ids: [100, 101, 102]
   allowed_payment_methods: ['stripe', 'paypal']
" AS Schema_Notes//

DELIMITER ;