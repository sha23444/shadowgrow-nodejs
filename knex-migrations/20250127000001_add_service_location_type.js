/**
 * Migration: Add service_location_type field to res_products table
 * Date: 2025-01-27
 * Description: Adds service_location_type to indicate if service is offline/online/hybrid
 */

exports.up = async function(knex) {
  // Check if column already exists
  const hasLocationType = await knex.schema.hasColumn('res_products', 'service_location_type');
  
  if (!hasLocationType) {
    // Add service location type field
    await knex.schema.alterTable('res_products', function(table) {
      table.string('service_location_type', 20).nullable().defaultTo('online').comment('Service location: offline, online, hybrid');
      table.boolean('is_service_available').defaultTo(true).comment('Service availability: yes or no');
    });
    
    console.log('✅ Service location type field added to res_products table');
    console.log('✅ Service availability field added to res_products table');
  } else {
    console.log('⚠️ Service location type field already exists in res_products table');
  }
};

exports.down = async function(knex) {
  const hasLocationType = await knex.schema.hasColumn('res_products', 'service_location_type');
  
  if (hasLocationType) {
    await knex.schema.alterTable('res_products', function(table) {
      table.dropColumn('service_location_type');
      table.dropColumn('is_service_available');
    });
    
    console.log('✅ Service location type field removed from res_products table');
    console.log('✅ Service availability field removed from res_products table');
  }
};

