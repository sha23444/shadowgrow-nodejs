exports.up = function (knex) {
  return knex.schema.hasColumn('res_service_bookings', 'cart_snapshot').then((exists) => {
    if (!exists) {
      return knex.schema.alterTable('res_service_bookings', function (table) {
        table.text('cart_snapshot').nullable().after('customer_message');
        table.string('checkout_token', 100).nullable().after('cart_snapshot');
        table.integer('last_order_id').unsigned().nullable().after('payment_status');
        table.string('last_payment_method', 75).nullable().after('last_order_id');
      });
    }
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('res_service_bookings', function (table) {
    table.dropColumn('cart_snapshot');
    table.dropColumn('checkout_token');
    table.dropColumn('last_order_id');
    table.dropColumn('last_payment_method');
  });
};

