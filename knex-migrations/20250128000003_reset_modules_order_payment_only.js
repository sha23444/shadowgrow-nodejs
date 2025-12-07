/**
 * Migration: Reset modules to only Order and Payment categories
 * Date: 2025-01-28
 * Description: 
 * - Deletes all existing modules and subscriptions
 * - Creates clean hierarchy:
 *   - Order → Pending, Completed
 *   - Payment → Paid, Pending
 */

exports.up = async function(knex) {
  const connection = await knex.client;
  
  try {
    await knex.transaction(async (trx) => {
      // Step 1: Delete all existing module subscriptions
      const hasSubscriptions = await trx.schema.hasTable('telegram_bot_module_subscriptions');
      if (hasSubscriptions) {
        await trx('telegram_bot_module_subscriptions').delete();
        console.log('✅ Deleted all module subscriptions');
      }

      // Step 2: Delete all existing modules
      const hasModules = await trx.schema.hasTable('telegram_modules');
      if (hasModules) {
        await trx('telegram_modules').delete();
        console.log('✅ Deleted all existing modules');
      }

      // Step 3: Create Order category
      const [orderCategory] = await trx('telegram_modules').insert({
        module_key: 'order',
        module_name: 'Order',
        category: 'Order',
        parent_module_id: null,
        description: 'Order-related notifications',
        sort_order: 1,
        is_active: true
      });

      // Get Order category ID (MySQL doesn't support returning, so we query)
      const orderCategoryRecord = await trx('telegram_modules')
        .where('module_key', 'order')
        .first();
      
      const orderCategoryId = orderCategoryRecord.id;

      // Step 4: Create Order sub-modules
      await trx('telegram_modules').insert([
        {
          module_key: 'order_pending',
          module_name: 'Pending Order',
          category: 'Order',
          parent_module_id: orderCategoryId,
          description: 'Notifications for pending orders',
          sort_order: 1,
          is_active: true
        },
        {
          module_key: 'order_completed',
          module_name: 'Completed Order',
          category: 'Order',
          parent_module_id: orderCategoryId,
          description: 'Notifications for completed orders',
          sort_order: 2,
          is_active: true
        }
      ]);

      // Step 5: Create Payment category
      const [paymentCategory] = await trx('telegram_modules').insert({
        module_key: 'payment',
        module_name: 'Payment',
        category: 'Payment',
        parent_module_id: null,
        description: 'Payment-related notifications',
        sort_order: 2,
        is_active: true
      });

      // Get Payment category ID
      const paymentCategoryRecord = await trx('telegram_modules')
        .where('module_key', 'payment')
        .first();
      
      const paymentCategoryId = paymentCategoryRecord.id;

      // Step 6: Create Payment sub-modules
      await trx('telegram_modules').insert([
        {
          module_key: 'payment_paid',
          module_name: 'Paid',
          category: 'Payment',
          parent_module_id: paymentCategoryId,
          description: 'Notifications for paid payments',
          sort_order: 1,
          is_active: true
        },
        {
          module_key: 'payment_pending',
          module_name: 'Pending',
          category: 'Payment',
          parent_module_id: paymentCategoryId,
          description: 'Notifications for pending payments',
          sort_order: 2,
          is_active: true
        }
      ]);

      console.log('✅ Created new module structure:');
      console.log('   📦 Order → Pending, Completed');
      console.log('   💳 Payment → Paid, Pending');
    });
  } catch (error) {
    console.error('❌ Error resetting modules:', error);
    throw error;
  }
};

exports.down = async function(knex) {
  // This migration resets to a clean state, so down migration would restore previous state
  // For safety, we'll just log a warning
  console.log('⚠️ Down migration not implemented for module reset');
  console.log('   To restore previous modules, use a previous migration or manual restore');
};

