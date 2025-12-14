/**
 * Cleanup Duplicate Product Fields
 * Removes duplicate fields for activation service products
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../config/database');

async function cleanupDuplicateFields() {
  try {
    console.log('🧹 Cleaning up duplicate product fields...\n');

    // Get all activation service products
    const [products] = await pool.execute(`
      SELECT product_id, product_name, slug
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
    `);

    let totalDeleted = 0;

    for (const product of products) {
      // Get all fields for this product
      const [fields] = await pool.execute(`
        SELECT field_id, field_name, field_type, is_required
        FROM res_product_fields
        WHERE product_id = ?
        ORDER BY field_id
      `, [product.product_id]);

      if (fields.length === 0) continue;

      // Group fields by name to find duplicates
      const fieldGroups = {};
      fields.forEach(field => {
        const key = `${field.field_name}_${field.field_type}_${field.is_required}`;
        if (!fieldGroups[key]) {
          fieldGroups[key] = [];
        }
        fieldGroups[key].push(field);
      });

      // Delete duplicates, keeping only the first one
      for (const [key, group] of Object.entries(fieldGroups)) {
        if (group.length > 1) {
          // Keep the first field, delete the rest
          const toDelete = group.slice(1);
          for (const field of toDelete) {
            await pool.execute(`
              DELETE FROM res_product_fields
              WHERE field_id = ?
            `, [field.field_id]);
            totalDeleted++;
          }
          console.log(`  ✓ ${product.product_name}: Removed ${toDelete.length} duplicate field(s) for "${group[0].field_name}"`);
        }
      }
    }

    console.log(`\n✅ Cleanup completed! Removed ${totalDeleted} duplicate fields\n`);

    // Verify the cleanup
    const [allFields] = await pool.execute(`
      SELECT pf.product_id, rp.product_name, pf.field_name, pf.is_required, COUNT(*) as count
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
      GROUP BY pf.product_id, pf.field_name, pf.field_type, pf.is_required
      HAVING count > 1
    `);

    if (allFields.length > 0) {
      console.log('⚠️  Warning: Some duplicates may still exist:');
      allFields.forEach(field => {
        console.log(`  - ${field.product_name}: ${field.field_name} (${field.count} instances)`);
      });
    } else {
      console.log('✅ No duplicates found. All fields are unique.\n');
    }

    // Show final field count per product
    const [finalFields] = await pool.execute(`
      SELECT rp.product_name, COUNT(pf.field_id) as field_count
      FROM res_products rp
      LEFT JOIN res_product_fields pf ON rp.product_id = pf.product_id
      WHERE rp.requires_manual_processing = 1
      AND rp.slug IN (
        'ai-credits-1000',
        'cloud-storage-500gb',
        'api-access-premium-tier',
        'gaming-credits-5000',
        'premium-subscription-1month',
        'digital-wallet-100'
      )
      GROUP BY rp.product_id, rp.product_name
      ORDER BY rp.product_name
    `);

    console.log('📊 Final field count per product:');
    finalFields.forEach(item => {
      console.log(`  - ${item.product_name}: ${item.field_count} field(s)`);
    });

    console.log('\n✨ Cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Error cleaning up fields:', error.message);
    throw error;
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupDuplicateFields()
    .then(() => {
      console.log('\n✅ Cleanup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup failed:', error.message);
      process.exit(1);
    });
}

module.exports = { cleanupDuplicateFields };
