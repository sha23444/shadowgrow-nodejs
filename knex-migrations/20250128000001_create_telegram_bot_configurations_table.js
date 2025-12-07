/**
 * Migration: Create telegram_bot_configurations table
 * Date: 2025-01-28
 * Description: Stores multiple Telegram bot configurations for different modules/events
 */

exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('telegram_bot_configurations');
  
  if (!hasTable) {
    await knex.schema.createTable('telegram_bot_configurations', function(table) {
      table.increments('id').primary();
      table.string('module', 100).notNullable().comment('Module name: new_user_signup, order_details, etc.');
      table.string('bot_token', 255).notNullable().comment('Telegram bot token');
      table.string('chat_id', 50).nullable().comment('Default chat ID for this bot (optional)');
      table.string('bot_name', 100).nullable().comment('Friendly name for the bot');
      table.string('description', 255).nullable().comment('Description of what this bot is used for');
      table.boolean('is_active').defaultTo(true).comment('Whether this configuration is active');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('module', 'idx_telegram_module');
      table.index('is_active', 'idx_telegram_is_active');
      // Note: We enforce only one active config per module in application logic, not DB constraint
    });
    
    console.log('✅ telegram_bot_configurations table created');
  } else {
    console.log('⚠️ telegram_bot_configurations table already exists');
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('telegram_bot_configurations');
  
  if (hasTable) {
    await knex.schema.dropTable('telegram_bot_configurations');
    console.log('✅ telegram_bot_configurations table dropped');
  }
};

