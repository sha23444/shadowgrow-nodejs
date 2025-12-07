/**
 * Migration: Add service-specific fields to res_products table
 * Date: 2025-01-26
 * Description: Adds duration, service_type, requires_consultation, and is_customizable fields
 */

exports.up = async function(knex) {
  // Check if columns already exist before adding them
  const hasDuration = await knex.schema.hasColumn('res_products', 'duration');
  
  if (!hasDuration) {
    // Add service-specific fields to res_products table
    await knex.schema.alterTable('res_products', function(table) {
      table.string('duration', 100).nullable().comment('Service duration (e.g., "2-3 days", "1 week")');
      table.string('service_type', 50).nullable().comment('Service type: standard, premium, custom');
      table.boolean('requires_consultation').defaultTo(false).comment('Whether service requires consultation');
      table.boolean('is_customizable').defaultTo(false).comment('Whether service is customizable');
    });
    
    console.log('✅ Service-specific fields added to res_products table');
  } else {
    console.log('⚠️ Service-specific fields already exist in res_products table');
  }
};

exports.down = async function(knex) {
  const hasDuration = await knex.schema.hasColumn('res_products', 'duration');
  
  if (hasDuration) {
    await knex.schema.alterTable('res_products', function(table) {
      table.dropColumn('duration');
      table.dropColumn('service_type');
      table.dropColumn('requires_consultation');
      table.dropColumn('is_customizable');
    });
    
    console.log('✅ Service-specific fields removed from res_products table');
  }
};

