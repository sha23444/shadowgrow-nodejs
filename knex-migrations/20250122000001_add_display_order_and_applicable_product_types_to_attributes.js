/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('res_product_attributes', function(table) {
    table.integer('display_order').defaultTo(0).comment('Display order for sorting attributes');
    table.json('applicable_product_types').nullable().comment('JSON array of applicable product types [1,2] where 1=Physical, 2=Digital');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('res_product_attributes', function(table) {
    table.dropColumn('display_order');
    table.dropColumn('applicable_product_types');
  });
};
