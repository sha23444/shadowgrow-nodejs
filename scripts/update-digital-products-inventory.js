const ProductInventoryService = require('../services/ProductInventoryService');
const { pool } = require('../config/database');

async function updateDigitalProductsInventory() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    console.log('🔄 Updating digital products inventory based on product type...\n');

    // Use the service to update all digital products
    const result = await ProductInventoryService.updateAllDigitalProductsInventory(connection);

    await connection.commit();

    console.log(`\n✅ Successfully updated ${result.updated} digital products:`);
    console.log(`   🔑 ${result.activationKeyProducts} products with activation keys (stock based on available keys)`);
    console.log(`   📄 ${result.fileUrlProducts} products with digital file URLs (unlimited stock)`);
    console.log(`   ♾️  ${result.unlimitedProducts} products without keys/files (unlimited stock)`);

    // Verify the update
    const [verify] = await connection.execute(
      `SELECT 
        COUNT(*) as total, 
        SUM(CASE WHEN (stock_quantity > 0 OR track_inventory = 0) THEN 1 ELSE 0 END) as in_stock,
        SUM(CASE WHEN requires_activation_key = 1 AND track_inventory = 1 THEN 1 ELSE 0 END) as key_tracked,
        SUM(CASE WHEN digital_file_url IS NOT NULL AND digital_file_url != '' THEN 1 ELSE 0 END) as file_based
       FROM res_products 
       WHERE is_digital_download = 1 OR product_type = 'digital'`
    );

    console.log('\n📊 Verification Summary:');
    console.log(`   Total digital products: ${verify[0].total}`);
    console.log(`   Products in stock: ${verify[0].in_stock}`);
    console.log(`   Products with key-based inventory: ${verify[0].key_tracked}`);
    console.log(`   Products with file URLs: ${verify[0].file_based}`);

    process.exit(0);
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Error updating digital products inventory:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

updateDigitalProductsInventory();
