-- Seed script for Activation Service Products
-- Run this after the migration: add_requires_manual_processing.sql
-- These are test products for activation services like AI credits

-- Insert activation service products
INSERT INTO res_products (
  product_name,
  sku,
  slug,
  original_price,
  sale_price,
  stock_quantity,
  short_description,
  description,
  status,
  product_type,
  is_digital_download,
  requires_activation_key,
  requires_manual_processing,
  digital_file_url,
  digital_delivery_time,
  delivery_instructions,
  track_inventory,
  is_featured,
  rating,
  reviews_count,
  created_at,
  updated_at
) VALUES
-- Product 1: AI Credits
(
  'AI Credits - 1000 Credits',
  'AI-CREDITS-1000',
  'ai-credits-1000',
  29.99,
  24.99,
  999999,
  'Get 1000 AI credits for your projects',
  'Purchase 1000 AI credits that can be used for various AI services. Credits are manually activated after order completion.',
  1,
  3, -- digital
  1, -- is_digital_download
  0, -- requires_activation_key
  1, -- requires_manual_processing
  NULL, -- no file URL
  '1-24 hours',
  'Your AI credits will be activated manually by our team. You will receive a notification once activation is complete.',
  0, -- track_inventory
  1, -- is_featured
  0,
  0,
  NOW(),
  NOW()
),
-- Product 2: Cloud Storage Credits
(
  'Cloud Storage - 500GB Plan',
  'CLOUD-STORAGE-500GB',
  'cloud-storage-500gb',
  49.99,
  39.99,
  999999,
  '500GB of cloud storage space',
  'Get 500GB of premium cloud storage. Your account will be set up manually after order completion.',
  1,
  3, -- digital
  1, -- is_digital_download
  0, -- requires_activation_key
  1, -- requires_manual_processing
  NULL, -- no file URL
  '2-48 hours',
  'Your cloud storage account will be configured manually. You will receive login credentials via email once setup is complete.',
  0, -- track_inventory
  1, -- is_featured
  0,
  0,
  NOW(),
  NOW()
),
-- Product 3: API Access Credits
(
  'API Access - Premium Tier',
  'API-PREMIUM-TIER',
  'api-access-premium-tier',
  99.99,
  79.99,
  999999,
  'Premium API access with 10,000 requests',
  'Get premium API access with 10,000 requests per month. Your API key will be generated and sent to you after manual processing.',
  1,
  3, -- digital
  1, -- is_digital_download
  0, -- requires_activation_key
  1, -- requires_manual_processing
  NULL, -- no file URL
  '4-72 hours',
  'Your API access will be activated manually. API keys and documentation will be sent to your registered email address.',
  0, -- track_inventory
  0, -- is_featured
  0,
  0,
  NOW(),
  NOW()
),
-- Product 4: Gaming Credits
(
  'Gaming Credits - 5000 Coins',
  'GAMING-COINS-5000',
  'gaming-credits-5000',
  19.99,
  14.99,
  999999,
  '5000 gaming coins for your account',
  'Purchase 5000 gaming coins that will be manually added to your gaming account. Please provide your gaming username during checkout.',
  1,
  3, -- digital
  1, -- is_digital_download
  0, -- requires_activation_key
  1, -- requires_manual_processing
  NULL, -- no file URL
  '1-12 hours',
  'Your gaming credits will be manually added to your account. Make sure to provide your correct gaming username.',
  0, -- track_inventory
  0, -- is_featured
  0,
  0,
  NOW(),
  NOW()
),
-- Product 5: Premium Subscription Access
(
  'Premium Subscription - 1 Month',
  'PREMIUM-SUB-1MONTH',
  'premium-subscription-1month',
  9.99,
  7.99,
  999999,
  '1 month of premium subscription access',
  'Get 1 month of premium subscription access. Your account will be upgraded manually after order completion.',
  1,
  3, -- digital
  1, -- is_digital_download
  0, -- requires_activation_key
  1, -- requires_manual_processing
  NULL, -- no file URL
  '6-24 hours',
  'Your premium subscription will be activated manually. You will receive a confirmation email once your account is upgraded.',
  0, -- track_inventory
  1, -- is_featured
  0,
  0,
  NOW(),
  NOW()
),
-- Product 6: Digital Wallet Credits
(
  'Digital Wallet - $100 Credits',
  'WALLET-CREDITS-100',
  'digital-wallet-100',
  100.00,
  95.00,
  999999,
  '$100 worth of digital wallet credits',
  'Add $100 to your digital wallet. Credits will be manually processed and added to your account after order completion.',
  1,
  3, -- digital
  1, -- is_digital_download
  0, -- requires_activation_key
  1, -- requires_manual_processing
  NULL, -- no file URL
  '2-48 hours',
  'Your wallet credits will be manually processed. You will receive a notification once the credits are added to your account.',
  0, -- track_inventory
  0, -- is_featured
  0,
  0,
  NOW(),
  NOW()
);

-- Get the product IDs (assuming they were inserted in order)
SET @product1_id = (SELECT product_id FROM res_products WHERE slug = 'ai-credits-1000');
SET @product2_id = (SELECT product_id FROM res_products WHERE slug = 'cloud-storage-500gb');
SET @product3_id = (SELECT product_id FROM res_products WHERE slug = 'api-access-premium-tier');
SET @product4_id = (SELECT product_id FROM res_products WHERE slug = 'gaming-credits-5000');
SET @product5_id = (SELECT product_id FROM res_products WHERE slug = 'premium-subscription-1month');
SET @product6_id = (SELECT product_id FROM res_products WHERE slug = 'digital-wallet-100');

-- Insert custom fields (Order Processing Details) for each product
-- Product 1: AI Credits - requires Username
INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES
(@product1_id, 'Username', 'text', 1),
(@product1_id, 'Account Email', 'text', 0);

-- Product 2: Cloud Storage - requires Email
INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES
(@product2_id, 'Email Address', 'text', 1),
(@product2_id, 'Storage Plan Preference', 'text', 0);

-- Product 3: API Access - requires API Key Name
INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES
(@product3_id, 'API Key Name', 'text', 1),
(@product3_id, 'Application Name', 'text', 0);

-- Product 4: Gaming Credits - requires Gaming Username
INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES
(@product4_id, 'Gaming Username', 'text', 1),
(@product4_id, 'Platform', 'text', 0);

-- Product 5: Premium Subscription - requires Account Email
INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES
(@product5_id, 'Account Email', 'text', 1);

-- Product 6: Digital Wallet - requires Wallet Address
INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES
(@product6_id, 'Wallet Address', 'text', 1),
(@product6_id, 'Wallet Type', 'text', 0);

-- Add default category if needed (optional - adjust category_id as needed)
-- INSERT INTO res_product_category_relationship (product_id, category_id) VALUES
-- (@product1_id, 1),
-- (@product2_id, 1),
-- (@product3_id, 1),
-- (@product4_id, 1),
-- (@product5_id, 1),
-- (@product6_id, 1);

-- Success message
SELECT 'Activation service products seeded successfully!' AS message,
       COUNT(*) AS products_created
FROM res_products 
WHERE requires_manual_processing = 1;
