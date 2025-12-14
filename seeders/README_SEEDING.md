# Seeding Activation Service Products

## Overview
This seed script creates 6 test products for activation services that require manual processing.

## Products Created

1. **AI Credits - 1000 Credits** ($24.99)
   - Custom Fields: Username (required), Account Email (optional)
   - Delivery Time: 1-24 hours

2. **Cloud Storage - 500GB Plan** ($39.99)
   - Custom Fields: Email Address (required), Storage Plan Preference (optional)
   - Delivery Time: 2-48 hours

3. **API Access - Premium Tier** ($79.99)
   - Custom Fields: API Key Name (required), Application Name (optional)
   - Delivery Time: 4-72 hours

4. **Gaming Credits - 5000 Coins** ($14.99)
   - Custom Fields: Gaming Username (required), Platform (optional)
   - Delivery Time: 1-12 hours

5. **Premium Subscription - 1 Month** ($7.99)
   - Custom Fields: Account Email (required)
   - Delivery Time: 6-24 hours

6. **Digital Wallet - $100 Credits** ($95.00)
   - Custom Fields: Wallet Address (required), Wallet Type (optional)
   - Delivery Time: 2-48 hours

## How to Run

### Option 1: Using MySQL Command Line
```bash
mysql -u your_username -p your_database_name < backend/seeders/seed_activation_service_products.sql
```

### Option 2: Using MySQL Workbench or phpMyAdmin
1. Open the SQL file: `backend/seeders/seed_activation_service_products.sql`
2. Copy the contents
3. Paste into your SQL editor
4. Execute the script

### Option 3: Using Node.js (if you have a seeder script)
```bash
node backend/seeders/run-seeder.js
```

## Prerequisites

1. **Run the migration first:**
   ```bash
   mysql -u your_username -p your_database_name < backend/migrations/add_requires_manual_processing.sql
   ```

2. **Ensure you have:**
   - `res_products` table
   - `res_product_fields` table
   - Admin user account (for testing manual processing)

## Testing Checklist

After seeding, test the following:

- [ ] View products in admin panel - should show "Requires Manual Processing" enabled
- [ ] View products on website - should show custom fields form
- [ ] Try adding to cart without filling required fields - button should be disabled
- [ ] Fill required fields - button should enable
- [ ] Add to cart - custom field values should be stored
- [ ] Complete checkout - order should be created
- [ ] View order in admin - should show custom field values
- [ ] Click "Process Activation Service" button
- [ ] Enter receipt number and process
- [ ] Verify user receives notification

## Notes

- All products are set to `status = 1` (active)
- Stock quantity is set to 999999 (unlimited)
- Products are digital products (`product_type = 3`)
- All have `requires_manual_processing = 1`
- None have activation keys or file URLs
- Custom fields are configured per product

## Cleanup (if needed)

To remove the seeded products:
```sql
-- Delete custom fields first
DELETE FROM res_product_fields 
WHERE product_id IN (
  SELECT product_id FROM res_products 
  WHERE slug IN (
    'ai-credits-1000',
    'cloud-storage-500gb',
    'api-access-premium-tier',
    'gaming-credits-5000',
    'premium-subscription-1month',
    'digital-wallet-100'
  )
);

-- Delete products
DELETE FROM res_products 
WHERE slug IN (
  'ai-credits-1000',
  'cloud-storage-500gb',
  'api-access-premium-tier',
  'gaming-credits-5000',
  'premium-subscription-1month',
  'digital-wallet-100'
);
```
