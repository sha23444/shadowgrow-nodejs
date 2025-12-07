exports.up = function (knex) {
  return knex.schema.hasColumn('res_service_bookings', 'fulfillment_type').then((exists) => {
    if (!exists) {
      return knex.schema.alterTable('res_service_bookings', function (table) {
        table.string('fulfillment_type', 20).nullable().after('service_requirements');
      });
    }
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('res_service_bookings', function (table) {
    table.dropColumn('fulfillment_type');
  });
};

