/**
 * Migration: Add delivery methods and related fields to res_products table
 * Date: 2025-01-24
 * Description: Adds delivery method, shipping options, and digital delivery fields
 */

exports.up = async function(knex) {
  // Check if columns already exist before adding them
  const hasColumn = await knex.schema.hasColumn('res_products', 'delivery_method');
  
  if (!hasColumn) {
    // Add delivery method and related fields to res_products table
    await knex.schema.alterTable('res_products', function(table) {
      // Delivery method: 1=Shipping, 2=Instant Delivery, 3=Both
      table.integer('delivery_method').defaultTo(1).comment('1=Shipping, 2=Instant Delivery, 3=Both');
      
      // Shipping related fields
      table.decimal('shipping_cost', 10, 2).nullable().comment('Shipping cost for physical products');
      table.decimal('free_shipping_threshold', 10, 2).nullable().comment('Minimum order amount for free shipping');
      table.integer('estimated_delivery_days').nullable().comment('Estimated delivery time in days');
      table.boolean('requires_shipping_address').defaultTo(true).comment('Whether product requires shipping address');
      
      // Digital delivery fields
      table.boolean('is_digital_download').defaultTo(false).comment('Whether product is digital download');
      table.boolean('requires_activation_key').defaultTo(false).comment('Whether product requires activation key');
      table.text('delivery_instructions').nullable().comment('Instructions for digital delivery');
      table.integer('download_limit').nullable().comment('Maximum number of downloads allowed');
      table.integer('download_expiry_days').nullable().comment('Days until download link expires');
      
      // Inventory management
      table.boolean('track_inventory').defaultTo(true).comment('Whether to track inventory for this product');
      table.boolean('allow_backorder').defaultTo(false).comment('Allow orders when out of stock');
      table.integer('low_stock_threshold').nullable().comment('Alert when stock falls below this number');
      
      // Product dimensions and weight (for shipping calculations)
      table.decimal('weight', 8, 2).nullable().comment('Product weight in kg');
      table.decimal('length', 8, 2).nullable().comment('Product length in cm');
      table.decimal('width', 8, 2).nullable().comment('Product width in cm');
      table.decimal('height', 8, 2).nullable().comment('Product height in cm');
    });

    // Add indexes separately to avoid conflicts
    try {
      await knex.schema.alterTable('res_products', function(table) {
        table.index('delivery_method');
        table.index('is_digital_download');
        table.index('requires_activation_key');
        table.index('track_inventory');
      });
    } catch (error) {
      console.log('Indexes may already exist, continuing...');
    }
  } else {
    console.log('Delivery method columns already exist, skipping...');
  }
};

exports.down = async function(knex) {
  // Check if columns exist before dropping them
  const hasColumn = await knex.schema.hasColumn('res_products', 'delivery_method');
  
  if (hasColumn) {
    // Remove the added columns
    await knex.schema.alterTable('res_products', function(table) {
      // Drop indexes first
      try {
        table.dropIndex('delivery_method');
        table.dropIndex('is_digital_download');
        table.dropIndex('requires_activation_key');
        table.dropIndex('track_inventory');
      } catch (error) {
        console.log('Indexes may not exist, continuing...');
      }

      // Drop columns
      table.dropColumn('delivery_method');
      table.dropColumn('shipping_cost');
      table.dropColumn('free_shipping_threshold');
      table.dropColumn('estimated_delivery_days');
      table.dropColumn('requires_shipping_address');
      table.dropColumn('is_digital_download');
      table.dropColumn('requires_activation_key');
      table.dropColumn('delivery_instructions');
      table.dropColumn('download_limit');
      table.dropColumn('download_expiry_days');
      table.dropColumn('track_inventory');
      table.dropColumn('allow_backorder');
      table.dropColumn('low_stock_threshold');
      table.dropColumn('weight');
      table.dropColumn('length');
      table.dropColumn('width');
      table.dropColumn('height');
    });
  }
};
