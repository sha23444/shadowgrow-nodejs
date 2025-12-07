-- =====================================================
-- Add billing_address and shipping_address to res_orders table (Safe Version)
-- =====================================================
-- This script safely adds the missing address fields to the res_orders table
-- It checks if columns exist before adding them
-- =====================================================

-- For MySQL/MariaDB - Check and add billing_address
SET @dbname = DATABASE();
SET @tablename = 'res_orders';
SET @columnname = 'billing_address';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT "Column billing_address already exists" AS result;',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` TEXT NULL COMMENT "JSON object with billing address" AFTER `discount_details`;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- For MySQL/MariaDB - Check and add shipping_address
SET @columnname = 'shipping_address';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT "Column shipping_address already exists" AS result;',
  CONCAT('ALTER TABLE `', @tablename, '` ADD COLUMN `', @columnname, '` TEXT NULL COMMENT "JSON object with shipping address" AFTER `billing_address`;')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Verify the columns
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE, 
  COLUMN_COMMENT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'res_orders' 
  AND COLUMN_NAME IN ('billing_address', 'shipping_address');

