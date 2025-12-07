/**
 * Migration: Change product_type from INT to VARCHAR
 * Date: 2025-01-25
 * Description: Changes product_type column from integer to string to support 'physical', 'digital', 'service', etc.
 */

exports.up = async function(knex) {
  return knex.schema.hasTable('res_products').then(function(exists) {
    if (exists) {
      return knex.schema.hasColumn('res_products', 'product_type').then(function(columnExists) {
        if (columnExists) {
          return knex.schema.alterTable('res_products', function(table) {
            // Change product_type from INT to VARCHAR(50)
            table.string('product_type', 50).notNullable().defaultTo('physical').alter();
          });
        }
      });
    }
  });
};

exports.down = async function(knex) {
  return knex.schema.hasTable('res_products').then(function(exists) {
    if (exists) {
      return knex.schema.hasColumn('res_products', 'product_type').then(function(columnExists) {
        if (columnExists) {
          return knex.schema.alterTable('res_products', function(table) {
            // Revert back to INT
            table.integer('product_type').notNullable().defaultTo(1).alter();
          });
        }
      });
    }
  });
};

