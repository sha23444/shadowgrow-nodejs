exports.up = function (knex) {
  return knex.schema.hasColumn('res_services', 'fulfillment_options').then((exists) => {
    if (!exists) {
      return knex.schema.alterTable('res_services', function (table) {
        table.text('fulfillment_options').nullable().after('tags');
        table.text('support_channels').nullable().after('fulfillment_options');
      });
    }
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('res_services', function (table) {
    table.dropColumn('fulfillment_options');
    table.dropColumn('support_channels');
  });
};

