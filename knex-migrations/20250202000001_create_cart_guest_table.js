exports.up = function(knex) {
  return knex.schema.createTable('res_cart_guest', function(table) {
    table.increments('id').primary();
    table.string('cart_id', 255).notNullable().comment('Guest cart identifier (session ID or fingerprint)');
    table.integer('item_id').notNullable().comment('ID of the item (product_id, file_id, etc.)');
    table.integer('item_type').notNullable().comment('Type of item (1=Digital File, 2=Package, 3=Digital Product, 4=Courses, 5=Wallet, 6=Physical Product, 7=Service)');
    table.string('item_name', 255).notNullable();
    table.decimal('sale_price', 10, 2).notNullable().defaultTo(0);
    table.decimal('original_price', 10, 2).notNullable().defaultTo(0);
    table.integer('quantity').notNullable().defaultTo(1);
    table.integer('min_cart_qty').notNullable().defaultTo(1);
    table.integer('max_cart_qty').notNullable().defaultTo(99);
    table.text('media').nullable().comment('JSON string of media/images');
    table.text('meta').nullable().comment('Additional metadata as JSON');
    table.tinyint('is_active').defaultTo(1).comment('1=active, 0=deleted');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for better performance
    table.index(['cart_id']);
    table.index(['cart_id', 'is_active']);
    table.index(['item_id', 'item_type']);
    table.index(['created_at']);
    
    // Composite unique constraint to prevent duplicate items in same cart
    table.unique(['cart_id', 'item_id', 'item_type'], { indexName: 'unique_cart_item' });
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_cart_guest');
};

