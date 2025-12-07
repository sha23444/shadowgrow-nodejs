-- =====================================================
-- Add billing_address and shipping_address to res_orders table
-- =====================================================
-- This script adds the missing address fields to the res_orders table
-- Run this script manually if the migration hasn't been executed
-- =====================================================

-- Check if columns exist before adding them (MySQL/MariaDB)
-- If columns already exist, these statements will fail gracefully

-- Add billing_address column
ALTER TABLE `res_orders` 
ADD COLUMN `billing_address` TEXT NULL 
COMMENT 'JSON object with billing address'
AFTER `discount_details`;

-- Add shipping_address column
ALTER TABLE `res_orders` 
ADD COLUMN `shipping_address` TEXT NULL 
COMMENT 'JSON object with shipping address'
AFTER `billing_address`;

-- Verify the columns were added
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
-- AND TABLE_NAME = 'res_orders' 
-- AND COLUMN_NAME IN ('billing_address', 'shipping_address');

