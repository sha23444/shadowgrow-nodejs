<<<<<<< HEAD
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('res_download_packages').then(function(exists) {
    if (exists) {
      return knex.schema.alterTable('res_download_packages', function(table) {
        // Add badge column (nullable varchar)
        table.string('badge', 50).nullable().comment('Package badge text like Recommended, Best Offer, Gift Order, etc.');
        
        // Add index for better query performance
        table.index('badge', 'idx_packages_badge');
      });
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.hasTable('res_download_packages').then(function(exists) {
    if (exists) {
      return knex.schema.alterTable('res_download_packages', function(table) {
        // Drop index first
        table.dropIndex('badge', 'idx_packages_badge');
        
        // Drop column
        table.dropColumn('badge');
      });
    }
=======
exports.up = function(knex) {
  return knex.schema.table('res_packages', function(table) {
    table.string('badge', 100).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('res_packages', function(table) {
    table.dropColumn('badge');
>>>>>>> products
  });
};
