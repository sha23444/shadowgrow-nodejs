/**
 * Script to manually assign activation keys for order 28
 */

const { pool } = require('../config/database');
const DigitalProductDeliveryService = require('../services/DigitalProductDeliveryService');

async function assignKeysForOrder28() {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const orderId = 28;
    
    // First, check if order exists and get user_id
    const [orders] = await connection.execute(
      'SELECT order_id, user_id, order_status, payment_status FROM res_orders WHERE order_id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      console.error(`❌ Order ${orderId} not found`);
      return;
    }

    const order = orders[0];
    const userId = order.user_id;

    console.log(`\n📦 Processing Order ${orderId} for User ${userId}`);
    console.log(`   Order Status: ${order.order_status}`);
    console.log(`   Payment Status: ${order.payment_status}`);

    // Check if order has digital products
    const [orderItems] = await connection.execute(
      `SELECT up.*, p.product_name, p.requires_activation_key, p.is_digital_download
       FROM res_uproducts up
       INNER JOIN res_products p ON up.product_id = p.product_id
       WHERE up.order_id = ? AND up.user_id = ?`,
      [orderId, userId]
    );

    if (orderItems.length === 0) {
      console.log(`⚠️  No products found for order ${orderId}`);
      return;
    }

    console.log(`\n📋 Found ${orderItems.length} product(s) in order:`);
    orderItems.forEach(item => {
      console.log(`   - ${item.product_name} (ID: ${item.product_id})`);
      console.log(`     requires_activation_key: ${item.requires_activation_key}`);
      console.log(`     is_digital_download: ${item.is_digital_download}`);
      
      // Check available keys
      connection.execute(
        `SELECT COUNT(*) as count FROM res_product_activation_keys 
         WHERE product_id = ? AND status = 'available'`,
        [item.product_id]
      ).then(([available]) => {
        console.log(`     Available keys: ${available[0].count}`);
      });
    });

    // Check if keys are already assigned
    const [existingKeys] = await connection.execute(
      `SELECT pak.*, p.product_name
       FROM res_product_activation_keys pak
       INNER JOIN res_products p ON pak.product_id = p.product_id
       WHERE pak.order_id = ? AND pak.user_id = ? AND pak.status = 'used'`,
      [orderId, userId]
    );

    if (existingKeys.length > 0) {
      console.log(`\n⚠️  Order ${orderId} already has ${existingKeys.length} assigned key(s):`);
      existingKeys.forEach(key => {
        console.log(`   - Product: ${key.product_name}`);
        console.log(`     Key: ${key.activation_key}`);
        console.log(`     Status: ${key.status}`);
      });
    }

    // Process digital product delivery
    console.log(`\n🚀 Processing digital product delivery...`);
    const result = await DigitalProductDeliveryService.processDigitalProductDelivery(
      orderId,
      userId,
      connection
    );

    console.log(`\n✅ Delivery processing completed:`);
    console.log(`   - Keys assigned: ${result.assignedKeys.length}`);
    console.log(`   - Emails sent: ${result.emailsSent}`);
    console.log(`   - Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:`);
      result.errors.forEach(error => {
        console.log(`   - ${error.message || error}`);
      });
    }

    // Fetch and display keys from database
    const [assignedKeys] = await connection.execute(
      `SELECT pak.*, p.product_name
       FROM res_product_activation_keys pak
       INNER JOIN res_products p ON pak.product_id = p.product_id
       WHERE pak.order_id = ? AND pak.user_id = ? AND pak.status = 'used'
       ORDER BY pak.used_at DESC`,
      [orderId, userId]
    );

    if (assignedKeys.length > 0) {
      console.log(`\n📋 Keys in Database:`);
      assignedKeys.forEach(key => {
        console.log(`   - Product: ${key.product_name} (ID: ${key.product_id})`);
        console.log(`     Key: ${key.activation_key}`);
        console.log(`     Status: ${key.status}`);
        console.log(`     Used At: ${key.used_at || 'N/A'}`);
      });
    } else {
      console.log(`\n❌ No keys found in database after processing.`);
    }

    await connection.commit();
    console.log(`\n✅ Transaction committed successfully!`);

  } catch (error) {
    if (connection) {
      await connection.rollback();
      console.error(`\n❌ Transaction rolled back due to error`);
    }
    console.error(`\n❌ Error assigning keys for order 28:`, error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run the script
assignKeysForOrder28()
  .then(() => {
    console.log(`\n✨ Script completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n💥 Script failed:`, error);
    process.exit(1);
  });
