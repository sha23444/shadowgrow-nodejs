/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('res_product_fields').then(function(exists) {
    if (exists) {
      return knex.schema.hasColumn('res_product_fields', 'field_type').then(function(fieldTypeExists) {
        if (fieldTypeExists) {
          return knex.schema.alterTable('res_product_fields', function(table) {
            // Increase field_type column size to handle longer field types
            table.string('field_type', 50).alter();
          });
        }
      });
    }
  }).then(function() {
    return knex.schema.hasTable('res_product_variants').then(function(exists) {
      if (exists) {
        return knex.schema.hasColumn('res_product_variants', 'weight').then(function(weightExists) {
          if (weightExists) {
            return knex.schema.alterTable('res_product_variants', function(table) {
              // Increase weight column size
              table.string('weight', 50).alter();
            });
          }
        });
      }
    });
  }).then(function() {
    return knex.schema.hasTable('res_product_variants').then(function(exists) {
      if (exists) {
        return knex.schema.hasColumn('res_product_variants', 'dimensions').then(function(dimensionsExists) {
          if (dimensionsExists) {
            return knex.schema.alterTable('res_product_variants', function(table) {
              // Increase dimensions column size
              table.string('dimensions', 100).alter();
            });
          }
        });
      }
    });
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('res_product_fields', function(table) {
    table.string('field_type', 20).alter();
  }).then(function() {
    return knex.schema.alterTable('res_product_variants', function(table) {
      table.string('weight', 20).alter();
      table.string('dimensions', 50).alter();
    });
  });
};
