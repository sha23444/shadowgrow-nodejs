// Migration: Enhanced Categories Architecture for Infinite Levels
// This migration adds support for infinite category levels using Nested Set Model

exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('res_product_categories', 'lft');
  
  if (!hasColumn) {
    await knex.schema.alterTable('res_product_categories', function(table) {
      // Add Nested Set Model fields for infinite levels
      table.integer('lft').nullable().comment('Left boundary for nested set');
      table.integer('rgt').nullable().comment('Right boundary for nested set');
      table.integer('depth').defaultTo(0).comment('Depth level (0 = root)');
      table.string('path', 1000).nullable().comment('Full path from root');
      table.string('path_slug', 1000).nullable().comment('Full slug path from root');
      
      // Add indexes for performance
      table.index(['lft', 'rgt']);
      table.index(['depth']);
      table.index(['path']);
      table.index(['path_slug']);
      
      // Add sort order within same level
      table.integer('sort_order').defaultTo(0).comment('Sort order within same level');
      table.index(['parent_category_id', 'sort_order']);
    });
    console.log('✅ Enhanced categories with infinite levels support');
  } else {
    console.log('⚠️ Category enhancements already applied');
  }
};

exports.down = function(knex) {
  return knex.schema.alterTable('res_product_categories', function(table) {
    table.dropIndex(['lft', 'rgt']);
    table.dropIndex(['depth']);
    table.dropIndex(['path']);
    table.dropIndex(['path_slug']);
    table.dropIndex(['parent_category_id', 'sort_order']);
    
    table.dropColumn('lft');
    table.dropColumn('rgt');
    table.dropColumn('depth');
    table.dropColumn('path');
    table.dropColumn('path_slug');
    table.dropColumn('sort_order');
  });
};
