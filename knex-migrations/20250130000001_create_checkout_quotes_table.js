/**
 * Migration: Create checkout quotes table
 * Date: 2025-01-30
 * Description: Stores checkout quotes with stock reservations for payment pricing lock
 */

exports.up = async function(knex) {
  await knex.schema.createTable('res_checkout_quotes', function(table) {
    table.string('quote_id', 100).primary().comment('Unique quote identifier');
    table.integer('user_id').notNullable().comment('User who requested the quote');
    
    // Quote details
    table.decimal('subtotal', 15, 2).notNullable().defaultTo(0.00);
    table.decimal('shipping', 15, 2).notNullable().defaultTo(0.00);
    table.decimal('total', 15, 2).notNullable();
    
    // Stock reservations (JSON array of {item_id, item_type, quantity_reserved, product_id})
    table.text('reservations').nullable().comment('JSON array of stock reservations');
    
    // Expiration
    table.timestamp('expires_at').notNullable();
    table.boolean('is_used').defaultTo(false).comment('Whether this quote was used for an order');
    
    // Audit
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['user_id']);
    table.index(['expires_at']);
    table.index(['is_used']);
    table.index(['created_at']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('res_checkout_quotes');
};

