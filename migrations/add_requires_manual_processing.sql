-- Migration: Add requires_manual_processing column to res_products table
-- Date: 2025-01-XX
-- Description: Adds support for activation services that require manual processing

ALTER TABLE res_products 
ADD COLUMN requires_manual_processing TINYINT(1) DEFAULT 0 
AFTER requires_activation_key;

-- Add index for better query performance
CREATE INDEX idx_requires_manual_processing ON res_products(requires_manual_processing);
