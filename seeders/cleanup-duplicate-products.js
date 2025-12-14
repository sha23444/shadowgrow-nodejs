/**
 * Cleanup Duplicate Products
 * Removes duplicate products, keeping only the most recent one for each slug
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../config/database');

async function cleanupDuplicateProducts() {
  try {
    console.log('🧹 Cleaning up duplicate products...\n');

    const slugs = [
      'ai-credits-1000',
      'cloud-storage-500gb',
      'api-access-premium-tier',
      'gaming-credits-5000',
      'premium-subscription-1month',
      'digital-wallet-100'
    ];

    let totalDeleted = 0;

    for (const slug of slugs) {
      // Get all products with this slug
      const [products] = await pool.execute(`
        SELECT product_id, product_name, created_at
        FROM res_products
        WHERE slug = ?
        ORDER BY product_id DESC
      `, [slug]);

      if (products.length <= 1) continue;

      // Keep the most recent one (first in DESC order), delete the rest
      const toKeep = products[0];
      const toDelete = products.slice(1);

      console.log(`\n📦 ${toKeep.product_name} (${slug}):`);
      console.log(`   Keeping: Product ID ${toKeep.product_id} (created: ${toKeep.created_at})`);

      for (const product of toDelete) {
        // Delete associated fields first
        await pool.execute(`
          DELETE FROM res_product_fields WHERE product_id = ?
        `, [product.product_id]);

        // Delete the product
        await pool.execute(`
          DELETE FROM res_products WHERE product_id = ?
        `, [product.product_id]);

        totalDeleted++;
        console.log(`   Deleted: Product ID ${product.product_id} (created: ${product.created_at})`);
      }
    }

    console.log(`\n✅ Cleanup completed! Removed ${totalDeleted} duplicate products\n`);

    // Verify the cleanup
    const [finalProducts] = await pool.execute(`
      SELECT product_id, product_name, slug, product_type, status
      FROM res_products
      WHERE slug IN (
        'ai-credits-1000',
        'cloud-storage-500gb',
        'api-access-premium-tier',
        'gaming-credits-5000',
        'premium-subscription-1month',
        'digital-wallet-100'
      )
      ORDER BY slug, product_id DESC
    `);

    console.log('📊 Final products (should be 6 unique products):');
    const slugCounts = {};
    finalProducts.forEach(product => {
      if (!slugCounts[product.slug]) {
        slugCounts[product.slug] = 0;
      }
      slugCounts[product.slug]++;
      console.log(`  - ${product.product_name} (ID: ${product.product_id}, Slug: ${product.slug}, Type: ${product.product_type}, Status: ${product.status})`);
    });

    console.log('\n📈 Products per slug:');
    Object.entries(slugCounts).forEach(([slug, count]) => {
      console.log(`  - ${slug}: ${count} product(s) ${count > 1 ? '⚠️  (should be 1)' : '✅'}`);
    });

    // Show field counts
    const [fieldCounts] = await pool.execute(`
      SELECT rp.product_name, rp.slug, COUNT(pf.field_id) as field_count
      FROM res_products rp
      LEFT JOIN res_product_fields pf ON rp.product_id = pf.product_id
      WHERE rp.slug IN (
        'ai-credits-1000',
        'cloud-storage-500gb',
        'api-access-premium-tier',
        'gaming-credits-5000',
        'premium-subscription-1month',
        'digital-wallet-100'
      )
      GROUP BY rp.product_id, rp.product_name, rp.slug
      ORDER BY rp.slug
    `);

    console.log('\n📋 Field counts per product:');
    fieldCounts.forEach(item => {
      console.log(`  - ${item.product_name} (${item.slug}): ${item.field_count} field(s)`);
    });

    console.log('\n✨ Cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Error cleaning up products:', error.message);
    throw error;
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupDuplicateProducts()
    .then(() => {
      console.log('\n✅ Cleanup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup failed:', error.message);
      process.exit(1);
    });
}

module.exports = { cleanupDuplicateProducts };
