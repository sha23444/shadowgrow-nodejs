// Migration: Fix Invoice Numbers to be Sequential
// This migration updates existing invoice numbers to use proper sequential numbering
// instead of being based on order IDs which creates gaps

exports.up = async function(knex) {
  console.log('Starting invoice number sequential fix...');

  try {
    // Get all invoices ordered by creation date
    const invoices = await knex('res_invoices')
      .select('invoice_id', 'created_at')
      .orderBy('created_at', 'asc');

    console.log(`Found ${invoices.length} invoices to update`);

    // Group invoices by year
    const invoicesByYear = {};
    invoices.forEach(invoice => {
      const year = new Date(invoice.created_at).getFullYear();
      if (!invoicesByYear[year]) {
        invoicesByYear[year] = [];
      }
      invoicesByYear[year].push(invoice);
    });

    // Update invoice numbers sequentially for each year
    for (const year in invoicesByYear) {
      const yearInvoices = invoicesByYear[year];
      console.log(`Processing ${yearInvoices.length} invoices for year ${year}`);

      for (let i = 0; i < yearInvoices.length; i++) {
        const invoice = yearInvoices[i];
        const sequentialNumber = String(i + 1).padStart(6, '0');
        const newInvoiceNumber = `INV-${year}-${sequentialNumber}`;

        await knex('res_invoices')
          .where('invoice_id', invoice.invoice_id)
          .update({ invoice_number: newInvoiceNumber });

        console.log(`Updated invoice ${invoice.invoice_id} to ${newInvoiceNumber}`);
      }
    }

    console.log('Invoice number sequential fix completed successfully');

  } catch (error) {
    console.error('Error fixing invoice numbers:', error.message);
    throw error;
  }
};

exports.down = async function(knex) {
  console.log('Reverting invoice number changes...');
  
  // This is a data migration, so we can't easily revert
  // The original invoice numbers were based on order IDs
  // We'll leave the sequential numbers as they are more logical
  console.log('Note: Invoice numbers will remain sequential (cannot revert to original order-based numbers)');
};
