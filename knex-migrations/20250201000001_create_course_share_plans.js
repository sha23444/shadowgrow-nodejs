/**
 * Migration: Create course share plans table
 * Date: 2025-02-01
 * Description: Adds ability to create shareable plans for courses (gift courses, share with others, etc.)
 */

exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('res_course_share_plans');
  
  if (!hasTable) {
    await knex.schema.createTable('res_course_share_plans', function(table) {
      table.increments('share_plan_id').primary();
      table.integer('course_id').unsigned().notNullable().comment('Course ID');
      table.integer('created_by').unsigned().notNullable().comment('User who created the share plan');
      table.string('plan_name', 255).notNullable().comment('Name of the share plan');
      table.text('description').nullable().comment('Description of the share plan');
      table.enum('share_type', ['gift', 'subscription', 'limited_access', 'promo_code']).notNullable().defaultTo('gift').comment('Type of sharing');
      table.integer('max_uses').unsigned().nullable().comment('Maximum number of times this plan can be used (null = unlimited)');
      table.integer('used_count').unsigned().defaultTo(0).comment('Number of times this plan has been used');
      table.boolean('is_active').defaultTo(true).comment('Whether this share plan is active');
      table.string('share_code', 100).unique().nullable().comment('Unique share code (auto-generated if null)');
      table.string('promo_code', 50).nullable().comment('Promo code if share_type is promo_code');
      table.decimal('discount_percentage', 5, 2).nullable().comment('Discount percentage (0-100)');
      table.decimal('discount_amount', 10, 2).nullable().comment('Fixed discount amount');
      table.timestamp('expires_at').nullable().comment('Expiration date for the share plan');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('course_id', 'idx_share_plans_course');
      table.index('created_by', 'idx_share_plans_creator');
      table.index('share_code', 'idx_share_plans_code');
      table.index('share_type', 'idx_share_plans_type');
      table.index('is_active', 'idx_share_plans_active');
      table.index('expires_at', 'idx_share_plans_expires');
      
      // Foreign keys
      table.foreign('course_id', 'fk_share_plans_course')
        .references('course_id')
        .inTable('res_courses')
        .onDelete('CASCADE');
      table.foreign('created_by', 'fk_share_plans_creator')
        .references('user_id')
        .inTable('res_users')
        .onDelete('CASCADE');
    });
    
    console.log('✅ res_course_share_plans table created');
  }
  
  // Create course share plan usage tracking table
  const hasUsageTable = await knex.schema.hasTable('res_course_share_plan_usage');
  
  if (!hasUsageTable) {
    await knex.schema.createTable('res_course_share_plan_usage', function(table) {
      table.increments('usage_id').primary();
      table.integer('share_plan_id').unsigned().notNullable().comment('Share plan ID');
      table.integer('user_id').unsigned().notNullable().comment('User who used the share plan');
      table.integer('course_id').unsigned().notNullable().comment('Course ID');
      table.integer('order_id').unsigned().nullable().comment('Order ID if used via purchase');
      table.string('share_code', 100).nullable().comment('Share code used');
      table.enum('usage_type', ['gift', 'redeem', 'promo', 'direct']).notNullable().comment('How the plan was used');
      table.decimal('discount_applied', 10, 2).nullable().comment('Discount amount applied');
      table.timestamp('used_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('share_plan_id', 'idx_share_usage_plan');
      table.index('user_id', 'idx_share_usage_user');
      table.index('course_id', 'idx_share_usage_course');
      table.index('order_id', 'idx_share_usage_order');
      table.index('share_code', 'idx_share_usage_code');
      table.index('used_at', 'idx_share_usage_date');
      
      // Foreign keys
      table.foreign('share_plan_id', 'fk_share_usage_plan')
        .references('share_plan_id')
        .inTable('res_course_share_plans')
        .onDelete('CASCADE');
      table.foreign('user_id', 'fk_share_usage_user')
        .references('user_id')
        .inTable('res_users')
        .onDelete('CASCADE');
      table.foreign('course_id', 'fk_share_usage_course')
        .references('course_id')
        .inTable('res_courses')
        .onDelete('CASCADE');
      table.foreign('order_id', 'fk_share_usage_order')
        .references('order_id')
        .inTable('res_orders')
        .onDelete('SET NULL');
    });
    
    console.log('✅ res_course_share_plan_usage table created');
  }
};

exports.down = async function(knex) {
  const hasUsageTable = await knex.schema.hasTable('res_course_share_plan_usage');
  if (hasUsageTable) {
    await knex.schema.dropTable('res_course_share_plan_usage');
  }
  
  const hasTable = await knex.schema.hasTable('res_course_share_plans');
  if (hasTable) {
    await knex.schema.dropTable('res_course_share_plans');
  }
};

