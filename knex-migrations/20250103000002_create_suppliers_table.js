exports.up = function(knex) {
  return knex.schema.createTable('res_suppliers', function(table) {
    table.increments('supplier_id').primary();
    table.string('supplier_name', 255).notNullable();
    table.string('contact_person', 255);
    table.string('email', 255).unique();
    table.string('phone', 50);
    table.string('mobile', 50);
    table.string('website', 255);
    table.text('address');
    table.string('city', 100);
    table.string('state', 100);
    table.string('country', 100);
    table.string('postal_code', 20);
    table.string('tax_id', 100);
    table.string('gst_number', 50);
    table.decimal('credit_limit', 15, 2).defaultTo(0);
    table.integer('payment_terms_days').defaultTo(30);
    table.text('notes');
    table.enum('status', ['active', 'inactive', 'suspended']).defaultTo('active');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for better performance
    table.index(['supplier_name']);
    table.index(['email']);
    table.index(['status']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_suppliers');
};
