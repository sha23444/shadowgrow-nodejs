/**
 * Script to check order 28 status and activation keys
 */

const { pool } = require('../config/database');

async function checkOrder28() {
  let connection;
  
  try {
    connection = await pool.getConnection();

    const orderId = 28;
    
    // Check order details
    const [orders] = await connection.execute(
      'SELECT order_id, user_id, order_status, payment_status, created_at, item_types FROM res_orders WHERE order_id = ?',
      [orderId]
    );

    if (orders.length === 0) {
      console.error(`❌ Order ${orderId} not found`);
      return;
    }

    const order = orders[0];
    const userId = order.user_id;
    const itemTypes = JSON.parse(order.item_types || '[]');

    console.log(`\n📦 Order ${orderId} Details:`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Order Status: ${order.order_status}`);
    console.log(`   Payment Status: ${order.payment_status}`);
    console.log(`   Item Types: ${itemTypes.join(', ')}`);
    console.log(`   Created At: ${order.created_at}`);

    // Check if order has digital products
    if (!itemTypes.includes(3)) {
      console.log(`\n⚠️  Order ${orderId} does not contain digital products (item_type = 3)`);
      console.log(`   Item types in order: ${itemTypes.join(', ')}`);
      return;
    }

    // Check products in order
    const [orderItems] = await connection.execute(
      `SELECT 
        up.product_id,
        up.quantity,
        rp.product_name,
        rp.requires_activation_key,
        rp.is_digital_download
       FROM res_uproducts up
       INNER JOIN res_products rp ON up.product_id = rp.product_id
       WHERE up.order_id = ? AND up.user_id = ?`,
      [orderId, userId]
    );

    if (orderItems.length === 0) {
      console.log(`\n⚠️  No products found in res_uproducts for order ${orderId}`);
      return;
    }

    console.log(`\n📋 Products in Order:`);
    orderItems.forEach(item => {
      console.log(`   - ${item.product_name} (ID: ${item.product_id})`);
      console.log(`     Quantity: ${item.quantity}`);
      console.log(`     requires_activation_key: ${item.requires_activation_key}`);
      console.log(`     is_digital_download: ${item.is_digital_download}`);
    });

    // Check assigned activation keys
    const [assignedKeys] = await connection.execute(
      `SELECT 
        pak.key_id,
        pak.product_id,
        pak.activation_key,
        pak.status,
        pak.order_id,
        pak.user_id,
        pak.used_at,
        p.product_name
       FROM res_product_activation_keys pak
       INNER JOIN res_products p ON pak.product_id = p.product_id
       WHERE pak.order_id = ? AND pak.user_id = ?`,
      [orderId, userId]
    );

    console.log(`\n🔑 Assigned Activation Keys:`);
    if (assignedKeys.length === 0) {
      console.log(`   ❌ No keys assigned for order ${orderId}`);
      
      // Check if products need keys
      const productsNeedingKeys = orderItems.filter(item => 
        item.requires_activation_key === 1 || item.is_digital_download === 1
      );
      
      if (productsNeedingKeys.length > 0) {
        console.log(`\n⚠️  Products that need keys:`);
        productsNeedingKeys.forEach(item => {
          console.log(`   - ${item.product_name} (ID: ${item.product_id})`);
          
          // Check available keys for this product
          connection.execute(
            `SELECT COUNT(*) as available_count 
             FROM res_product_activation_keys 
             WHERE product_id = ? AND status = 'available'`,
            [item.product_id]
          ).then(([available]) => {
            console.log(`     Available keys: ${available[0].available_count}`);
          });
        });
      }
    } else {
      assignedKeys.forEach(key => {
        console.log(`   ✅ Product: ${key.product_name} (ID: ${key.product_id})`);
        console.log(`      Key: ${key.activation_key}`);
        console.log(`      Status: ${key.status}`);
        console.log(`      Used At: ${key.used_at || 'N/A'}`);
      });
    }

    // Check if order was processed with is_active = 1
    // We can't check this directly, but we can check payment_status
    if (order.payment_status === 2) {
      console.log(`\n✅ Payment Status is 2 (Paid) - Order should have triggered auto-assignment`);
    } else {
      console.log(`\n⚠️  Payment Status is ${order.payment_status} - Order may not have been fully processed`);
    }

  } catch (error) {
    console.error(`\n❌ Error checking order 28:`, error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run the script
checkOrder28()
  .then(() => {
    console.log(`\n✨ Check completed!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n💥 Script failed:`, error);
    process.exit(1);
  });
