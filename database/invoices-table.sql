-- =====================================================
-- Create Invoices Table for Completed Orders
-- =====================================================
-- This table stores invoices for completed orders
-- for better performance, audit trail, and business logic separation
-- =====================================================

-- Drop table if it already exists (WARNING: This will delete all existing data!)
DROP TABLE IF EXISTS `res_invoices`;

-- Create the invoices table
CREATE TABLE `res_invoices` (
  -- Primary key
  `invoice_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  
  -- Foreign keys
  `order_id` INT(11) NOT NULL COMMENT 'Reference to original order',
  `user_id` INT(11) NOT NULL COMMENT 'Customer who placed the order',
  
  -- Invoice identification
  `invoice_number` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Unique invoice number',
  `invoice_type` VARCHAR(20) DEFAULT 'standard' COMMENT 'standard, proforma, credit_note',
  
  -- Dates
  `invoice_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Date invoice was created',
  `due_date` TIMESTAMP NULL COMMENT 'Payment due date',
  `payment_date` TIMESTAMP NULL COMMENT 'Actual payment date',
  
  -- Financial information
  `subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT 'Subtotal before tax and discount',
  `tax_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT 'Total tax amount',
  `discount_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT 'Total discount amount',
  `total_amount` DECIMAL(15, 2) NOT NULL COMMENT 'Final total amount',
  `amount_paid` DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT 'Amount actually paid',
  `amount_due` DECIMAL(15, 2) NOT NULL COMMENT 'Amount still due',
  
  -- Currency and exchange
  `currency` VARCHAR(3) NOT NULL DEFAULT 'USD' COMMENT 'Currency code',
  `exchange_rate` DECIMAL(10, 6) NOT NULL DEFAULT 1.000000 COMMENT 'Exchange rate at time of invoice',
  
  -- Payment information
  `payment_method` INT(11) NOT NULL COMMENT 'Payment method used',
  `payment_status` INT(11) NOT NULL DEFAULT 1 COMMENT '1=Pending, 2=Paid, 3=Failed, 4=Refunded',
  `gateway_txn_id` VARCHAR(255) NULL COMMENT 'Payment gateway transaction ID',
  `gateway_response` TEXT NULL COMMENT 'Payment gateway response data',
  
  -- Invoice status
  `invoice_status` INT(11) NOT NULL DEFAULT 1 COMMENT '1=Draft, 2=Sent, 3=Paid, 4=Overdue, 5=Cancelled',
  
  -- Order details
  `item_types` TEXT NULL COMMENT 'JSON array of item types in the order',
  `tax_breakdown` TEXT NULL COMMENT 'JSON object with tax breakdown details',
  `discount_details` TEXT NULL COMMENT 'JSON object with discount details',
  
  -- Customer and billing information
  `billing_address` TEXT NULL COMMENT 'JSON object with billing address',
  `shipping_address` TEXT NULL COMMENT 'JSON object with shipping address',
  
  -- Additional information
  `notes` TEXT NULL COMMENT 'Additional notes or comments',
  `terms_conditions` TEXT NULL COMMENT 'Terms and conditions',
  
  -- Audit fields
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX `idx_order_id` (`order_id`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_invoice_number` (`invoice_number`),
  INDEX `idx_invoice_date` (`invoice_date`),
  INDEX `idx_payment_status` (`payment_status`),
  INDEX `idx_invoice_status` (`invoice_status`),
  INDEX `idx_payment_method` (`payment_method`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_due_date` (`due_date`),
  
  -- Composite indexes
  INDEX `idx_user_invoice_date` (`user_id`, `invoice_date`),
  INDEX `idx_payment_invoice_status` (`payment_status`, `invoice_status`),
  INDEX `idx_invoice_date_payment_status` (`invoice_date`, `payment_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Status Reference:
-- =====================================================
-- payment_status: 1=Pending, 2=Paid, 3=Failed, 4=Refunded
-- invoice_status: 1=Draft, 2=Sent, 3=Paid, 4=Overdue, 5=Cancelled
-- =====================================================

