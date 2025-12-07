/**
 * Migration: Add Ship Rocket fields to res_orders table
 * Date: 2025-01-31
 * Description: Adds fields for Ship Rocket integration (shipment ID, AWB, tracking, etc.)
 */

exports.up = function(knex) {
  return knex.schema.hasColumn('res_orders', 'shiprocket_order_id').then((exists) => {
    if (!exists) {
      return knex.schema.alterTable('res_orders', function(table) {
        table.string('shiprocket_order_id', 255).nullable().comment('Ship Rocket order/shipment ID');
        table.string('shiprocket_awb', 100).nullable().comment('Ship Rocket AWB (Airway Bill) number');
        table.text('shiprocket_tracking_url').nullable().comment('Ship Rocket tracking URL');
        table.string('shiprocket_courier_name', 255).nullable().comment('Courier name assigned by Ship Rocket');
        table.string('shiprocket_courier_id', 100).nullable().comment('Courier ID from Ship Rocket');
        table.text('shiprocket_label_url').nullable().comment('Shipping label URL');
        table.text('shiprocket_manifest_url').nullable().comment('Manifest URL');
        table.string('shiprocket_pickup_status', 50).nullable().comment('Pickup status from Ship Rocket');
        table.string('shiprocket_status', 50).nullable().comment('Current shipment status from Ship Rocket');
        table.text('shiprocket_response').nullable().comment('Full Ship Rocket API response (JSON)');
        table.timestamp('shiprocket_created_at').nullable().comment('When shipment was created in Ship Rocket');
        table.timestamp('shiprocket_shipped_at').nullable().comment('When shipment was marked as shipped');
        table.timestamp('shiprocket_delivered_at').nullable().comment('When shipment was delivered');
        
        // Add indexes for faster lookups
        table.index('shiprocket_order_id', 'idx_shiprocket_order_id');
        table.index('shiprocket_awb', 'idx_shiprocket_awb');
        table.index('shiprocket_status', 'idx_shiprocket_status');
      });
    }
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('res_orders', function(table) {
    table.dropColumn('shiprocket_order_id');
    table.dropColumn('shiprocket_awb');
    table.dropColumn('shiprocket_tracking_url');
    table.dropColumn('shiprocket_courier_name');
    table.dropColumn('shiprocket_courier_id');
    table.dropColumn('shiprocket_label_url');
    table.dropColumn('shiprocket_manifest_url');
    table.dropColumn('shiprocket_pickup_status');
    table.dropColumn('shiprocket_status');
    table.dropColumn('shiprocket_response');
    table.dropColumn('shiprocket_created_at');
    table.dropColumn('shiprocket_shipped_at');
    table.dropColumn('shiprocket_delivered_at');
  });
};

