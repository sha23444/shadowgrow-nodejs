-- Fix existing activation service products
-- Update product_type to 'digital' and status to 2 (Active)

UPDATE res_products 
SET product_type = 'digital', status = 2
WHERE requires_manual_processing = 1
AND slug IN (
  'ai-credits-1000',
  'cloud-storage-500gb',
  'api-access-premium-tier',
  'gaming-credits-5000',
  'premium-subscription-1month',
  'digital-wallet-100'
);
