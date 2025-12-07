exports.up = function(knex) {
  return knex.schema.createTable('res_service_media', function(table) {
    table.increments('media_id').primary();
    table.integer('service_id').notNullable();
    table.string('file_name', 255).notNullable();
    table.string('file_path', 500).notNullable();
    table.string('file_type', 50).notNullable(); // image, video, document
    table.string('mime_type', 100).notNullable();
    table.integer('file_size').nullable(); // in bytes
    table.string('alt_text', 255).nullable();
    table.text('caption').nullable();
    table.boolean('is_cover').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['service_id']);
    table.index(['file_type']);
    table.index(['is_cover']);
    table.index(['is_active']);
    table.index(['sort_order']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_service_media');
};
