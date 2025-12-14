/**
 * Script to manually assign activation keys for order 27
 * This is useful for orders that were created before automatic assignment was implemented
 * or if automatic assignment failed for some reason.
 */

const { pool } = require('../config/database');
const DigitalProductDeliveryService = require('../services/DigitalProductDeliveryService');

async function assignKeysForOrder27() {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const orderId = 27;
    
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
      console.log(`\n❓ Do you want to reassign keys? (This will mark old keys as revoked)`);
      // For now, we'll proceed anyway
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

    if (result.assignedKeys.length > 0) {
      console.log(`\n🔑 Assigned Keys:`);
      result.assignedKeys.forEach(key => {
        console.log(`   - Product ID ${key.productId || key.product_id}: ${key.activationKey || key.activation_key || key.key}`);
      });
    }

    // Also fetch and display keys from database
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
    }

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:`);
      result.errors.forEach(error => {
        console.log(`   - ${error.message}`);
      });
    }

    await connection.commit();
    console.log(`\n✅ Transaction committed successfully!`);

  } catch (error) {
    if (connection) {
      await connection.rollback();
      console.error(`\n❌ Transaction rolled back due to error`);
    }
    console.error(`\n❌ Error assigning keys for order 27:`, error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run the script
assignKeysForOrder27()
  .then(() => {
    console.log(`\n✨ Script completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n💥 Script failed:`, error);
    process.exit(1);
  });
