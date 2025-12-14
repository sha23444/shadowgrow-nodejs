const { pool } = require("../../config/database");
const PDFInvoiceService = require("../../services/PDFInvoiceService");

/**
 * Get all invoices for the authenticated user
 */
async function getAllUserInvoices(req, res) {
  const { id } = req.user; // User ID from authentication
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  const invoiceStatus = req.query['invoice-status'];
  const paymentStatus = req.query['payment-status'];
  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

  // Initialize filters
  const whereClauses = ['i.user_id = ?'];
  const queryParams = [id];

  if (invoiceStatus) {
    whereClauses.push('i.invoice_status = ?');
    queryParams.push(invoiceStatus);
  }

  if (paymentStatus) {
    whereClauses.push('i.payment_status = ?');
    queryParams.push(paymentStatus);
  }

  if (startDate) {
    whereClauses.push('i.invoice_date >= ?');
    queryParams.push(startDate);
  }

  if (endDate) {
    whereClauses.push('i.invoice_date <= ?');
    queryParams.push(endDate);
  }
  
  const whereSQL = whereClauses.join(' AND ');

  try {
    // Count query
    const totalQuery = `
      SELECT COUNT(*) as total 
      FROM res_invoices AS i 
      WHERE ${whereSQL}
    `;
    const [[{ total }]] = await pool.execute(totalQuery, queryParams);

    // Invoices query
    const invoicesQuery = `
      SELECT 
        i.*,
        o.order_status,
        o.created_at as order_created_at
      FROM res_invoices AS i
      LEFT JOIN res_orders AS o ON i.order_id = o.order_id
      WHERE ${whereSQL}
      ORDER BY i.invoice_date DESC, i.invoice_id DESC
      LIMIT ? OFFSET ?
    `;
    const invoicesParams = [...queryParams, limit, offset];
    const [invoices] = await pool.execute(invoicesQuery, invoicesParams);

    // Process invoices data
    const processedInvoices = invoices.map((invoice) => ({
      invoice_id: invoice.invoice_id,
      order_id: invoice.order_id,
      invoice_number: invoice.invoice_number,
      invoice_type: invoice.invoice_type,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      payment_date: invoice.payment_date,
      subtotal: invoice.subtotal,
      tax_amount: invoice.tax_amount,
      discount_amount: invoice.discount_amount,
      total_amount: invoice.total_amount,
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      exchange_rate: invoice.exchange_rate,
      payment_method: invoice.payment_method,
      payment_status: invoice.payment_status,
      invoice_status: invoice.invoice_status,
      item_types: JSON.parse(invoice.item_types || "[]"),
      order_status: invoice.order_status,
      order_created_at: invoice.order_created_at,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at
    }));

    return res.status(200).json({
      status: "success",
      response: {
        data: processedInvoices,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

/**
 * Get invoice details for the authenticated user
 */
async function getUserInvoiceDetails(req, res) {
  const { id } = req.user; // User ID from authentication
  const { invoice_id } = req.params;

  try {
    // Fetch invoice details (only for the authenticated user)
    const [[invoice]] = await pool.execute(
      `
        SELECT 
          i.*,
          o.order_status,
          o.created_at as order_created_at
        FROM res_invoices AS i
        LEFT JOIN res_orders AS o ON i.order_id = o.order_id
        WHERE i.invoice_id = ? AND i.user_id = ?
      `,
      [invoice_id, id]
    );

    // Check if invoice exists and belongs to user
    if (!invoice) {
      return res.status(404).json({
        status: "error",
        message: "Invoice not found",
      });
    }

    // Parse JSON fields
    let itemTypes = [];
    let taxBreakdown = null;
    let discountDetails = null;
    let billingAddress = null;
    let shippingAddress = null;

    try {
      itemTypes = JSON.parse(invoice.item_types || "[]");
      taxBreakdown = invoice.tax_breakdown ? JSON.parse(invoice.tax_breakdown) : null;
      discountDetails = invoice.discount_details ? JSON.parse(invoice.discount_details) : null;
      billingAddress = invoice.billing_address ? JSON.parse(invoice.billing_address) : null;
      shippingAddress = invoice.shipping_address ? JSON.parse(invoice.shipping_address) : null;
    } catch (error) {
      console.error("Error parsing JSON fields:", error);
    }

    // Initialize response structure
    const invoiceDetails = {
      invoice_id: invoice.invoice_id,
      order_id: invoice.order_id,
      invoice_number: invoice.invoice_number,
      invoice_type: invoice.invoice_type,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      payment_date: invoice.payment_date,
      subtotal: invoice.subtotal,
      tax_amount: invoice.tax_amount,
      discount_amount: invoice.discount_amount,
      total_amount: invoice.total_amount,
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      currency: invoice.currency,
      exchange_rate: invoice.exchange_rate,
      payment_method: invoice.payment_method,
      payment_status: invoice.payment_status,
      invoice_status: invoice.invoice_status,
      item_types: itemTypes,
      tax_breakdown: taxBreakdown,
      discount_details: discountDetails,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      notes: invoice.notes,
      terms_conditions: invoice.terms_conditions,
      order_status: invoice.order_status,
      order_created_at: invoice.order_created_at,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
      // Initialize arrays for order items
      products: [],
      files: [],
      courses: [],
      packages: [],
      topups: [],
    };

    // Fetch order items based on item_types
    if (itemTypes.includes(1)) {
      // Digital Files
      const [files] = await pool.execute(
        `
          SELECT 
            rf.file_id,
            rf.folder_id,
            rf.title,
            rf.thumbnail,
            rf.size,
            uf.price,
            rf.slug,
            uf.ufile_id,
            uf.user_id,
            uf.order_id
          FROM res_files rf
          JOIN res_ufiles uf ON rf.file_id = uf.file_id
          WHERE uf.order_id = ? AND uf.user_id = ?
        `,
        [invoice.order_id, id]
      );
      if (files.length) invoiceDetails.files.push(...files);
    }

    if (itemTypes.includes(2)) {
      // Packages
      const [packages] = await pool.execute(
        `SELECT * FROM res_upackages WHERE order_id = ? AND user_id = ?`,
        [invoice.order_id, id]
      );
      if (packages.length) invoiceDetails.packages.push(...packages);
    }

    // Fetch products if applicable (both digital type 3 and physical type 6)
    if (itemTypes.includes(3) || itemTypes.includes(6)) {
      // Products
      const [products] = await pool.execute(
        `
          SELECT 
            up.product_id,
            up.quantity,
            up.meta,
            rp.product_name,
            rp.sale_price,
            rp.slug,
            m.file_name AS image
          FROM res_uproducts AS up
          INNER JOIN res_products AS rp ON up.product_id = rp.product_id
          LEFT JOIN res_product_media AS m ON rp.product_id = m.product_id AND m.is_cover = 1
          WHERE up.order_id = ? AND up.user_id = ?
        `,
        [invoice.order_id, id]
      );
      if (products.length) invoiceDetails.products.push(...products);
    }

    if (itemTypes.includes(4)) {
      // Courses
      const [courses] = await pool.execute(
        `
          SELECT 
            up.course_id, 
            up.meta,
            rp.title, 
            rp.sale_price, 
            rp.slug,
            m.file_name AS image
          FROM res_ucourses AS up
          INNER JOIN res_courses AS rp ON up.course_id = rp.course_id
          LEFT JOIN res_course_media AS m ON rp.course_id = m.course_id AND m.is_cover = 1
          WHERE up.order_id = ? AND up.user_id = ?
        `,
        [invoice.order_id, id]
      );
      if (courses.length) invoiceDetails.courses.push(...courses);
    }

    if (itemTypes.includes(5)) {
      // Wallet Topups
      const [topups] = await pool.execute(
        `
          SELECT amount, created_at 
          FROM res_uwallet_recharge 
          WHERE order_id = ? AND user_id = ?
        `,
        [invoice.order_id, id]
      );
      if (topups.length) invoiceDetails.topups.push(...topups);
    }

    return res.status(200).json({
      status: "success",
      response: invoiceDetails,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

/**
 * Get user invoice statistics
 */
async function getUserInvoiceStatistics(req, res) {
  const { id } = req.user; // User ID from authentication

  try {
    const [
      [
        {
          total_invoices,
          total_amount,
          paid_invoices,
          paid_amount,
          pending_invoices,
          pending_amount
        }
      ]
    ] = await pool.execute(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COUNT(CASE WHEN payment_status = 2 THEN 1 END) as paid_invoices,
        COALESCE(SUM(CASE WHEN payment_status = 2 THEN total_amount END), 0) as paid_amount,
        COUNT(CASE WHEN payment_status = 1 THEN 1 END) as pending_invoices,
        COALESCE(SUM(CASE WHEN payment_status = 1 THEN total_amount END), 0) as pending_amount
      FROM res_invoices
      WHERE user_id = ?
    `, [id]);

    return res.status(200).json({
      status: "success",
      response: {
        total_invoices: parseInt(total_invoices),
        total_amount: parseFloat(total_amount),
        paid_invoices: parseInt(paid_invoices),
        paid_amount: parseFloat(paid_amount),
        pending_invoices: parseInt(pending_invoices),
        pending_amount: parseFloat(pending_amount)
      }
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

/**
 * Generate PDF invoice for user
 */
async function generateUserInvoicePDF(req, res) {
  const { id } = req.user; // User ID from authentication
  const { invoice_id } = req.params;
  const { format = 'A4', download = false } = req.query;

  try {
    // Verify invoice belongs to user
    const [[invoice]] = await pool.execute(
      "SELECT invoice_id FROM res_invoices WHERE invoice_id = ? AND user_id = ?",
      [invoice_id, id]
    );

    if (!invoice) {
      return res.status(404).json({
        status: "error",
        message: "Invoice not found",
      });
    }

    const pdfService = new PDFInvoiceService();
    const result = await pdfService.generatePDF(invoice_id, { format });

    if (download === 'true') {
      // Return PDF file for download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      res.setHeader('Content-Length', result.fileSize);
      
      const fs = require('fs');
      const fileStream = fs.createReadStream(result.filePath);
      fileStream.pipe(res);
    } else {
      // Return PDF info
      return res.status(200).json({
        status: "success",
        response: result,
      });
    }
  } catch (error) {
    console.error("Error generating PDF invoice:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to generate PDF invoice",
    });
  }
}

/**
 * Get PDF invoice file for user
 */
async function getUserInvoicePDF(req, res) {
  const { id } = req.user; // User ID from authentication
  const { invoice_id } = req.params;

  try {
    // Verify invoice belongs to user
    const [[invoice]] = await pool.execute(
      "SELECT invoice_number FROM res_invoices WHERE invoice_id = ? AND user_id = ?",
      [invoice_id, id]
    );

    if (!invoice) {
      return res.status(404).json({
        status: "error",
        message: "Invoice not found",
      });
    }

    const pdfService = new PDFInvoiceService();
    const fileName = `invoice-${invoice.invoice_number}.pdf`;
    let fileInfo = pdfService.getPDFInfo(fileName);

    if (!fileInfo) {
      // Generate PDF if it doesn't exist
      const result = await pdfService.generatePDF(invoice_id);
      fileInfo = pdfService.getPDFInfo(result.fileName);
    }

    // Return PDF file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileInfo.fileName}"`);
    res.setHeader('Content-Length', fileInfo.fileSize);
    
    const fs = require('fs');
    const fileStream = fs.createReadStream(fileInfo.filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error getting PDF invoice:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to get PDF invoice",
    });
  }
}

/**
 * Generate invoice PDF from order_id (creates invoice if it doesn't exist)
 */
async function generateInvoiceFromOrderId(req, res) {
  const { id } = req.user; // User ID from authentication
  const { order_id } = req.params;

  try {
    // Verify order belongs to user and is completed
    const [[order]] = await pool.execute(
      "SELECT * FROM res_orders WHERE order_id = ? AND user_id = ?",
      [order_id, id]
    );

    if (!order) {
      return res.status(404).json({
        status: "error",
        message: "Order not found",
      });
    }

    // Only create invoice for completed orders (status = 7)
    if (order.order_status !== 7) {
      return res.status(400).json({
        status: "error",
        message: `Invoice can only be generated for completed orders. Order status: ${order.order_status}`,
      });
    }

    // Check if invoice already exists first
    const [[existingInvoice]] = await pool.execute(
      "SELECT invoice_id FROM res_invoices WHERE order_id = ? AND user_id = ?",
      [order_id, id]
    );

    if (existingInvoice) {
      console.log(`Invoice ${existingInvoice.invoice_id} already exists for order ${order_id}`);
      // Use existing invoice
      const pdfService = new PDFInvoiceService();
      const result = await pdfService.generatePDF(existingInvoice.invoice_id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      res.setHeader('Content-Length', result.fileSize);
      
      const fs = require('fs');
      const fileStream = fs.createReadStream(result.filePath);
      fileStream.pipe(res);
      return;
    }

    // Invoice doesn't exist, try to create it
    const InvoiceService = require("../../services/InvoiceService");
    let invoiceId = null;
    let invoiceCreationError = null;
    
    try {
      console.log(`Attempting to create invoice for order ${order_id}...`);
      invoiceId = await InvoiceService.createInvoiceIfNeeded(order_id);
      console.log(`Invoice creation result for order ${order_id}:`, invoiceId ? `Created invoice ${invoiceId}` : 'Invoice already exists or not needed');
    } catch (invoiceError) {
      console.error(`Error creating invoice for order ${order_id}:`, invoiceError);
      console.error('Error stack:', invoiceError.stack);
      invoiceCreationError = invoiceError;
    }

    // Get invoice_id (either newly created or existing)
    const [[invoice]] = await pool.execute(
      "SELECT invoice_id FROM res_invoices WHERE order_id = ? AND user_id = ?",
      [order_id, id]
    );

    if (!invoice) {
      const errorMessage = invoiceCreationError 
        ? `Failed to create invoice: ${invoiceCreationError.message}` 
        : "Failed to create or find invoice for this order";
      
      console.error(`No invoice found for order ${order_id} after creation attempt.`);
      if (invoiceCreationError) {
        console.error('Creation error details:', invoiceCreationError.message);
        console.error('Creation error stack:', invoiceCreationError.stack);
      }
      
      // Return detailed error in development, generic in production
      const errorResponse = {
        status: "error",
        message: errorMessage
      };
      
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        errorResponse.details = invoiceCreationError ? invoiceCreationError.message : 'Unknown error';
        if (invoiceCreationError && invoiceCreationError.stack) {
          errorResponse.stack = invoiceCreationError.stack;
        }
      }
      
      return res.status(500).json(errorResponse);
    }

    // Generate PDF
    const pdfService = new PDFInvoiceService();
    const result = await pdfService.generatePDF(invoice.invoice_id);

    // Return PDF file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Content-Length', result.fileSize);
    
    const fs = require('fs');
    const fileStream = fs.createReadStream(result.filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error generating invoice from order:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to generate invoice",
    });
  }
}

module.exports = {
  getAllUserInvoices,
  getUserInvoiceDetails,
  getUserInvoiceStatistics,
  generateUserInvoicePDF,
  getUserInvoicePDF,
  generateInvoiceFromOrderId,
};
