/**
 * Fix existing activation service products
 * Updates product_type to 'digital' and status to 2 (Active)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../config/database');

async function fixActivationProducts() {
  try {
    console.log('🔧 Fixing activation service products...\n');

    const [result] = await pool.execute(`
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
      )
    `);

    console.log(`✅ Updated ${result.affectedRows} products\n`);

    // Verify the updates
    const [products] = await pool.execute(`
      SELECT product_id, product_name, slug, product_type, status, requires_manual_processing
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
      LIMIT 6
    `);

    console.log('📦 Updated Products:');
    products.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.product_name}`);
      console.log(`     - Product Type: ${product.product_type}`);
      console.log(`     - Status: ${product.status} (${product.status === 2 ? 'Active' : 'Draft'})`);
      console.log(`     - Requires Manual Processing: ${product.requires_manual_processing ? 'Yes' : 'No'}\n`);
    });

    console.log('✨ Fix completed successfully!');

  } catch (error) {
    console.error('❌ Error fixing products:', error.message);
    throw error;
  }
}

// Run the fix
if (require.main === module) {
  fixActivationProducts()
    .then(() => {
      console.log('\n✅ Fix completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Fix failed:', error.message);
      process.exit(1);
    });
}

module.exports = { fixActivationProducts };
