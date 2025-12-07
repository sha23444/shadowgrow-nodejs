/**
 * Simple Product Import - Works with existing res_products table
 * No database changes required
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { pool } = require('../config/database');

const csvFilePath = path.join(__dirname, '../../styles.csv');

let imported = 0;
let errors = 0;
let skipped = 0;

async function importProducts() {
  console.log('🚀 Importing 5,769 products from styles.csv...\n');

  const products = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        products.push({
          product_name: row.productDisplayName || `Product ${row.id}`,
          slug: generateSlug(row.productDisplayName || `product-${row.id}`),
          description: `${row.productDisplayName}. ${row.gender} ${row.articleType} in ${row.baseColour}. ${row.season} ${row.year} Collection. Perfect for ${row.usage} wear.`,
          original_price: parseFloat(row.priceUSD) || 0,
          sale_price: parseFloat(row.priceUSD) || 0,
          stock_quantity: 100,
          product_type: 'physical',
          status: 1,
          thumbnail: row.imageURL || null,
        });
      })
      .on('end', async () => {
        console.log(`✅ Parsed ${products.length} products\n`);
        console.log('💾 Importing to res_products table...\n');

        // Import in batches
        for (let i = 0; i < products.length; i += 50) {
          const batch = products.slice(i, i + 50);
          await importBatch(batch);
          console.log(`📊 ${Math.min(i + 50, products.length)}/${products.length} (${((Math.min(i + 50, products.length) / products.length) * 100).toFixed(1)}%)`);
        }

        console.log(`\n✅ Done!`);
        console.log(`   Imported: ${imported}`);
        console.log(`   Skipped: ${skipped}`);
        console.log(`   Errors: ${errors}\n`);
        
        await pool.end();
        resolve();
      })
      .on('error', reject);
  });
}

async function importBatch(products) {
  for (const product of products) {
    try {
      // Check if slug exists
      const [existing] = await pool.query(
        'SELECT product_id FROM res_products WHERE slug = ?',
        [product.slug]
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Insert product
      await pool.query(
        `INSERT INTO res_products (
          product_name, slug, description, original_price, sale_price,
          stock_quantity, product_type, status, thumbnail, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          product.product_name,
          product.slug,
          product.description,
          product.original_price,
          product.sale_price,
          product.stock_quantity,
          product.product_type,
          product.status,
          product.thumbnail
        ]
      );

      imported++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`❌ Error: ${product.product_name} - ${error.message}`);
      }
    }
  }
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200); // Limit length
}

// Run import
importProducts()
  .then(() => {
    console.log('🎉 Import completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

