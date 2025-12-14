/**
 * Seed Activation Service Products
 * 
 * This script seeds 6 test products for activation services
 * Run: node backend/seeders/seed-activation-products.js
 */

// Load environment variables first - .env is in backend directory
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../config/database');

async function seedActivationProducts() {
  // Use pool.execute directly which should respect database from pool config
  try {
    console.log('🌱 Starting to seed activation service products...\n');

    // Insert products
    const [productResult] = await pool.execute(`
      INSERT INTO res_products (
        product_name, sku, slug, original_price, sale_price, stock_quantity,
        short_description, description, status, product_type, is_digital_download,
        requires_activation_key, requires_manual_processing, digital_file_url,
        digital_delivery_time, delivery_instructions, track_inventory, is_featured,
        rating, reviews_count, created_at, updated_at
      ) VALUES
      ('AI Credits - 1000 Credits', 'AI-CREDITS-1000', 'ai-credits-1000', 29.99, 24.99, 999999,
       'Get 1000 AI credits for your projects',
       'Purchase 1000 AI credits that can be used for various AI services. Credits are manually activated after order completion.',
       2, 'digital', 1, 0, 1, NULL, '1-24 hours',
       'Your AI credits will be activated manually by our team. You will receive a notification once activation is complete.',
       0, 1, 0, 0, NOW(), NOW()),
      ('Cloud Storage - 500GB Plan', 'CLOUD-STORAGE-500GB', 'cloud-storage-500gb', 49.99, 39.99, 999999,
       '500GB of cloud storage space',
       'Get 500GB of premium cloud storage. Your account will be set up manually after order completion.',
       2, 'digital', 1, 0, 1, NULL, '2-48 hours',
       'Your cloud storage account will be configured manually. You will receive login credentials via email once setup is complete.',
       0, 1, 0, 0, NOW(), NOW()),
      ('API Access - Premium Tier', 'API-PREMIUM-TIER', 'api-access-premium-tier', 99.99, 79.99, 999999,
       'Premium API access with 10,000 requests',
       'Get premium API access with 10,000 requests per month. Your API key will be generated and sent to you after manual processing.',
       2, 'digital', 1, 0, 1, NULL, '4-72 hours',
       'Your API access will be activated manually. API keys and documentation will be sent to your registered email address.',
       0, 0, 0, 0, NOW(), NOW()),
      ('Gaming Credits - 5000 Coins', 'GAMING-COINS-5000', 'gaming-credits-5000', 19.99, 14.99, 999999,
       '5000 gaming coins for your account',
       'Purchase 5000 gaming coins that will be manually added to your gaming account. Please provide your gaming username during checkout.',
       2, 'digital', 1, 0, 1, NULL, '1-12 hours',
       'Your gaming credits will be manually added to your account. Make sure to provide your correct gaming username.',
       0, 0, 0, 0, NOW(), NOW()),
      ('Premium Subscription - 1 Month', 'PREMIUM-SUB-1MONTH', 'premium-subscription-1month', 9.99, 7.99, 999999,
       '1 month of premium subscription access',
       'Get 1 month of premium subscription access. Your account will be upgraded manually after order completion.',
       2, 'digital', 1, 0, 1, NULL, '6-24 hours',
       'Your premium subscription will be activated manually. You will receive a confirmation email once your account is upgraded.',
       0, 1, 0, 0, NOW(), NOW()),
      ('Digital Wallet - $100 Credits', 'WALLET-CREDITS-100', 'digital-wallet-100', 100.00, 95.00, 999999,
       '$100 worth of digital wallet credits',
       'Add $100 to your digital wallet. Credits will be manually processed and added to your account after order completion.',
       2, 'digital', 1, 0, 1, NULL, '2-48 hours',
       'Your wallet credits will be manually processed. You will receive a notification once the credits are added to your account.',
       0, 0, 0, 0, NOW(), NOW())
    `);

    // Get inserted product IDs
    const [products] = await pool.execute(`
      SELECT product_id, product_name, slug 
      FROM res_products 
      WHERE slug IN (
        'ai-credits-1000',
        'cloud-storage-500gb',
        'api-access-premium-tier',
        'gaming-credits-5000',
        'premium-subscription-1month',
        'digital-wallet-100'
      )
      ORDER BY product_id DESC
    `);

    if (products.length === 0) {
      console.log('⚠️  No products were inserted. They may already exist.');
      connection.release();
      return;
    }

    // Create a map of slugs to product IDs
    const productMap = {};
    products.forEach(p => {
      productMap[p.slug] = p.product_id;
    });

    // Insert custom fields for each product
    const fieldInserts = [
      // Product 1: AI Credits
      [productMap['ai-credits-1000'], 'Username', 'text', 1],
      [productMap['ai-credits-1000'], 'Account Email', 'text', 0],
      // Product 2: Cloud Storage
      [productMap['cloud-storage-500gb'], 'Email Address', 'text', 1],
      [productMap['cloud-storage-500gb'], 'Storage Plan Preference', 'text', 0],
      // Product 3: API Access
      [productMap['api-access-premium-tier'], 'API Key Name', 'text', 1],
      [productMap['api-access-premium-tier'], 'Application Name', 'text', 0],
      // Product 4: Gaming Credits
      [productMap['gaming-credits-5000'], 'Gaming Username', 'text', 1],
      [productMap['gaming-credits-5000'], 'Platform', 'text', 0],
      // Product 5: Premium Subscription
      [productMap['premium-subscription-1month'], 'Account Email', 'text', 1],
      // Product 6: Digital Wallet
      [productMap['digital-wallet-100'], 'Wallet Address', 'text', 1],
      [productMap['digital-wallet-100'], 'Wallet Type', 'text', 0],
    ];

    if (fieldInserts.length > 0) {
      // Insert fields one by one, checking for duplicates first
      for (const field of fieldInserts) {
        // Check if field already exists
        const [existing] = await pool.execute(`
          SELECT field_id FROM res_product_fields
          WHERE product_id = ? AND field_name = ? AND field_type = ? AND is_required = ?
        `, field);

        // Only insert if it doesn't exist
        if (existing.length === 0) {
          await pool.execute(`
            INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) 
            VALUES (?, ?, ?, ?)
          `, field);
        }
      }
    }

    // Verify what was created
    const [allProducts] = await pool.execute(`
      SELECT product_id, product_name, slug, requires_manual_processing 
      FROM res_products 
      WHERE requires_manual_processing = 1 
      AND slug IN (
        'ai-credits-1000',
        'cloud-storage-500gb',
        'api-access-premium-tier',
        'gaming-credits-5000',
        'premium-subscription-1month',
        'digital-wallet-100'
      )
      ORDER BY product_id DESC
    `);

    const [allFields] = await pool.execute(`
      SELECT pf.product_id, rp.product_name, pf.field_name, pf.is_required
      FROM res_product_fields pf
      INNER JOIN res_products rp ON pf.product_id = rp.product_id
      WHERE rp.requires_manual_processing = 1
      AND rp.slug IN (
        'ai-credits-1000',
        'cloud-storage-500gb',
        'api-access-premium-tier',
        'gaming-credits-5000',
        'premium-subscription-1month',
        'digital-wallet-100'
      )
      ORDER BY pf.product_id, pf.field_id
    `);

    console.log('✅ Successfully seeded activation service products!\n');
    console.log(`📦 Products created: ${allProducts.length}`);
    console.log(`📝 Custom fields created: ${allFields.length}\n`);
    
    console.log('Products:');
    allProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.product_name} (ID: ${product.product_id}, Slug: ${product.slug})`);
    });

    console.log('\nCustom Fields:');
    const fieldsByProduct = {};
    allFields.forEach(field => {
      if (!fieldsByProduct[field.product_name]) {
        fieldsByProduct[field.product_name] = [];
      }
      fieldsByProduct[field.product_name].push(field);
    });

    Object.entries(fieldsByProduct).forEach(([productName, productFields]) => {
      console.log(`\n  ${productName}:`);
      productFields.forEach(field => {
        console.log(`    - ${field.field_name} (${field.is_required ? 'required' : 'optional'})`);
      });
    });

    console.log('\n✨ Seeding completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. View products in admin panel');
    console.log('  2. Test adding products to cart on website');
    console.log('  3. Complete an order');
    console.log('  4. Test manual processing in admin order details\n');

  } catch (error) {
    console.error('❌ Error seeding products:', error.message);
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('\n⚠️  Some products may already exist. Checking existing products...');
      try {
        const [existing] = await pool.execute(`
          SELECT product_id, product_name, slug 
          FROM res_products 
          WHERE slug IN (
            'ai-credits-1000',
            'cloud-storage-500gb',
            'api-access-premium-tier',
            'gaming-credits-5000',
            'premium-subscription-1month',
            'digital-wallet-100'
          )
        `);
        console.log(`\n✅ Found ${existing.length} existing products.`);
        existing.forEach((p, i) => {
          console.log(`  ${i + 1}. ${p.product_name} (ID: ${p.product_id})`);
        });
      } catch (checkError) {
        console.error('Error checking existing products:', checkError.message);
      }
    }
    throw error;
  }
}

// Run the seeder
if (require.main === module) {
  seedActivationProducts()
    .then(() => {
      console.log('\n✅ Seeder completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Seeder failed:', error.message);
      process.exit(1);
    });
}

module.exports = { seedActivationProducts };
