exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('res_service_category_relationship');
  
  if (!hasTable) {
    await knex.schema.createTable('res_service_category_relationship', function(table) {
      table.increments('id').primary();
      table.integer('service_id').notNullable();
      table.integer('category_id').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index(['service_id']);
      table.index(['category_id']);
      
      // Unique constraint
      table.unique(['service_id', 'category_id']);
    });
    console.log('✅ Created res_service_category_relationship table');
  } else {
    console.log('⚠️ Table res_service_category_relationship already exists');
  }
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_service_category_relationship');
};
