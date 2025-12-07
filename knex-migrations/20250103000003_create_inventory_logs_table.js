exports.up = function(knex) {
  return knex.schema.createTable('res_inventory_logs', function(table) {
    table.increments('log_id').primary();
    table.integer('product_id').notNullable();
    table.string('action_type', 50).notNullable(); // 'adjustment', 'sale', 'return', 'damage', 'transfer'
    table.integer('quantity_change').notNullable(); // Positive for additions, negative for reductions
    table.integer('previous_stock').notNullable();
    table.integer('new_stock').notNullable();
    table.decimal('unit_cost', 10, 2).nullable();
    table.string('reference_number', 100).nullable(); // Order ID, PO number, etc.
    table.text('notes').nullable();
    table.string('performed_by', 100).nullable(); // User who performed the action
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes for better performance
    table.index(['product_id']);
    table.index(['action_type']);
    table.index(['created_at']);
    table.index(['reference_number']);
    
    // Foreign key constraint
    table.foreign('product_id').references('product_id').inTable('res_products').onDelete('CASCADE');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_inventory_logs');
};
