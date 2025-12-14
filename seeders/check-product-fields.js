/**
 * Check Product Fields for a specific product
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../config/database');

async function checkProductFields(productId) {
  try {
    console.log(`🔍 Checking fields for product ID ${productId}...\n`);

    const [product] = await pool.execute(`
      SELECT product_id, product_name, slug
      FROM res_products
      WHERE product_id = ?
    `, [productId]);

    if (product.length === 0) {
      console.log(`❌ Product ID ${productId} not found`);
      return;
    }

    const [fields] = await pool.execute(`
      SELECT field_id, field_name, field_type, is_required
      FROM res_product_fields
      WHERE product_id = ?
      ORDER BY field_id
    `, [productId]);

    console.log(`📦 Product: ${product[0].product_name} (Slug: ${product[0].slug})\n`);
    console.log(`📋 Fields (${fields.length} total):`);
    
    if (fields.length === 0) {
      console.log('  No fields found');
    } else {
      fields.forEach((field, index) => {
        console.log(`  ${index + 1}. ${field.field_name} (Type: ${field.field_type}, Required: ${field.is_required ? 'Yes' : 'No'}, ID: ${field.field_id})`);
      });

      // Check for duplicates
      const fieldNames = fields.map(f => f.field_name);
      const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
      
      if (duplicates.length > 0) {
        console.log(`\n⚠️  Duplicate field names found: ${[...new Set(duplicates)].join(', ')}`);
      } else {
        console.log(`\n✅ No duplicate field names found`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking fields:', error.message);
    throw error;
  }
}

// Get product ID from command line or use default
const productId = process.argv[2] || 5819;

if (require.main === module) {
  checkProductFields(productId)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Check failed:', error.message);
      process.exit(1);
    });
}

module.exports = { checkProductFields };
