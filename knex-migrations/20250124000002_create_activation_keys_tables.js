/**
 * Migration: Create activation keys management table
 * Date: 2025-01-24
 * Description: Creates table for managing product activation keys
 */

exports.up = async function(knex) {
  // Check if tables already exist before creating them
  const hasActivationKeysTable = await knex.schema.hasTable('res_product_activation_keys');
  
  if (!hasActivationKeysTable) {
    // Create activation keys table
    await knex.schema.createTable('res_product_activation_keys', function(table) {
      table.increments('key_id').primary();
      table.integer('product_id').notNullable().comment('Reference to res_products');
      table.string('activation_key', 255).notNullable().comment('The actual activation key');
      table.string('key_type', 50).defaultTo('license').comment('Type: license, serial, code, etc.');
      table.text('description').nullable().comment('Description of what this key provides');
      table.enum('status', ['available', 'used', 'expired', 'revoked']).defaultTo('available');
      table.integer('order_id').nullable().comment('Order that used this key');
      table.integer('user_id').nullable().comment('User who received this key');
      table.timestamp('used_at').nullable().comment('When the key was used');
      table.timestamp('expires_at').nullable().comment('When the key expires');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('product_id');
      table.index('activation_key');
      table.index('status');
      table.index('order_id');
      table.index('user_id');
      table.index('expires_at');
      
      // Unique constraint on activation key
      table.unique('activation_key');
    });
  } else {
    console.log('res_product_activation_keys table already exists, skipping...');
  }

  const hasBatchesTable = await knex.schema.hasTable('res_activation_key_batches');
  
  if (!hasBatchesTable) {
    // Create activation key batches table for bulk management
    await knex.schema.createTable('res_activation_key_batches', function(table) {
      table.increments('batch_id').primary();
      table.integer('product_id').notNullable().comment('Reference to res_products');
      table.string('batch_name', 255).notNullable().comment('Name/description of the batch');
      table.integer('total_keys').notNullable().comment('Total number of keys in batch');
      table.integer('used_keys').defaultTo(0).comment('Number of keys used from batch');
      table.text('notes').nullable().comment('Additional notes about the batch');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('product_id');
      table.index('created_at');
    });
  } else {
    console.log('res_activation_key_batches table already exists, skipping...');
  }

  const hasLogsTable = await knex.schema.hasTable('res_activation_key_logs');
  
  if (!hasLogsTable) {
    // Create activation key usage log table
    await knex.schema.createTable('res_activation_key_logs', function(table) {
      table.increments('log_id').primary();
      table.integer('key_id').notNullable().comment('Reference to activation key');
      table.integer('order_id').notNullable().comment('Order that used the key');
      table.integer('user_id').notNullable().comment('User who used the key');
      table.string('action', 50).notNullable().comment('Action: used, revoked, expired');
      table.text('notes').nullable().comment('Additional notes');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('key_id');
      table.index('order_id');
      table.index('user_id');
      table.index('action');
      table.index('created_at');
    });
  } else {
    console.log('res_activation_key_logs table already exists, skipping...');
  }
};

exports.down = async function(knex) {
  // Drop tables in reverse order
  await knex.schema.dropTableIfExists('res_activation_key_logs');
  await knex.schema.dropTableIfExists('res_activation_key_batches');
  await knex.schema.dropTableIfExists('res_product_activation_keys');
};
