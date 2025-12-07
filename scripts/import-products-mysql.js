/**
 * Product Import Script for MySQL
 * Imports products from styles.csv into MySQL database as physical products
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'shadowgrow',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
};

// CSV file path
const csvFilePath = path.join(__dirname, '../../styles.csv');

// Progress tracking
let imported = 0;
let errors = 0;
let skipped = 0;

async function importProducts() {
  console.log('🚀 Starting product import from styles.csv...\n');
  console.log(`📁 File: ${csvFilePath}\n`);

  // Create database connection
  const connection = await mysql.createConnection(dbConfig);
  console.log('✅ Database connected\n');

  const products = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        products.push({
          external_id: row.id,
          name: row.productDisplayName || `Product ${row.id}`,
          slug: generateSlug(row.productDisplayName || `product-${row.id}`),
          description: generateDescription(row),
          price: parseFloat(row.priceUSD) || 0,
          sale_price: parseFloat(row.priceUSD) || 0,
          original_price: parseFloat(row.priceUSD) || 0,
          category: row.masterCategory || 'Uncategorized',
          subcategory: row.subCategory || null,
          article_type: row.articleType || null,
          product_type: 'physical',
          gender: row.gender || 'Unisex',
          color: row.baseColour || null,
          season: row.season || null,
          usage: row.usage || 'Casual',
          year: row.year || new Date().getFullYear(),
          image_url: row.imageURL || null,
          stock_quantity: 100, // Default stock
          status: 1, // Active
        });
      })
      .on('end', async () => {
        console.log(`✅ Parsed ${products.length} products from CSV\n`);
        console.log('💾 Importing into database...\n');

        // Import in batches
        const batchSize = 100;
        for (let i = 0; i < products.length; i += batchSize) {
          const batch = products.slice(i, i + batchSize);
          await importBatch(connection, batch);
          
          const progress = Math.min(i + batchSize, products.length);
          const percentage = ((progress / products.length) * 100).toFixed(1);
          console.log(`📊 Progress: ${progress}/${products.length} (${percentage}%)`);
        }

        console.log('\n✅ Import completed!\n');
        console.log(`📊 Final Stats:`);
        console.log(`   ✅ Imported: ${imported}`);
        console.log(`   ❌ Errors: ${errors}`);
        console.log(`   ⏭️  Skipped: ${skipped}`);
        
        await connection.end();
        resolve();
      })
      .on('error', reject);
  });
}

async function importBatch(connection, products) {
  for (const product of products) {
    try {
      // Check if product already exists
      const [existing] = await connection.query(
        'SELECT product_id FROM products WHERE external_id = ? OR slug = ?',
        [product.external_id, product.slug]
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Insert product
      await connection.query(
        `INSERT INTO products (
          external_id, name, slug, description, price, sale_price, original_price,
          category, subcategory, article_type, product_type, gender, color, 
          season, \`usage\`, year, image_url, stock_quantity, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          product.external_id, product.name, product.slug, product.description,
          product.price, product.sale_price, product.original_price,
          product.category, product.subcategory, product.article_type, product.product_type,
          product.gender, product.color, product.season, product.usage, product.year,
          product.image_url, product.stock_quantity, product.status
        ]
      );

      imported++;
    } catch (error) {
      errors++;
      if (errors <= 10) { // Only show first 10 errors
        console.error(`❌ Error importing "${product.name}":`, error.message);
      }
    }
  }
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateDescription(row) {
  const parts = [];
  
  if (row.gender && row.gender !== 'Unisex') parts.push(`${row.gender}'s`);
  if (row.articleType) parts.push(row.articleType);
  if (row.baseColour) parts.push(`in ${row.baseColour}`);
  if (row.season && row.year) parts.push(`· ${row.season} ${row.year} Collection`);
  if (row.usage) parts.push(`· Perfect for ${row.usage} wear`);
  
  const title = row.productDisplayName || `Product ${row.id}`;
  const details = parts.join(' ');
  
  return details ? `${title}. ${details}` : title;
}

// Run the import
if (require.main === module) {
  importProducts()
    .then(() => {
      console.log('\n🎉 Import process completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Import failed:', error);
      process.exit(1);
    });
}

module.exports = { importProducts };

