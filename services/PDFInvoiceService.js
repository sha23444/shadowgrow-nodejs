const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

/**
 * PDF Invoice Service
 * Generates PDF invoices using PDFKit (lightweight, no Chrome dependency)
 */
class PDFInvoiceService {
  constructor() {
    this.outputDir = path.join(__dirname, '../public/invoices');
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate PDF invoice
   * @param {number} invoiceId - Invoice ID
   * @param {Object} options - PDF generation options
   * @returns {Promise<Object>} - PDF file info
   */
  async generatePDF(invoiceId, options = {}) {
    const {
      format = 'A4',
      margin = 72 // Default margin in points (1 inch = 72 points)
    } = options;

    try {
      // Get invoice data
      const invoiceData = await this.getInvoiceData(invoiceId);
      if (!invoiceData) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      // Generate PDF
      const fileName = `invoice-${invoiceData.invoice_number}.pdf`;
      const filePath = path.join(this.outputDir, fileName);
      const pdfBuffer = await this.generatePDFFromData(invoiceData, filePath, {
        format,
        margin
      });

      return {
        success: true,
        fileName,
        filePath,
        fileSize: pdfBuffer.length,
        invoiceNumber: invoiceData.invoice_number,
        downloadUrl: `/invoices/${fileName}`
      };

    } catch (error) {
      console.error('Error generating PDF invoice:', error);
      throw error;
    }
  }

  /**
   * Get invoice data with all related information
   * @param {number} invoiceId - Invoice ID
   * @returns {Promise<Object>} - Invoice data
   */
  async getInvoiceData(invoiceId) {
    try {
      // Get invoice details
      const [[invoice]] = await pool.execute(`
        SELECT 
          i.*,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          o.created_at as order_created_at
        FROM res_invoices i
        LEFT JOIN res_users u ON i.user_id = u.user_id
        LEFT JOIN res_orders o ON i.order_id = o.order_id
        WHERE i.invoice_id = ?
      `, [invoiceId]);

      if (!invoice) return null;

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
        console.error('Error parsing JSON fields:', error);
      }

      // Get order items
      const items = await this.getOrderItems(invoice.order_id, itemTypes);

      // Get site information
      const [siteInfo] = await pool.execute(`
        SELECT option_name, option_value 
        FROM res_options 
        WHERE option_name IN ('site_name', 'site_email', 'site_phone', 'site_address', 'currency')
      `);

      const siteData = {};
      if (siteInfo && siteInfo.length > 0) {
        siteInfo.forEach(row => {
          siteData[row.option_name] = row.option_value;
        });
      }

      let currencyCode = (invoice.currency || siteData.currency || 'USD').toUpperCase();
      let currencyFormatter;
      try {
        currencyFormatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      } catch (err) {
        currencyCode = 'USD';
        currencyFormatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }

      const formatCurrency = value =>
        currencyFormatter.format(Number(value ?? 0));

      const exchangeRate = Number(invoice.exchange_rate || 1) || 1;
      const baseCurrencyCode = (siteData.currency || currencyCode).toUpperCase();
      const shouldConvertToInvoiceCurrency =
        currencyCode !== baseCurrencyCode && exchangeRate > 0 && exchangeRate !== 1;

      const convertAmountToInvoiceCurrency = value => {
        const numericValue = Number(value ?? 0);
        if (!Number.isFinite(numericValue)) {
          return 0;
        }
        if (!shouldConvertToInvoiceCurrency) {
          return numericValue;
        }
        return numericValue / exchangeRate;
      };

      const currencySymbol =
        formatCurrency(0)
          .replace(/[-0-9.,\s]/g, '')
          .trim() || currencyCode;

      const formattedItems = items.map(item => {
        const unitPriceValue = convertAmountToInvoiceCurrency(item.unit_price);
        const totalPriceValue = convertAmountToInvoiceCurrency(item.total_price);

        return {
          ...item,
          unit_price_value: unitPriceValue,
          total_price_value: totalPriceValue,
          unit_price_formatted: formatCurrency(unitPriceValue),
          total_price_formatted: formatCurrency(totalPriceValue),
        };
      });

      const subtotalValue = convertAmountToInvoiceCurrency(invoice.subtotal);
      const taxAmountValue = convertAmountToInvoiceCurrency(invoice.tax_amount);
      const discountAmountValue = convertAmountToInvoiceCurrency(invoice.discount_amount);
      const totalAmountValue = convertAmountToInvoiceCurrency(invoice.total_amount);
      const amountPaidValue = convertAmountToInvoiceCurrency(invoice.amount_paid);
      const amountDueValue = convertAmountToInvoiceCurrency(invoice.amount_due);

      return {
        ...invoice,
        item_types: itemTypes,
        tax_breakdown: taxBreakdown,
        discount_details: discountDetails,
        billing_address: billingAddress,
        shipping_address: shippingAddress,
        items: formattedItems,
        site: siteData,
        currency_code: currencyCode,
        currency_symbol: currencySymbol,
        base_currency_code: baseCurrencyCode,
        subtotal_value: subtotalValue,
        tax_amount_value: taxAmountValue,
        discount_amount_value: discountAmountValue,
        total_amount_value: totalAmountValue,
        amount_paid_value: amountPaidValue,
        amount_due_value: amountDueValue,
        // Format dates
        invoice_date_formatted: new Date(invoice.invoice_date).toLocaleDateString(),
        due_date_formatted: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : null,
        payment_date_formatted: invoice.payment_date ? new Date(invoice.payment_date).toLocaleDateString() : null,
        order_date_formatted: invoice.order_created_at ? new Date(invoice.order_created_at).toLocaleDateString() : null,
        // Format amounts
        subtotal_formatted: formatCurrency(subtotalValue),
        tax_amount_formatted: formatCurrency(taxAmountValue),
        discount_amount_formatted: formatCurrency(discountAmountValue),
        total_amount_formatted: formatCurrency(totalAmountValue),
        amount_paid_formatted: formatCurrency(amountPaidValue),
        amount_due_formatted: formatCurrency(amountDueValue),
      };

    } catch (error) {
      console.error('Error getting invoice data:', error);
      throw error;
    }
  }

  /**
   * Get order items for invoice
   * @param {number} orderId - Order ID
   * @param {Array} itemTypes - Item types array
   * @returns {Promise<Array>} - Order items
   */
  async getOrderItems(orderId, itemTypes) {
    const items = [];

    try {
      // Get products
      if (itemTypes.includes(3)) {
        const [products] = await pool.execute(
          `
          SELECT 
            'Product' AS type,
            rp.product_name AS name,
            up.quantity,
            COALESCE(rp.sale_price, rp.price, 0) AS unit_price,
            up.quantity * COALESCE(rp.sale_price, rp.price, 0) AS total_price,
            rp.slug
          FROM res_uproducts up
          INNER JOIN res_products rp ON up.product_id = rp.product_id
          WHERE up.order_id = ?
        `,
          [orderId],
        );
        items.push(...products);
      }

      // Get files
      if (itemTypes.includes(1)) {
        const [files] = await pool.execute(
          `
          SELECT 
            'File' AS type,
            rf.title AS name,
            1 AS quantity,
            COALESCE(uf.price, rf.price, 0) AS unit_price,
            COALESCE(uf.price, rf.price, 0) AS total_price,
            rf.slug
          FROM res_ufiles uf
          INNER JOIN res_files rf ON uf.file_id = rf.file_id
          WHERE uf.order_id = ?
        `,
          [orderId],
        );
        items.push(...files);
      }

      // Get packages
      if (itemTypes.includes(2)) {
        const [packages] = await pool.execute(
          `
          SELECT 
            'Package' AS type,
            COALESCE(
              up.package_title,
              JSON_UNQUOTE(JSON_EXTRACT(up.package_object, '$.title')),
              JSON_UNQUOTE(JSON_EXTRACT(up.package_object, '$.name')),
              dp.title,
              CONCAT('Package #', up.package_id)
            ) AS name,
            1 AS quantity,
            COALESCE(
              CAST(JSON_UNQUOTE(JSON_EXTRACT(up.package_object, '$.price')) AS DECIMAL(12,2)),
              dp.price,
              0
            ) AS unit_price,
            COALESCE(
              CAST(JSON_UNQUOTE(JSON_EXTRACT(up.package_object, '$.price')) AS DECIMAL(12,2)),
              dp.price,
              0
            ) AS total_price,
            '' AS slug
          FROM res_upackages up
          LEFT JOIN res_download_packages dp ON up.package_id = dp.package_id
          WHERE up.order_id = ?
        `,
          [orderId],
        );
        items.push(...packages);
      }

      // Get courses
      if (itemTypes.includes(4)) {
        const [courses] = await pool.execute(
          `
          SELECT 
            'Course' AS type,
            rc.title AS name,
            1 AS quantity,
            COALESCE(rc.sale_price, rc.price, 0) AS unit_price,
            COALESCE(rc.sale_price, rc.price, 0) AS total_price,
            rc.slug
          FROM res_ucourses uc
          INNER JOIN res_courses rc ON uc.course_id = rc.course_id
          WHERE uc.order_id = ?
        `,
          [orderId],
        );
        items.push(...courses);
      }

      // Get wallet topups
      if (itemTypes.includes(5)) {
        const [topups] = await pool.execute(
          `
          SELECT 
            'Wallet Recharge' AS type,
            'Wallet Recharge' AS name,
            1 AS quantity,
            amount AS unit_price,
            amount AS total_price,
            '' AS slug
          FROM res_uwallet_recharge
          WHERE order_id = ?
        `,
          [orderId],
        );
        items.push(...topups);
      }

      return items.map(item => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        total_price: Number(item.total_price) || 0,
      }));
    } catch (error) {
      console.error('Error getting order items:', error);
      return [];
    }
  }

  /**
   * Generate PDF from invoice data using PDFKit
   * @param {Object} data - Invoice data
   * @param {string} filePath - Output file path
   * @param {Object} options - PDF options
   * @returns {Promise<Buffer>} - PDF buffer
   */
  async generatePDFFromData(data, filePath, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Create PDF document
        const doc = new PDFDocument({
          size: options.format === 'A4' ? 'A4' : 'LETTER'
        });

        const chunks = [];
        
        // Collect PDF chunks
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          // Save to file
          fs.writeFileSync(filePath, buffer);
          resolve(buffer);
        });
        doc.on('error', reject);

        // Draw invoice content
        this.drawInvoice(doc, data);

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw invoice content on PDF document
   * @param {PDFDocument} doc - PDFKit document instance
   * @param {Object} data - Invoice data
   */
  drawInvoice(doc, data) {
    const margin = 72;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    const formatLabel = value =>
      typeof value === 'string'
        ? value
            .replace(/[_-]/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase())
        : value;

    const currencyDisplay = data.currency_symbol
      ? `${data.currency_symbol} (${data.currency_code})`
      : data.currency_code || '';

    // Header Section - smaller site name
    doc.fontSize(20)
       .fillColor('#007bff')
       .text(data.site.site_name || 'Invoice', margin, yPosition);
    
    yPosition += 40;

    // Company Info
    if (data.site.site_email) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(data.site.site_email, margin, yPosition);
      yPosition += 15;
    }
    if (data.site.site_phone) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(data.site.site_phone, margin, yPosition);
      yPosition += 15;
    }
    if (data.site.site_address) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(data.site.site_address, margin, yPosition);
      yPosition += 15;
    }

    yPosition += 20;

    // Invoice Title and Details (Right aligned) - ensure it fits
    const invoiceDetailsWidth = Math.min(220, contentWidth * 0.45);
    const invoiceDetailsX = pageWidth - margin - invoiceDetailsWidth;
    
    doc.fontSize(24)
       .fillColor('#007bff')
       .text('INVOICE', invoiceDetailsX, margin + 5, {
         align: 'right',
         width: invoiceDetailsWidth
       });

    let invoiceY = margin + 35;
    
    doc.fontSize(10)
       .fillColor('#333333')
       .text(`Invoice #: ${data.invoice_number}`, invoiceDetailsX, invoiceY, {
         align: 'right',
         width: invoiceDetailsWidth,
         ellipsis: true
       });
    invoiceY += 15;

    doc.fontSize(10)
       .fillColor('#666666')
       .text(`Date: ${data.invoice_date_formatted}`, invoiceDetailsX, invoiceY, {
         align: 'right',
         width: invoiceDetailsWidth
       });
    invoiceY += 15;

    if (data.due_date_formatted) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Due Date: ${data.due_date_formatted}`, invoiceDetailsX, invoiceY, {
           align: 'right',
           width: invoiceDetailsWidth
         });
      invoiceY += 15;
    }

    if (data.payment_date_formatted) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Payment Date: ${data.payment_date_formatted}`, invoiceDetailsX, invoiceY, {
           align: 'right',
           width: invoiceDetailsWidth
         });
      invoiceY += 15;
    }

    // Line separator
    yPosition = Math.max(yPosition + 20, invoiceY + 20);
    doc.moveTo(margin, yPosition)
       .lineTo(pageWidth - margin, yPosition)
       .strokeColor('#007bff')
       .lineWidth(2)
       .stroke();

    yPosition += 30;

    // Billing Section
    doc.fontSize(14)
       .fillColor('#333333')
       .text('Bill To:', margin, yPosition);
    
    yPosition += 20;

    doc.fontSize(12)
       .fillColor('#333333')
       .text(`${data.first_name} ${data.last_name}`, margin, yPosition);
    yPosition += 18;

    doc.fontSize(10)
       .fillColor('#666666')
       .text(data.email, margin, yPosition);
    yPosition += 15;

    if (data.phone) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(data.phone, margin, yPosition);
      yPosition += 15;
    }

    const renderAddress = addressObject => {
      if (!addressObject || typeof addressObject !== 'object') {
        return;
      }

      const addressLines = [];
      ['address_line1', 'address_line2', 'addressLine1', 'addressLine2'].forEach(key => {
        if (addressObject[key]) {
          addressLines.push(addressObject[key]);
        }
      });

      const localityParts = [];
      if (addressObject.city) localityParts.push(addressObject.city);
      if (addressObject.state) localityParts.push(addressObject.state);
      if (addressObject.postal_code || addressObject.zip) {
        localityParts.push(addressObject.postal_code || addressObject.zip);
      }
      if (localityParts.length) {
        addressLines.push(localityParts.join(', '));
      }
      if (addressObject.country) {
        addressLines.push(addressObject.country);
      }

      if (addressLines.length) {
        addressLines.forEach(line => {
          doc.fontSize(10)
             .fillColor('#666666')
             .text(line, margin, yPosition);
          yPosition += 15;
        });
      }
    };

    renderAddress(data.billing_address);

    if (data.order_id) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Order #: ${data.order_id}`, margin, yPosition);
      yPosition += 15;
    }

    if (data.order_date_formatted) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Order Date: ${data.order_date_formatted}`, margin, yPosition);
      yPosition += 15;
    }

    if (data.payment_method) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Payment Method: ${formatLabel(data.payment_method)}`, margin, yPosition, {
           width: contentWidth * 0.45,
           ellipsis: true,
         });
      yPosition += 15;
    }

    if (data.payment_status) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Payment Status: ${formatLabel(data.payment_status)}`, margin, yPosition, {
           width: contentWidth * 0.45,
           ellipsis: true,
         });
      yPosition += 15;
    }

    if (currencyDisplay) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Currency: ${currencyDisplay}`, margin, yPosition);
      yPosition += 15;
    }

    // Invoice Summary Box (Right side) - ensure it fits within page
    const summaryBoxY = yPosition - 60;
    const summaryWidth = Math.min(200, (pageWidth - margin * 2) * 0.4); // Max 40% of content width
    const summaryX = pageWidth - margin - summaryWidth;
    const summaryHeight = 260; // Increased for better spacing with additional metadata

    // Summary box background
    doc.fillColor('#f8f9fa')
       .strokeColor('#dddddd')
       .lineWidth(1)
       .rect(summaryX, summaryBoxY, summaryWidth, summaryHeight)
       .fill()
       .stroke();

    let summaryY = summaryBoxY + 15;
    doc.fontSize(14)
       .fillColor('#333333')
       .text('Invoice Summary', summaryX + 10, summaryY);
    summaryY += 25;

    // Summary rows - calculate proper positions
    const summaryLabelWidth = summaryWidth - 110; // Space for labels
    const summaryValueWidth = 90; // Width for values
    const summaryValueX = summaryX + summaryWidth - summaryValueWidth - 10;
    
    doc.fontSize(10)
       .fillColor('#333333')
       .text('Subtotal:', summaryX + 10, summaryY, { width: summaryLabelWidth, ellipsis: true });
    doc.text(data.subtotal_formatted, summaryValueX, summaryY, { 
      width: summaryValueWidth,
      align: 'right',
      ellipsis: true
    });
    summaryY += 18;

    if (parseFloat(data.tax_amount) > 0) {
      doc.text('Tax:', summaryX + 10, summaryY, { width: summaryLabelWidth, ellipsis: true });
      doc.text(data.tax_amount_formatted, summaryValueX, summaryY, { 
        width: summaryValueWidth,
        align: 'right',
        ellipsis: true
      });
      summaryY += 18;
    }

    if (parseFloat(data.discount_amount) > 0) {
      doc.text('Discount:', summaryX + 10, summaryY, { width: summaryLabelWidth, ellipsis: true });
      doc.text(`-${data.discount_amount_formatted}`, summaryValueX, summaryY, { 
        width: summaryValueWidth,
        align: 'right',
        ellipsis: true
      });
      summaryY += 18;
    }

    // Total line
    doc.moveTo(summaryX + 10, summaryY)
       .lineTo(summaryX + summaryWidth - 10, summaryY)
       .strokeColor('#dddddd')
       .lineWidth(1)
       .stroke();
    summaryY += 12;

    doc.fontSize(12)
       .fillColor('#007bff')
       .font('Helvetica-Bold')
       .text('Total:', summaryX + 10, summaryY, { width: summaryLabelWidth, ellipsis: true });
    doc.text(data.total_amount_formatted, summaryValueX, summaryY, { 
      width: summaryValueWidth,
      align: 'right',
      ellipsis: true
    });
    summaryY += 25;

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#333333')
       .text('Amount Paid:', summaryX + 10, summaryY, { width: summaryLabelWidth, ellipsis: true });
    doc.text(data.amount_paid_formatted, summaryValueX, summaryY, { 
      width: summaryValueWidth,
      align: 'right',
      ellipsis: true
    });
    summaryY += 18;

    if (parseFloat(data.amount_due) > 0) {
      doc.text('Amount Due:', summaryX + 10, summaryY, { width: summaryLabelWidth, ellipsis: true });
      doc.text(data.amount_due_formatted, summaryValueX, summaryY, { 
        width: summaryValueWidth,
        align: 'right',
        ellipsis: true
      });
      summaryY += 18;
    }

    // Status badge hidden per request

    // Items Table
    yPosition += 80;

    // Table header
    let tableTop = yPosition;
    const itemHeight = 25;
    // Calculate column widths with proper spacing to prevent overflow
    const tablePadding = 10;
    const colSpacing = 5; // Space between columns
    const availableWidth = contentWidth - (tablePadding * 2);
    const totalSpacing = colSpacing * 4; // 4 gaps between 5 columns
    const usableWidth = availableWidth - totalSpacing;
    
    const colWidths = {
      item: Math.floor(usableWidth * 0.35),
      type: Math.floor(usableWidth * 0.15),
      qty: Math.floor(usableWidth * 0.12),
      unitPrice: Math.floor(usableWidth * 0.19),
      total: Math.floor(usableWidth * 0.19)
    };
    
    // Verify total doesn't exceed available width and adjust if needed
    const totalColWidth = Object.values(colWidths).reduce((a, b) => a + b, 0) + totalSpacing;
    if (totalColWidth > availableWidth) {
      // Adjust if overflow
      const ratio = usableWidth / totalColWidth;
      Object.keys(colWidths).forEach(key => {
        colWidths[key] = Math.floor(colWidths[key] * ratio);
      });
    }

    // Helper function to draw table header
    const drawTableHeader = () => {
      const tableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0) + totalSpacing + (tablePadding * 2);
      doc.fillColor('#007bff')
         .strokeColor('#007bff')
         .lineWidth(1)
         .rect(margin, tableTop, tableWidth, itemHeight)
         .fill()
         .stroke();
      
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor('#ffffff');

      let colX = margin + tablePadding;
      doc.text('Item', colX, tableTop + 7, { width: colWidths.item, ellipsis: true });
      colX += colWidths.item + colSpacing;
      doc.text('Type', colX, tableTop + 7, { width: colWidths.type, ellipsis: true });
      colX += colWidths.type + colSpacing;
      doc.text('Qty', colX, tableTop + 7, { width: colWidths.qty, align: 'center' });
      colX += colWidths.qty + colSpacing;
      doc.text('Unit Price', colX, tableTop + 7, { width: colWidths.unitPrice, align: 'right', ellipsis: true });
      colX += colWidths.unitPrice + colSpacing;
      doc.text('Total', colX, tableTop + 7, { width: colWidths.total, align: 'right', ellipsis: true });
    };

    drawTableHeader();

    // Table rows
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#333333');
    
    let rowY = tableTop + itemHeight;
    
    if (!data.items || data.items.length === 0) {
      doc.fontSize(10)
         .fillColor('#666666')
         .text('No invoice items found for this order.', margin + tablePadding, tableTop + itemHeight + 8, {
           width: contentWidth - tablePadding * 2,
         });
      rowY = tableTop + itemHeight + 40;
    } else {
      data.items.forEach((item, index) => {
      // Check if we need a new page (leave room for footer)
      if (rowY + itemHeight > pageHeight - margin - 80) {
        doc.addPage();
        tableTop = margin;
        rowY = tableTop + itemHeight;
        drawTableHeader();
      }

      // Alternate row colors
      const tableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0) + totalSpacing + (tablePadding * 2);
      if (index % 2 === 0) {
        doc.fillColor('#f8f9fa')
           .rect(margin, rowY, tableWidth, itemHeight)
           .fill();
      }
      
      doc.fillColor('#333333');

      let colX = margin + tablePadding;
      doc.text(item.name || '', colX, rowY + 7, { width: colWidths.item, ellipsis: true });
      colX += colWidths.item + colSpacing;
      doc.text(item.type || '', colX, rowY + 7, { width: colWidths.type, ellipsis: true });
      colX += colWidths.type + colSpacing;
      doc.text(String(item.quantity || 0), colX, rowY + 7, { width: colWidths.qty, align: 'center' });
      colX += colWidths.qty + colSpacing;
      doc.text(item.unit_price_formatted, colX, rowY + 7, { width: colWidths.unitPrice, align: 'right', ellipsis: true });
      colX += colWidths.unitPrice + colSpacing;
      doc.text(item.total_price_formatted, colX, rowY + 7, { width: colWidths.total, align: 'right', ellipsis: true });

      // Row border
      doc.moveTo(margin, rowY + itemHeight)
         .lineTo(margin + tableWidth, rowY + itemHeight)
         .strokeColor('#dddddd')
         .lineWidth(0.5)
         .stroke();

      rowY += itemHeight;
      });
    }

    // Notes section
    if (data.notes) {
      // Check if we need a new page for notes
      if (rowY + 80 > pageHeight - margin - 100) {
        doc.addPage();
        rowY = margin;
      } else {
        rowY += 20;
      }
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#333333')
         .text('Notes:', margin, rowY);
      
      rowY += 20;
      
      // Handle notes text wrapping
      const notesText = String(data.notes || '').trim();
      if (notesText) {
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor('#666666')
           .text(notesText, margin, rowY, {
             width: contentWidth,
             align: 'left',
             lineGap: 4
           });
        
        // Calculate how much space notes took
        const notesHeight = doc.heightOfString(notesText, {
          width: contentWidth,
          lineGap: 4
        });
        rowY += notesHeight + 10;
      }
    }

    // Footer - draw on current page
    const currentY = rowY || yPosition;
    const footerY = pageHeight - margin - 40;
    
    // Check if current page has space for footer, otherwise add new page
    if (currentY > footerY - 50) {
      doc.addPage();
      rowY = margin;
    }
    
    doc.fontSize(10)
       .fillColor('#666666')
       .text('Thank you for your business!', margin, footerY, { align: 'center', width: contentWidth });
    
    doc.fontSize(8)
       .fillColor('#999999')
       .text(`This invoice was generated on ${data.invoice_date_formatted}`, margin, footerY + 15, { align: 'center', width: contentWidth });
    
    if (data.site.site_name) {
      doc.text(`© ${data.site.site_name} - All rights reserved`, margin, footerY + 28, { align: 'center', width: contentWidth });
    }
  }

  /**
   * Get PDF file info
   * @param {string} fileName - File name
   * @returns {Object} - File info
   */
  getPDFInfo(fileName) {
    const filePath = path.join(this.outputDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const stats = fs.statSync(filePath);
    
    return {
      fileName,
      filePath,
      fileSize: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      downloadUrl: `/invoices/${fileName}`
    };
  }

  /**
   * Delete PDF file
   * @param {string} fileName - File name
   * @returns {boolean} - Success status
   */
  deletePDF(fileName) {
    try {
      const filePath = path.join(this.outputDir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting PDF:', error);
      return false;
    }
  }
}

module.exports = PDFInvoiceService;
