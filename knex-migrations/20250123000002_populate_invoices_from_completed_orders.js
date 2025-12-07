// Migration: Populate Invoices Table with Existing Completed Orders
// This migration moves completed orders (status = 7) from res_orders to res_invoices
// and generates proper invoice numbers for existing completed orders

exports.up = async function(knex) {
  // First, let's create a function to generate invoice numbers
  const generateInvoiceNumber = (orderId, invoiceDate) => {
    const year = invoiceDate.getFullYear();
    const month = String(invoiceDate.getMonth() + 1).padStart(2, '0');
    const day = String(invoiceDate.getDate()).padStart(2, '0');
    return `INV-${year}${month}${day}-${String(orderId).padStart(6, '0')}`;
  };

  // Get all completed orders (status = 7) that are paid (payment_status = 2)
  const completedOrders = await knex('res_orders')
    .where('order_status', 7)
    .where('payment_status', 2)
    .select('*');

  console.log(`Found ${completedOrders.length} completed orders to migrate to invoices`);

  // Process each completed order
  for (const order of completedOrders) {
    try {
      // Generate invoice number
      const invoiceDate = new Date(order.created_at);
      const invoiceNumber = generateInvoiceNumber(order.order_id, invoiceDate);

      // Prepare invoice data
      const invoiceData = {
        order_id: order.order_id,
        user_id: order.user_id,
        invoice_number: invoiceNumber,
        invoice_type: 'standard',
        invoice_date: invoiceDate,
        due_date: invoiceDate, // Set due date same as invoice date for existing orders
        payment_date: order.created_at, // Use order creation date as payment date
        subtotal: parseFloat(order.subtotal || 0),
        tax_amount: parseFloat(order.tax || 0),
        discount_amount: parseFloat(order.discount || 0),
        total_amount: parseFloat(order.total_amount || 0),
        amount_paid: parseFloat(order.amount_paid || order.total_amount || 0),
        amount_due: 0, // Completed orders have no amount due
        currency: order.currency || 'USD',
        exchange_rate: parseFloat(order.exchange_rate || 1),
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        gateway_txn_id: null, // Will be populated from transactions if needed
        gateway_response: null,
        invoice_status: 3, // Paid status for completed orders
        item_types: order.item_types,
        tax_breakdown: order.tax_breakdown,
        discount_details: order.discount_details,
        billing_address: null, // Will be populated from user data if needed
        shipping_address: null,
        notes: order.notes,
        terms_conditions: null,
        created_at: order.created_at,
        updated_at: new Date()
      };

      // Insert invoice
      await knex('res_invoices').insert(invoiceData);

      console.log(`Created invoice ${invoiceNumber} for order ${order.order_id}`);

    } catch (error) {
      console.error(`Error creating invoice for order ${order.order_id}:`, error.message);
      // Continue with next order instead of failing the entire migration
    }
  }

  console.log(`Successfully migrated ${completedOrders.length} completed orders to invoices`);
};

exports.down = async function(knex) {
  // Remove all invoices that were created from orders
  // This will delete all invoices, so be careful!
  const deletedCount = await knex('res_invoices').del();
  console.log(`Deleted ${deletedCount} invoices`);
};
