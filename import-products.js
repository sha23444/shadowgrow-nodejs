const mysql = require('mysql2/promise');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
require('dotenv').config();

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'shadowgrow',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+05:30' // IST
};

console.log(`📡 Connecting to database: ${dbConfig.host}/${dbConfig.database}\n`);

// Parse CSV line manually
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

// Create a slug from text
function createSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Main import function
async function importProducts() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log('✅ Database connected successfully\n');
    console.log('🔄 Starting product import process...\n');
    
    // Step 1: Read CSV and collect data
    console.log('📖 Step 1: Reading CSV file...');
    
    const csvPath = path.join(__dirname, '..', 'styles.csv');
    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    const products = [];
    const masterCategories = new Set();
    const subCategories = new Set();
    const articleTypes = new Set();
    let headers = [];
    let isFirstLine = true;
    
    for await (const line of rl) {
      if (isFirstLine) {
        headers = parseCSVLine(line);
        isFirstLine = false;
        continue;
      }
      
      const values = parseCSVLine(line);
      const product = {};
      
      headers.forEach((header, index) => {
        product[header] = values[index] || '';
      });
      
      products.push(product);
      
      if (product.masterCategory) masterCategories.add(product.masterCategory);
      if (product.subCategory) subCategories.add(product.subCategory);
      if (product.articleType) articleTypes.add(product.articleType);
    }
    
    console.log(`   ✓ Found ${products.length} products`);
    console.log(`   ✓ Found ${masterCategories.size} master categories`);
    console.log(`   ✓ Found ${subCategories.size} sub categories`);
    console.log(`   ✓ Found ${articleTypes.size} article types\n`);
    
    // Step 2: Create Master Categories
    console.log('📦 Step 2: Creating master categories...');
    const masterCategoryMap = new Map();
    
    for (const categoryName of masterCategories) {
      const slug = createSlug(categoryName);
      
      try {
        const [existing] = await connection.execute(
          'SELECT category_id FROM res_product_categories WHERE slug = ?',
          [slug]
        );
        
        if (existing.length > 0) {
          masterCategoryMap.set(categoryName, existing[0].category_id);
          console.log(`   ⚠️  Skipped (exists): ${categoryName}`);
        } else {
          const [result] = await connection.execute(
            `INSERT INTO res_product_categories (category_name, slug, parent_category_id, sort_order) 
             VALUES (?, ?, 0, 0)`,
            [categoryName, slug]
          );
          masterCategoryMap.set(categoryName, result.insertId);
          console.log(`   ✓ Created: ${categoryName} (ID: ${result.insertId})`);
        }
      } catch (error) {
        console.error(`   ❌ Error creating ${categoryName}:`, error.message);
      }
    }
    
    console.log(`\n   📊 Master categories: ${masterCategoryMap.size}\n`);
    
    // Step 3: Create Sub Categories
    console.log('📦 Step 3: Creating sub categories...');
    const subCategoryMap = new Map();
    
    for (const categoryName of subCategories) {
      const slug = createSlug(categoryName);
      
      try {
        const [existing] = await connection.execute(
          'SELECT category_id FROM res_product_categories WHERE slug = ?',
          [slug]
        );
        
        if (existing.length > 0) {
          subCategoryMap.set(categoryName, existing[0].category_id);
          console.log(`   ⚠️  Skipped (exists): ${categoryName}`);
        } else {
          const [result] = await connection.execute(
            `INSERT INTO res_product_categories (category_name, slug, parent_category_id, sort_order) 
             VALUES (?, ?, 0, 0)`,
            [categoryName, slug]
          );
          subCategoryMap.set(categoryName, result.insertId);
          console.log(`   ✓ Created: ${categoryName} (ID: ${result.insertId})`);
        }
      } catch (error) {
        console.error(`   ❌ Error creating ${categoryName}:`, error.message);
      }
    }
    
    console.log(`\n   📊 Sub categories: ${subCategoryMap.size}\n`);
    
    // Step 4: Create Article Type Categories
    console.log('📦 Step 4: Creating article type categories...');
    const articleTypeMap = new Map();
    
    for (const categoryName of articleTypes) {
      const slug = createSlug(categoryName);
      
      try {
        const [existing] = await connection.execute(
          'SELECT category_id FROM res_product_categories WHERE slug = ?',
          [slug]
        );
        
        if (existing.length > 0) {
          articleTypeMap.set(categoryName, existing[0].category_id);
          console.log(`   ⚠️  Skipped (exists): ${categoryName}`);
        } else {
          const [result] = await connection.execute(
            `INSERT INTO res_product_categories (category_name, slug, parent_category_id, sort_order) 
             VALUES (?, ?, 0, 0)`,
            [categoryName, slug]
          );
          articleTypeMap.set(categoryName, result.insertId);
          console.log(`   ✓ Created: ${categoryName} (ID: ${result.insertId})`);
        }
      } catch (error) {
        console.error(`   ❌ Error creating ${categoryName}:`, error.message);
      }
    }
    
    console.log(`\n   📊 Article types: ${articleTypeMap.size}\n`);
    
    // Step 5: Import Products
    console.log('🛍️  Step 5: Importing products...');
    console.log('   This may take several minutes...\n');
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      if ((i + 1) % 500 === 0) {
        console.log(`   Progress: ${i + 1}/${products.length} products processed...`);
      }
      
      try {
        const productId = product.id;
        const productName = product.productDisplayName || `Product ${productId}`;
        const slug = createSlug(`${productName}-${productId}`);
        const sku = `SKU-${productId}`;
        
        // Parse price
        const originalPrice = product.priceUSD ? parseFloat(product.priceUSD) : 0;
        
        // Product type
        const productType = 'physical';
        
        // Stock quantity
        const stockQuantity = 100;
        
        // Descriptions
        const shortDescription = `${product.gender || ''} ${product.articleType || ''} - ${product.baseColour || ''} - ${product.season || ''} ${product.year || ''}`.trim();
        
        const description = `
          <p><strong>${productName}</strong></p>
          <p>Gender: ${product.gender || 'N/A'}</p>
          <p>Article Type: ${product.articleType || 'N/A'}</p>
          <p>Color: ${product.baseColour || 'N/A'}</p>
          <p>Season: ${product.season || 'N/A'}</p>
          <p>Year: ${product.year || 'N/A'}</p>
          <p>Usage: ${product.usage || 'N/A'}</p>
          <p>Category: ${product.masterCategory || 'N/A'} > ${product.subCategory || 'N/A'}</p>
        `.trim();
        
        // Check if product already exists
        const [existingProduct] = await connection.execute(
          'SELECT product_id FROM res_products WHERE sku = ?',
          [sku]
        );
        
        if (existingProduct.length > 0) {
          skipCount++;
          continue;
        }
        
        // Insert product
        const [productResult] = await connection.execute(
          `INSERT INTO res_products (
            product_name, sku, slug, original_price, sale_price, stock_quantity,
            short_description, description, manufacturer, supplier,
            status, product_type, is_featured, rating, reviews_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            productName,
            sku,
            slug,
            originalPrice,
            null,
            stockQuantity,
            shortDescription,
            description,
            null,
            null,
            2, // Active
            productType,
            0,
            0,
            0
          ]
        );
        
        const newProductId = productResult.insertId;
        
        // Link to categories
        const categoriesToLink = [];
        
        if (product.masterCategory && masterCategoryMap.has(product.masterCategory)) {
          categoriesToLink.push(masterCategoryMap.get(product.masterCategory));
        }
        
        if (product.subCategory && subCategoryMap.has(product.subCategory)) {
          categoriesToLink.push(subCategoryMap.get(product.subCategory));
        }
        
        if (product.articleType && articleTypeMap.has(product.articleType)) {
          categoriesToLink.push(articleTypeMap.get(product.articleType));
        }
        
        // Insert category relationships
        for (const categoryId of categoriesToLink) {
          try {
            await connection.execute(
              'INSERT INTO res_product_category_relationship (product_id, category_id) VALUES (?, ?)',
              [newProductId, categoryId]
            );
          } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') {
              console.error(`   ⚠️  Error linking category for product ${productId}:`, error.message);
            }
          }
        }
        
        // Add product image
        const imageFileName = `product-${productId}.jpg`;
        const imagePath = path.join(__dirname, 'uploads', 'products', imageFileName);
        
        if (fs.existsSync(imagePath)) {
          await connection.execute(
            'INSERT INTO res_product_media (product_id, type, file_name, is_cover) VALUES (?, ?, ?, ?)',
            [newProductId, 'image', imageFileName, 1]
          );
        }
        
        successCount++;
        
      } catch (error) {
        errorCount++;
        if (errorCount <= 10) { // Only show first 10 errors
          console.error(`   ❌ Error importing product ${product.id}:`, error.message);
        }
      }
    }
    
    console.log(`\n✅ Product import completed!`);
    console.log(`   📊 Statistics:`);
    console.log(`      - Successfully imported: ${successCount} products`);
    console.log(`      - Skipped (already exist): ${skipCount} products`);
    console.log(`      - Errors: ${errorCount} products`);
    console.log(`      - Total processed: ${products.length} products\n`);
    
    // Show category summary
    console.log('📊 Category Summary:');
    const [categoryCounts] = await connection.execute(`
      SELECT 
        c.category_name,
        COUNT(DISTINCT pcr.product_id) as product_count
      FROM res_product_categories c
      LEFT JOIN res_product_category_relationship pcr ON c.category_id = pcr.category_id
      WHERE c.parent_category_id = 0
      GROUP BY c.category_id, c.category_name
      ORDER BY product_count DESC
      LIMIT 20
    `);
    
    categoryCounts.forEach(cat => {
      console.log(`   ${cat.category_name}: ${cat.product_count} products`);
    });
    
  } catch (error) {
    console.error('❌ Fatal error during import:', error);
    console.error(error.stack);
  } finally {
    await connection.end();
    console.log('\n🔌 Database connection closed.');
  }
}

// Run the import
console.log('═══════════════════════════════════════════════════════════');
console.log('           PRODUCT IMPORT SCRIPT');
console.log('═══════════════════════════════════════════════════════════\n');

importProducts().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});

