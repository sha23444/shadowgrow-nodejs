/**
 * Migration: Add name and mobile fields to telegram_bot_configurations
 * Date: 2025-01-28
 * Description: 
 * - Adds name field for bot owner/contact name
 * - Adds mobile field for bot owner/contact mobile number
 */

exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('telegram_bot_configurations');
  
  if (hasTable) {
    const table = knex.schema.table('telegram_bot_configurations', function(table) {
      // Check if columns already exist before adding
      table.string('name', 100).nullable().comment('Contact name for this bot');
      table.string('mobile', 50).nullable().comment('Contact mobile number for this bot');
    });

    try {
      await table;
      console.log('✅ Added name and mobile fields to telegram_bot_configurations');
    } catch (error) {
      // Check if columns already exist
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('⚠️ name and mobile fields already exist');
      } else {
        throw error;
      }
    }
  } else {
    console.log('⚠️ telegram_bot_configurations table does not exist');
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('telegram_bot_configurations');
  
  if (hasTable) {
    await knex.schema.table('telegram_bot_configurations', function(table) {
      table.dropColumn('name');
      table.dropColumn('mobile');
    });
    console.log('✅ Removed name and mobile fields from telegram_bot_configurations');
  }
};

