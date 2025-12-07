/**
 * Complete Product Import with Local Images
 * 1. Downloads all images locally
 * 2. Imports products with local image paths
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const csv = require('csv-parser');
const { pool } = require('../config/database');

const csvFilePath = path.join(__dirname, '../../styles.csv');
const imageDir = path.join(__dirname, '../uploads/products');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
  console.log(`📁 Created directory: ${imageDir}\n`);
}

let downloadedImages = 0;
let failedDownloads = 0;
let imported = 0;
let errors = 0;
let skipped = 0;

// Download image from URL
function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    if (!url || url === 'null') {
      return resolve(null);
    }

    const filepath = path.join(imageDir, filename);
    
    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      return resolve(filename);
    }

    const file = fs.createWriteStream(filepath);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadImage(response.headers.location, filename).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        fs.unlinkSync(filepath);
        return resolve(null);
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(filename);
      });
    });

    request.on('error', (err) => {
      fs.unlinkSync(filepath);
      resolve(null); // Don't reject, just return null
    });

    request.setTimeout(10000, () => {
      request.destroy();
      fs.unlinkSync(filepath);
      resolve(null);
    });
  });
}

async function processProducts() {
  console.log('🚀 Starting Complete Product Import\n');
  console.log('📥 Phase 1: Downloading Images\n');

  const products = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        products.push({
          id: row.id,
          product_name: row.productDisplayName || `Product ${row.id}`,
          slug: generateSlug(row.productDisplayName || `product-${row.id}`),
          description: generateDescription(row),
          original_price: parseFloat(row.priceUSD) || 0,
          sale_price: parseFloat(row.priceUSD) || 0,
          stock_quantity: 100,
          product_type: 'physical',
          status: 1,
          imageURL: row.imageURL,
          metadata: {
            gender: row.gender,
            category: row.masterCategory,
            subcategory: row.subCategory,
            articleType: row.articleType,
            color: row.baseColour,
            season: row.season,
            year: row.year,
            usage: row.usage,
          }
        });
      })
      .on('end', async () => {
        console.log(`✅ Parsed ${products.length} products\n`);
        
        // Phase 1: Download images
        console.log(`📥 Downloading ${products.length} images...\n`);
        
        for (let i = 0; i < products.length; i++) {
          const product = products[i];
          const filename = `product-${product.id}.jpg`;
          
          if (product.imageURL) {
            const result = await downloadImage(product.imageURL, filename);
            if (result) {
              product.localImage = filename;
              downloadedImages++;
            } else {
              product.localImage = null;
              failedDownloads++;
            }
          }

          // Progress every 100 images
          if ((i + 1) % 100 === 0) {
            console.log(`📊 Downloaded: ${i + 1}/${products.length} (${((i + 1) / products.length * 100).toFixed(1)}%) - Success: ${downloadedImages}, Failed: ${failedDownloads}`);
          }
        }

        console.log(`\n✅ Image download complete!`);
        console.log(`   Downloaded: ${downloadedImages}`);
        console.log(`   Failed: ${failedDownloads}\n`);

        // Phase 2: Import to database
        console.log('💾 Phase 2: Importing to Database\n');

        for (let i = 0; i < products.length; i += 50) {
          const batch = products.slice(i, i + 50);
          await importBatch(batch);
          console.log(`📊 Imported: ${Math.min(i + 50, products.length)}/${products.length} (${((Math.min(i + 50, products.length) / products.length) * 100).toFixed(1)}%)`);
        }

        console.log(`\n✅ Database import complete!`);
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
      // Check if product already exists
      const [existing] = await pool.query(
        'SELECT product_id FROM res_products WHERE slug = ?',
        [product.slug]
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Use local image path if available, otherwise use external URL
      const imagePath = product.localImage || product.imageURL;

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
          imagePath
        ]
      );

      imported++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`❌ ${product.product_name}: ${error.message}`);
      }
    }
  }
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

function generateDescription(row) {
  const parts = [];
  const title = row.productDisplayName || `Product ${row.id}`;
  
  if (row.gender && row.gender !== 'Unisex') parts.push(`${row.gender}'s`);
  if (row.articleType) parts.push(row.articleType);
  if (row.baseColour) parts.push(`in ${row.baseColour}`);
  if (row.season && row.year) parts.push(`${row.season} ${row.year} Collection`);
  if (row.usage) parts.push(`Perfect for ${row.usage} wear`);
  
  return `${title}. ${parts.join('. ')}.`;
}

// Run the complete import process
if (require.main === module) {
  processProducts()
    .then(() => {
      console.log('🎉 Complete import finished!\n');
      console.log('📊 Summary:');
      console.log(`   Images Downloaded: ${downloadedImages}`);
      console.log(`   Images Failed: ${failedDownloads}`);
      console.log(`   Products Imported: ${imported}`);
      console.log(`   Products Skipped: ${skipped}`);
      console.log(`   Errors: ${errors}\n`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Import failed:', error);
      process.exit(1);
    });
}

