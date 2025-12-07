/**
 * Migration: Add billing and shipping address fields to res_orders table
 * Date: 2025-01-31
 * Description: Adds billing_address and shipping_address fields to orders for physical products
 */

exports.up = function(knex) {
  return knex.schema.alterTable('res_orders', function(table) {
    // Check if columns already exist before adding them
    return knex.schema.hasColumn('res_orders', 'billing_address').then((exists) => {
      if (!exists) {
        table.text('billing_address').nullable().comment('JSON object with billing address');
        table.text('shipping_address').nullable().comment('JSON object with shipping address');
      }
    });
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('res_orders', function(table) {
    table.dropColumn('billing_address');
    table.dropColumn('shipping_address');
  });
};

