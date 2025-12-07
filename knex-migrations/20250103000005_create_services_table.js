exports.up = function(knex) {
  return knex.schema.createTable('res_services', function(table) {
    table.increments('service_id').primary();
    table.string('service_name', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.text('description').nullable();
    table.text('short_description').nullable();
    table.text('features').nullable(); // JSON array of features
    table.text('requirements').nullable(); // What client needs to provide
    table.text('deliverables').nullable(); // What client will receive
    table.decimal('base_price', 10, 2).notNullable();
    table.decimal('sale_price', 10, 2).nullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('duration', 100).nullable(); // e.g., "2-3 days", "1 week"
    table.string('delivery_time', 100).nullable(); // e.g., "24 hours", "3-5 days"
    table.integer('min_quantity').defaultTo(1);
    table.integer('max_quantity').nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_featured').defaultTo(false);
    table.boolean('is_digital').defaultTo(true); // Digital service vs physical
    table.boolean('requires_consultation').defaultTo(false);
    table.boolean('is_customizable').defaultTo(false);
    table.string('service_type', 50).defaultTo('standard'); // standard, premium, custom
    table.text('tags').nullable(); // JSON array of tags
    table.text('meta_title').nullable();
    table.text('meta_description').nullable();
    table.string('status', 20).defaultTo('active'); // active, draft, archived
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['slug']);
    table.index(['is_active']);
    table.index(['is_featured']);
    table.index(['status']);
    table.index(['service_type']);
    table.index(['sort_order']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_services');
};
