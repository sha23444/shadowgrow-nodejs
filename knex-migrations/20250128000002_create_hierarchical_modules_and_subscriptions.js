/**
 * Migration: Create hierarchical modules and multi-module subscriptions
 * Date: 2025-01-28
 * Description: 
 * - Creates telegram_modules table for hierarchical module structure
 * - Creates telegram_bot_module_subscriptions junction table
 * - Migrates existing data from telegram_bot_configurations
 */

exports.up = async function(knex) {
  const hasModulesTable = await knex.schema.hasTable('telegram_modules');
  const hasSubscriptionsTable = await knex.schema.hasTable('telegram_bot_module_subscriptions');

  // Step 1: Create telegram_modules table
  if (!hasModulesTable) {
    await knex.schema.createTable('telegram_modules', function(table) {
      table.increments('id').primary();
      table.string('module_key', 100).notNullable().unique().comment('Unique module identifier: order_pending, user_signup, etc.');
      table.string('module_name', 100).notNullable().comment('Display name: Pending Order, New User Signup, etc.');
      table.string('category', 50).nullable().comment('Parent category: Order, User, Payment, etc.');
      table.integer('parent_module_id').unsigned().nullable().comment('Parent module ID (for hierarchy)');
      table.text('description').nullable().comment('Description of what this module handles');
      table.integer('sort_order').defaultTo(0).comment('Display order within category');
      table.boolean('is_active').defaultTo(true).comment('Whether this module is available');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('category', 'idx_telegram_modules_category');
      table.index('parent_module_id', 'idx_telegram_modules_parent');
      table.index('is_active', 'idx_telegram_modules_active');
      
      // Foreign key to parent module (self-reference)
      table.foreign('parent_module_id', 'fk_telegram_modules_parent')
        .references('id')
        .inTable('telegram_modules')
        .onDelete('SET NULL');
    });
    
    console.log('✅ telegram_modules table created');
  } else {
    console.log('⚠️ telegram_modules table already exists');
  }

  // Step 2: Create telegram_bot_module_subscriptions junction table
  if (!hasSubscriptionsTable) {
    await knex.schema.createTable('telegram_bot_module_subscriptions', function(table) {
      table.increments('id').primary();
      table.integer('bot_config_id').unsigned().notNullable().comment('Reference to telegram_bot_configurations.id');
      table.integer('module_id').unsigned().notNullable().comment('Reference to telegram_modules.id');
      table.boolean('is_active').defaultTo(true).comment('Whether this subscription is active');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('bot_config_id', 'idx_subscriptions_bot');
      table.index('module_id', 'idx_subscriptions_module');
      table.index('is_active', 'idx_subscriptions_active');
      
      // Foreign keys
      table.foreign('bot_config_id', 'fk_subscriptions_bot')
        .references('id')
        .inTable('telegram_bot_configurations')
        .onDelete('CASCADE');
      
      table.foreign('module_id', 'fk_subscriptions_module')
        .references('id')
        .inTable('telegram_modules')
        .onDelete('CASCADE');
      
      // Unique constraint: one bot can only subscribe to a module once
      table.unique(['bot_config_id', 'module_id'], 'unique_bot_module_subscription');
    });
    
    console.log('✅ telegram_bot_module_subscriptions table created');
  } else {
    console.log('⚠️ telegram_bot_module_subscriptions table already exists');
  }

  // Step 3: Seed initial hierarchical modules
  const existingModules = await knex('telegram_modules').select('id');
  
  if (existingModules.length === 0) {
    // Insert parent categories first
    await knex('telegram_modules').insert({
      module_key: 'order',
      module_name: 'Order',
      category: 'Order',
      parent_module_id: null,
      description: 'Order-related notifications',
      sort_order: 1,
      is_active: true
    });

    await knex('telegram_modules').insert({
      module_key: 'user',
      module_name: 'User',
      category: 'User',
      parent_module_id: null,
      description: 'User-related notifications',
      sort_order: 2,
      is_active: true
    });

    await knex('telegram_modules').insert({
      module_key: 'payment',
      module_name: 'Payment',
      category: 'Payment',
      parent_module_id: null,
      description: 'Payment-related notifications',
      sort_order: 3,
      is_active: true
    });

    await knex('telegram_modules').insert({
      module_key: 'inventory',
      module_name: 'Inventory',
      category: 'Inventory',
      parent_module_id: null,
      description: 'Inventory and stock notifications',
      sort_order: 4,
      is_active: true
    });

    // Get parent category IDs
    const orderCategory = await knex('telegram_modules').where('module_key', 'order').first();
    const userCategory = await knex('telegram_modules').where('module_key', 'user').first();
    const paymentCategory = await knex('telegram_modules').where('module_key', 'payment').first();
    const inventoryCategory = await knex('telegram_modules').where('module_key', 'inventory').first();

    // Insert Order sub-modules
    await knex('telegram_modules').insert([
      {
        module_key: 'order_pending',
        module_name: 'Pending Order',
        category: 'Order',
        parent_module_id: orderCategory ? orderCategory.id : null,
        description: 'Notifications for pending orders',
        sort_order: 1,
        is_active: true
      },
      {
        module_key: 'order_processing',
        module_name: 'Processing Order',
        category: 'Order',
        parent_module_id: orderCategory ? orderCategory.id : null,
        description: 'Notifications for orders being processed',
        sort_order: 2,
        is_active: true
      },
      {
        module_key: 'order_completed',
        module_name: 'Completed Order',
        category: 'Order',
        parent_module_id: orderCategory ? orderCategory.id : null,
        description: 'Notifications for completed orders',
        sort_order: 3,
        is_active: true
      },
      {
        module_key: 'order_failed',
        module_name: 'Failed Order',
        category: 'Order',
        parent_module_id: orderCategory ? orderCategory.id : null,
        description: 'Notifications for failed orders',
        sort_order: 4,
        is_active: true
      },
      {
        module_key: 'order_cancelled',
        module_name: 'Cancelled Order',
        category: 'Order',
        parent_module_id: orderCategory ? orderCategory.id : null,
        description: 'Notifications for cancelled orders',
        sort_order: 5,
        is_active: true
      },
      {
        module_key: 'order_details',
        module_name: 'Order Details',
        category: 'Order',
        parent_module_id: orderCategory ? orderCategory.id : null,
        description: 'General order details and information',
        sort_order: 6,
        is_active: true
      }
    ]);

    // Insert User sub-modules
    await knex('telegram_modules').insert([
      {
        module_key: 'user_signup',
        module_name: 'New User Signup',
        category: 'User',
        parent_module_id: userCategory ? userCategory.id : null,
        description: 'Notifications when new users register',
        sort_order: 1,
        is_active: true
      },
      {
        module_key: 'user_login',
        module_name: 'User Login',
        category: 'User',
        parent_module_id: userCategory ? userCategory.id : null,
        description: 'Notifications for user logins',
        sort_order: 2,
        is_active: true
      },
      {
        module_key: 'user_profile_update',
        module_name: 'Profile Update',
        category: 'User',
        parent_module_id: userCategory ? userCategory.id : null,
        description: 'Notifications when users update profiles',
        sort_order: 3,
        is_active: true
      }
    ]);

    // Insert Payment sub-modules
    await knex('telegram_modules').insert([
      {
        module_key: 'payment_pending',
        module_name: 'Pending Payment',
        category: 'Payment',
        parent_module_id: paymentCategory ? paymentCategory.id : null,
        description: 'Notifications for pending payments',
        sort_order: 1,
        is_active: true
      },
      {
        module_key: 'payment_success',
        module_name: 'Successful Payment',
        category: 'Payment',
        parent_module_id: paymentCategory ? paymentCategory.id : null,
        description: 'Notifications for successful payments',
        sort_order: 2,
        is_active: true
      },
      {
        module_key: 'payment_failed',
        module_name: 'Failed Payment',
        category: 'Payment',
        parent_module_id: paymentCategory ? paymentCategory.id : null,
        description: 'Notifications for failed payments',
        sort_order: 3,
        is_active: true
      },
      {
        module_key: 'payment_refunded',
        module_name: 'Payment Refunded',
        category: 'Payment',
        parent_module_id: paymentCategory ? paymentCategory.id : null,
        description: 'Notifications when payments are refunded',
        sort_order: 4,
        is_active: true
      },
      {
        module_key: 'refund_requested',
        module_name: 'Refund Requested',
        category: 'Payment',
        parent_module_id: paymentCategory ? paymentCategory.id : null,
        description: 'Notifications when refund is requested',
        sort_order: 5,
        is_active: true
      }
    ]);

    // Insert Inventory sub-modules
    await knex('telegram_modules').insert([
      {
        module_key: 'low_stock',
        module_name: 'Low Stock Alert',
        category: 'Inventory',
        parent_module_id: inventoryCategory ? inventoryCategory.id : null,
        description: 'Notifications when product stock is low',
        sort_order: 1,
        is_active: true
      },
      {
        module_key: 'out_of_stock',
        module_name: 'Out of Stock',
        category: 'Inventory',
        parent_module_id: inventoryCategory ? inventoryCategory.id : null,
        description: 'Notifications when products are out of stock',
        sort_order: 2,
        is_active: true
      },
      {
        module_key: 'stock_restocked',
        module_name: 'Stock Restocked',
        category: 'Inventory',
        parent_module_id: inventoryCategory ? inventoryCategory.id : null,
        description: 'Notifications when stock is restocked',
        sort_order: 3,
        is_active: true
      }
    ]);

    console.log('✅ Initial hierarchical modules seeded');
  } else {
    console.log('⚠️ Modules already exist, skipping seed');
  }

  // Step 4: Migrate existing telegram_bot_configurations to new structure
  // This step creates subscriptions for existing bot configurations
  try {
    const existingConfigs = await knex('telegram_bot_configurations').select('id', 'module');
    
    for (const config of existingConfigs) {
      // Find matching module by old module key
      const moduleKey = config.module;
      
      // Map old module names to new module keys
      const moduleMapping = {
        'new_user_signup': 'user_signup',
        'order_details': 'order_details',
        'order_completed': 'order_completed',
        'order_cancelled': 'order_cancelled',
        'payment_failed': 'payment_failed',
        'payment_success': 'payment_success',
        'low_stock': 'low_stock',
        'refund_requested': 'refund_requested'
      };

      const newModuleKey = moduleMapping[moduleKey] || moduleKey;
      
      // Find the module
      const [module] = await knex('telegram_modules')
        .where('module_key', newModuleKey)
        .select('id');
      
      if (module && module.id) {
        // Check if subscription already exists
        const existing = await knex('telegram_bot_module_subscriptions')
          .where({
            bot_config_id: config.id,
            module_id: module.id
          })
          .first();
        
        if (!existing) {
          await knex('telegram_bot_module_subscriptions').insert({
            bot_config_id: config.id,
            module_id: module.id,
            is_active: true
          });
        }
      }
    }
    
    console.log('✅ Migrated existing bot configurations to subscriptions');
  } catch (error) {
    console.log('⚠️ Could not migrate existing configs:', error.message);
    // Don't fail the migration if this step fails
  }
};

exports.down = async function(knex) {
  // Drop tables in reverse order (due to foreign keys)
  const hasSubscriptionsTable = await knex.schema.hasTable('telegram_bot_module_subscriptions');
  const hasModulesTable = await knex.schema.hasTable('telegram_modules');
  
  if (hasSubscriptionsTable) {
    await knex.schema.dropTable('telegram_bot_module_subscriptions');
    console.log('✅ telegram_bot_module_subscriptions table dropped');
  }
  
  if (hasModulesTable) {
    await knex.schema.dropTable('telegram_modules');
    console.log('✅ telegram_modules table dropped');
  }
};

