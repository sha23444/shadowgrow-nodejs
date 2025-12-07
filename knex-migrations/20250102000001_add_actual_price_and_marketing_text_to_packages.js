<<<<<<< HEAD
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.hasTable('res_download_packages').then(function(exists) {
    if (exists) {
      return knex.schema.alterTable('res_download_packages', function(table) {
        // Add actual_price column (nullable decimal)
        table.decimal('actual_price', 10, 2).nullable().comment('Original price before discounts or promotions');
        
        // Add marketing_text column (nullable text)
        table.text('marketing_text').nullable().comment('Marketing message for promotions and special offers');
        
        // Add indexes for better query performance
        table.index('actual_price', 'idx_packages_actual_price');
        table.index('marketing_text', 'idx_packages_marketing_text');
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
        // Drop indexes first
        table.dropIndex('actual_price', 'idx_packages_actual_price');
        table.dropIndex('marketing_text', 'idx_packages_marketing_text');
        
        // Drop columns
        table.dropColumn('actual_price');
        table.dropColumn('marketing_text');
      });
    }
=======
exports.up = async function(knex) {
  // Check if table exists and columns don't exist
  const hasTable = await knex.schema.hasTable('res_packages');
  const hasActualPrice = hasTable ? await knex.schema.hasColumn('res_packages', 'actual_price') : false;
  const hasMarketingText = hasTable ? await knex.schema.hasColumn('res_packages', 'marketing_text') : false;
  
  if (hasTable && (!hasActualPrice || !hasMarketingText)) {
    return knex.schema.table('res_packages', function(table) {
      if (!hasActualPrice) {
        table.decimal('actual_price', 10, 2).nullable();
      }
      if (!hasMarketingText) {
        table.text('marketing_text').nullable();
      }
    });
  } else {
    console.log('res_packages columns already exist or table does not exist, skipping...');
  }
};

exports.down = function(knex) {
  return knex.schema.table('res_packages', function(table) {
    table.dropColumn('actual_price');
    table.dropColumn('marketing_text');
>>>>>>> products
  });
};
