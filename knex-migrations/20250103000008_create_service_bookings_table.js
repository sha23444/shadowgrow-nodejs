exports.up = function(knex) {
  return knex.schema.createTable('res_service_bookings', function(table) {
    table.increments('booking_id').primary();
    table.integer('service_id').notNullable();
    table.integer('user_id').nullable(); // If user is logged in
    table.string('customer_name', 255).notNullable();
    table.string('customer_email', 255).notNullable();
    table.string('customer_phone', 50).nullable();
    table.text('customer_message').nullable();
    table.text('service_requirements').nullable(); // Specific requirements for this booking
    table.decimal('total_price', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('USD');
    table.string('booking_status', 20).defaultTo('pending'); // pending, confirmed, in_progress, completed, cancelled
    table.string('payment_status', 20).defaultTo('pending'); // pending, paid, refunded
    table.text('notes').nullable(); // Admin notes
    table.timestamp('preferred_date').nullable(); // When customer wants service
    table.timestamp('scheduled_date').nullable(); // When service is actually scheduled
    table.timestamp('completed_date').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['service_id']);
    table.index(['user_id']);
    table.index(['customer_email']);
    table.index(['booking_status']);
    table.index(['payment_status']);
    table.index(['preferred_date']);
    table.index(['scheduled_date']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_service_bookings');
};
