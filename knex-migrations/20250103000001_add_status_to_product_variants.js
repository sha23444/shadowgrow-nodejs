/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('res_product_variants').then(function(exists) {
    if (exists) {
          return knex.schema.hasColumn('res_product_variants', 'is_active').then(function(isActiveExists) {
            if (!isActiveExists) {
              return knex.schema.alterTable('res_product_variants', function(table) {
                // Add is_active column with default value of 1 (active/published)
                table.integer('is_active').defaultTo(1).comment('Variant status: 1=active/published, 0=draft/inactive');
              });
            }
          });
    }
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.hasTable('res_product_variants').then(function(exists) {
    if (exists) {
          return knex.schema.hasColumn('res_product_variants', 'is_active').then(function(isActiveExists) {
            if (isActiveExists) {
              return knex.schema.alterTable('res_product_variants', function(table) {
                table.dropColumn('is_active');
              });
            }
          });
    }
  });
};
