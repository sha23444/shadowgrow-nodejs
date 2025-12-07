const { pool } = require('../config/database');

/**
 * Seed sale prices for all products in res_products table
 * - Adds realistic discounts (10-40% off) to 70% of products
 * - Ensures sale_price is always less than original_price
 * - Skips products that already have sale_price set
 */

async function seedProductSalePrices() {
  let connection;
  
  try {
    console.log('🎯 Starting to seed product sale prices...\n');
    
    connection = await pool.getConnection();
    
    // Fetch all products (check all, not just those with original_price)
    console.log('📂 Fetching products from database...\n');
    const [allProducts] = await connection.execute(`
      SELECT product_id, product_name, original_price, sale_price, status
      FROM res_products 
      ORDER BY product_id ASC
    `);
    
    console.log(`Found ${allProducts.length} total products\n`);
    
    // Filter products that have original_price > 0 and status = 2 (active)
    const products = allProducts.filter(p => {
      const origPrice = parseFloat(String(p.original_price || 0).replace(/[^\d.-]/g, ''));
      return origPrice > 0 && p.status === 2; // Only active products (status = 2)
    });
    
    console.log(`Found ${products.length} active products (status=2) with valid original prices\n`);
    
    if (products.length === 0) {
      console.log('⚠️  No products found with valid original prices!\n');
      console.log('💡 Tip: Products need original_price > 0 to calculate sale prices.\n');
      return;
    }
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each product
    for (const product of products) {
      try {
        // Extract numeric price (handles "24.99 USD" format)
        const origPriceStr = String(product.original_price || '').replace(/[^\d.-]/g, '');
        const originalPrice = parseFloat(origPriceStr);
        
        if (originalPrice <= 0) {
          console.log(`⏭️  Skipping "${product.product_name}" - invalid original price: ${product.original_price}`);
          skipped++;
          continue;
        }
        
        // Check if already has a valid sale price - update it anyway for variety
        const salePriceStr = product.sale_price ? String(product.sale_price).replace(/[^\d.-]/g, '') : '';
        const existingSalePrice = salePriceStr ? parseFloat(salePriceStr) : null;
        const hasValidSalePrice = existingSalePrice && existingSalePrice > 0 && existingSalePrice < originalPrice;
        
        // 80% chance of having a discount (update even if exists)
        const shouldHaveDiscount = Math.random() < 0.8;
        
        if (!shouldHaveDiscount) {
          // If no discount, set sale_price to NULL
          if (hasValidSalePrice) {
            await connection.execute(
              `UPDATE res_products SET sale_price = NULL WHERE product_id = ?`,
              [product.product_id]
            );
            console.log(`🔄 Removed sale price from "${product.product_name}" (no discount)`);
            updated++;
          } else {
            console.log(`⏭️  Skipping "${product.product_name}" - no discount`);
            skipped++;
          }
          continue;
        }
        
        // Generate discount percentage (10% to 40%)
        const discountPercent = Math.floor(Math.random() * 31) + 10; // 10-40%
        const discountMultiplier = 1 - (discountPercent / 100);
        const salePrice = parseFloat((originalPrice * discountMultiplier).toFixed(2));
        
        // Ensure sale price is valid (greater than 0 and less than original)
        if (salePrice <= 0 || salePrice >= originalPrice) {
          console.log(`⚠️  Skipping "${product.product_name}" - invalid calculated sale price`);
          skipped++;
          continue;
        }
        
        // Update product with sale price
        await connection.execute(
          `UPDATE res_products 
           SET sale_price = ? 
           WHERE product_id = ?`,
          [salePrice, product.product_id]
        );
        
        console.log(`✅ Updated "${product.product_name}": ₹${originalPrice.toFixed(2)} → ₹${salePrice.toFixed(2)} (${discountPercent}% off)`);
        updated++;
        
      } catch (error) {
        console.error(`   ❌ Error updating "${product.product_name}":`, error.message);
        errors++;
        continue;
      }
    }
    
    console.log('\n🎉 Successfully processed product sale prices!\n');
    console.log('📊 Statistics:');
    console.log(`   Total Products: ${products.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}\n`);
    
    // Show sample of updated products
    const [updatedProducts] = await connection.execute(`
      SELECT product_id, product_name, original_price, sale_price,
             ROUND(((original_price - sale_price) / original_price) * 100) as discount_percent
      FROM res_products 
      WHERE sale_price IS NOT NULL 
      AND sale_price > 0 
      AND sale_price < original_price
      ORDER BY discount_percent DESC
      LIMIT 10
    `);
    
    console.log('📸 Sample Updated Products (Top 10 by Discount):');
    updatedProducts.forEach((p, index) => {
      const orig = parseFloat(p.original_price);
      const sale = parseFloat(p.sale_price);
      console.log(`   ${index + 1}. "${p.product_name}"`);
      console.log(`      Original: ₹${orig.toFixed(2)} → Sale: ₹${sale.toFixed(2)} (${p.discount_percent}% off)`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding product sale prices:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the function
seedProductSalePrices()
  .then(() => {
    console.log('\n✅ Product sale prices seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Product sale prices seeding failed:', error);
    process.exit(1);
  });

