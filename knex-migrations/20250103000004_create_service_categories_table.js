exports.up = function(knex) {
  return knex.schema.createTable('res_service_categories', function(table) {
    table.increments('category_id').primary();
    table.string('category_name', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.text('description').nullable();
    table.string('icon', 100).nullable();
    table.string('color', 7).nullable(); // Hex color code
    table.integer('sort_order').defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['slug']);
    table.index(['is_active']);
    table.index(['sort_order']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_service_categories');
};
