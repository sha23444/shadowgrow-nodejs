const { pool } = require("../../config/database");
const PDFInvoiceService = require("../../services/PDFInvoiceService");

/**
 * Get all invoices with filtering and pagination
 * Supports filtering by payment status, invoice status, date range, and search
 */
async function getAllInvoices(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";

  const invoiceStatus = req.query['invoice-status'];
  const paymentStatus = req.query['payment-status'];
  const paymentMethod = req.query['payment-method'];
  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

  // Initialize filters
  const whereClauses = [];
  const queryParams = [];

  // Comprehensive search across multiple fields
  if (search) {
    whereClauses.push(`(
      i.invoice_number LIKE ? OR 
      i.order_id LIKE ? OR
      u.username LIKE ? OR 
      u.email LIKE ? OR 
      u.phone LIKE ? OR 
      u.first_name LIKE ? OR 
      u.last_name LIKE ? OR
      CONCAT(u.first_name, ' ', u.last_name) LIKE ?
    )`);
    const searchParam = `%${search}%`;
    queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
  }

  if (invoiceStatus) {
    whereClauses.push('i.invoice_status = ?');
    queryParams.push(invoiceStatus);
  }

  if (paymentStatus) {
    whereClauses.push('i.payment_status = ?');
    queryParams.push(paymentStatus);
  }

  if (paymentMethod) {
    whereClauses.push('i.payment_method = ?');
    queryParams.push(paymentMethod);
  }

  if (startDate) {
    whereClauses.push('i.invoice_date >= ?');
    queryParams.push(startDate);
  }

  if (endDate) {
    whereClauses.push('i.invoice_date <= ?');
    queryParams.push(endDate);
  }
  
  const whereSQL = whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';

  try {
    // Count query
    const totalQuery = `
      SELECT COUNT(*) as total 
      FROM res_invoices AS i 
      LEFT JOIN res_users AS u ON i.user_id = u.user_id
      WHERE ${whereSQL}
    `;
    const [[{ total }]] = await pool.execute(totalQuery, queryParams);

    // Invoices query
    const invoicesQuery = `
      SELECT 
        i.*, 
        u.user_id, 
        u.username, 
        u.email, 
        u.phone, 
        u.first_name,
        u.last_name,
        o.order_status,
        o.created_at as order_created_at
      FROM res_invoices AS i
      LEFT JOIN res_users AS u ON i.user_id = u.user_id
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
      user_id: invoice.user_id,
      username: invoice.username,
      email: invoice.email,
      first_name: invoice.first_name,
      last_name: invoice.last_name,
      phone: invoice.phone,
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
 * Get invoice details by invoice ID
 */
async function getInvoiceDetails(req, res) {
  const { invoice_id } = req.params;

  try {
    // Fetch invoice details with user details
    const [[invoice]] = await pool.execute(
      `
        SELECT 
          i.*,
          u.user_id,
          u.username,
          u.email,
          u.phone,
          u.first_name,
          u.last_name,
          o.order_status,
          o.created_at as order_created_at
        FROM res_invoices AS i
        LEFT JOIN res_users AS u ON i.user_id = u.user_id
        LEFT JOIN res_orders AS o ON i.order_id = o.order_id
        WHERE i.invoice_id = ?
      `,
      [invoice_id]
    );

    // Check if invoice exists
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
      gateway_txn_id: invoice.gateway_txn_id,
      gateway_response: invoice.gateway_response,
      item_types: itemTypes,
      tax_breakdown: taxBreakdown,
      discount_details: discountDetails,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      notes: invoice.notes,
      terms_conditions: invoice.terms_conditions,
      user_id: invoice.user_id,
      username: invoice.username,
      email: invoice.email,
      phone: invoice.phone,
      first_name: invoice.first_name,
      last_name: invoice.last_name,
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
          WHERE uf.order_id = ?
        `,
        [invoice.order_id]
      );
      if (files.length) invoiceDetails.files.push(...files);
    }

    if (itemTypes.includes(2)) {
      // Packages
      const [packages] = await pool.execute(
        `SELECT * FROM res_upackages WHERE order_id = ?`,
        [invoice.order_id]
      );
      if (packages.length) invoiceDetails.packages.push(...packages);
    }

    if (itemTypes.includes(3)) {
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
          WHERE up.order_id = ?
        `,
        [invoice.order_id]
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
          WHERE up.order_id = ?
        `,
        [invoice.order_id]
      );
      if (courses.length) invoiceDetails.courses.push(...courses);
    }

    if (itemTypes.includes(5)) {
      // Wallet Topups
      const [topups] = await pool.execute(
        `
          SELECT amount, created_at 
          FROM res_uwallet_recharge 
          WHERE order_id = ?
        `,
        [invoice.order_id]
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
 * Update invoice status (for admin use)
 */
async function updateInvoiceStatus(req, res) {
  const { invoice_id } = req.params;
  const { invoice_status, notes } = req.body;

  if (!invoice_status) {
    return res.status(400).json({
      status: "error",
      message: "Invoice status is required",
    });
  }

  try {
    // Check if invoice exists
    const [[invoice]] = await pool.execute(
      "SELECT * FROM res_invoices WHERE invoice_id = ?",
      [invoice_id]
    );

    if (!invoice) {
      return res.status(404).json({
        status: "error",
        message: "Invoice not found",
      });
    }

    // Update invoice status
    await pool.execute(
      `UPDATE res_invoices 
       SET invoice_status = ?, notes = ?, updated_at = NOW() 
       WHERE invoice_id = ?`,
      [invoice_status, notes || invoice.notes, invoice_id]
    );

    return res.status(200).json({
      status: "success",
      message: "Invoice status updated successfully",
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
 * Get invoice statistics for dashboard
 */
async function getInvoiceStatistics(req, res) {
  try {
    const [
      [
        {
          total_invoices,
          total_amount,
          paid_invoices,
          paid_amount,
          pending_invoices,
          pending_amount,
          overdue_invoices,
          overdue_amount
        }
      ]
    ] = await pool.execute(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COUNT(CASE WHEN payment_status = 2 THEN 1 END) as paid_invoices,
        COALESCE(SUM(CASE WHEN payment_status = 2 THEN total_amount END), 0) as paid_amount,
        COUNT(CASE WHEN payment_status = 1 THEN 1 END) as pending_invoices,
        COALESCE(SUM(CASE WHEN payment_status = 1 THEN total_amount END), 0) as pending_amount,
        COUNT(CASE WHEN invoice_status = 4 THEN 1 END) as overdue_invoices,
        COALESCE(SUM(CASE WHEN invoice_status = 4 THEN amount_due END), 0) as overdue_amount
      FROM res_invoices
    `);

    // Get monthly statistics for the last 12 months
    const [monthlyStats] = await pool.execute(`
      SELECT 
        DATE_FORMAT(invoice_date, '%Y-%m') as month,
        COUNT(*) as invoice_count,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN payment_status = 2 THEN total_amount END), 0) as paid_amount
      FROM res_invoices 
      WHERE invoice_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(invoice_date, '%Y-%m')
      ORDER BY month DESC
    `);

    return res.status(200).json({
      status: "success",
      response: {
        summary: {
          total_invoices: parseInt(total_invoices),
          total_amount: parseFloat(total_amount),
          paid_invoices: parseInt(paid_invoices),
          paid_amount: parseFloat(paid_amount),
          pending_invoices: parseInt(pending_invoices),
          pending_amount: parseFloat(pending_amount),
          overdue_invoices: parseInt(overdue_invoices),
          overdue_amount: parseFloat(overdue_amount)
        },
        monthly_stats: monthlyStats.map(stat => ({
          month: stat.month,
          invoice_count: parseInt(stat.invoice_count),
          total_amount: parseFloat(stat.total_amount),
          paid_amount: parseFloat(stat.paid_amount)
        }))
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
 * Generate PDF invoice
 */
async function generateInvoicePDF(req, res) {
  const { invoice_id } = req.params;
  const { format = 'A4', download = false } = req.query;

  try {
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
 * Get PDF invoice file
 */
async function getInvoicePDF(req, res) {
  const { invoice_id } = req.params;

  try {
    const pdfService = new PDFInvoiceService();
    
    // First get invoice data to get the invoice number
    const [[invoice]] = await pool.execute(
      "SELECT invoice_number FROM res_invoices WHERE invoice_id = ?",
      [invoice_id]
    );

    if (!invoice) {
      return res.status(404).json({
        status: "error",
        message: "Invoice not found",
      });
    }

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

module.exports = {
  getAllInvoices,
  getInvoiceDetails,
  updateInvoiceStatus,
  getInvoiceStatistics,
  generateInvoicePDF,
  getInvoicePDF,
};
