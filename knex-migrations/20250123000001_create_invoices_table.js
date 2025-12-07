// Migration: Create Invoices Table for Completed Orders
// This migration creates a separate invoices table to store completed orders
// for better performance, audit trail, and business logic separation

exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('res_invoices');
  
  if (!hasTable) {
    await knex.schema.createTable('res_invoices', function(table) {
    // Primary key
    table.increments('invoice_id').primary();
    
    // Foreign keys
    table.integer('order_id').notNullable().comment('Reference to original order');
    table.integer('user_id').notNullable().comment('Customer who placed the order');
    
    // Invoice identification
    table.string('invoice_number', 50).notNullable().unique().comment('Unique invoice number');
    table.string('invoice_type', 20).defaultTo('standard').comment('standard, proforma, credit_note');
    
    // Dates
    table.timestamp('invoice_date').defaultTo(knex.fn.now()).comment('Date invoice was created');
    table.timestamp('due_date').nullable().comment('Payment due date');
    table.timestamp('payment_date').nullable().comment('Actual payment date');
    
    // Financial information
    table.decimal('subtotal', 15, 2).notNullable().defaultTo(0).comment('Subtotal before tax and discount');
    table.decimal('tax_amount', 15, 2).notNullable().defaultTo(0).comment('Total tax amount');
    table.decimal('discount_amount', 15, 2).notNullable().defaultTo(0).comment('Total discount amount');
    table.decimal('total_amount', 15, 2).notNullable().comment('Final total amount');
    table.decimal('amount_paid', 15, 2).notNullable().defaultTo(0).comment('Amount actually paid');
    table.decimal('amount_due', 15, 2).notNullable().comment('Amount still due');
    
    // Currency and exchange
    table.string('currency', 3).notNullable().defaultTo('USD').comment('Currency code');
    table.decimal('exchange_rate', 10, 6).notNullable().defaultTo(1).comment('Exchange rate at time of invoice');
    
    // Payment information
    table.integer('payment_method').notNullable().comment('Payment method used');
    table.integer('payment_status').notNullable().defaultTo(1).comment('1=Pending, 2=Paid, 3=Failed, 4=Refunded');
    table.string('gateway_txn_id', 255).nullable().comment('Payment gateway transaction ID');
    table.text('gateway_response').nullable().comment('Payment gateway response data');
    
    // Invoice status
    table.integer('invoice_status').notNullable().defaultTo(1).comment('1=Draft, 2=Sent, 3=Paid, 4=Overdue, 5=Cancelled');
    
    // Order details
    table.text('item_types').nullable().comment('JSON array of item types in the order');
    table.text('tax_breakdown').nullable().comment('JSON object with tax breakdown details');
    table.text('discount_details').nullable().comment('JSON object with discount details');
    
    // Customer and billing information
    table.text('billing_address').nullable().comment('JSON object with billing address');
    table.text('shipping_address').nullable().comment('JSON object with shipping address');
    
    // Additional information
    table.text('notes').nullable().comment('Additional notes or comments');
    table.text('terms_conditions').nullable().comment('Terms and conditions');
    
    // Audit fields
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['order_id']);
    table.index(['user_id']);
    table.index(['invoice_number']);
    table.index(['invoice_date']);
    table.index(['payment_status']);
    table.index(['invoice_status']);
    table.index(['payment_method']);
    table.index(['created_at']);
    table.index(['due_date']);
    
    // Composite indexes
    table.index(['user_id', 'invoice_date']);
    table.index(['payment_status', 'invoice_status']);
    table.index(['invoice_date', 'payment_status']);
    
    // Note: Foreign key constraints will be added in a separate migration
    // to avoid dependency issues during initial table creation
    });
    console.log('✅ Created res_invoices table');
  } else {
    console.log('⚠️ Table res_invoices already exists');
  }
};

exports.down = function(knex) {
  return knex.schema.dropTable('res_invoices');
};
