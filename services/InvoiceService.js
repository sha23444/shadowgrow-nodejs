const { pool } = require("../config/database");

/**
 * Invoice Service
 * Handles invoice creation and management
 */
class InvoiceService {
  /**
   * Generate unique invoice number with sequential numbering
   * Format: INV-YYYY-XXXXXX (year + 6-digit sequential number)
   */
  static async generateInvoiceNumber(invoiceDate = new Date()) {
    const year = invoiceDate.getFullYear();
    
    // Get the next sequential number for this year
    try {
      const [[result]] = await pool.execute(`
        SELECT COALESCE(MAX(
          CAST(
            CASE 
              WHEN SUBSTRING(invoice_number, 9) REGEXP '^[0-9]+$' 
              THEN SUBSTRING(invoice_number, 9)
              ELSE '0'
            END AS UNSIGNED)
        ), 0) + 1 as next_number
        FROM res_invoices 
        WHERE invoice_number LIKE ?
      `, [`INV-${year}-%`]);
      
      const nextNumber = result && result.next_number ? result.next_number : 1;
      
      // Ensure the number doesn't exceed 6 digits (999999)
      const safeNumber = Math.min(nextNumber, 999999);
      
      return `INV-${year}-${String(safeNumber).padStart(6, '0')}`;
    } catch (error) {
      console.error('Error generating invoice number:', error.message);
      // Fallback: use timestamp-based number
      const timestamp = Date.now() % 1000000;
      return `INV-${year}-${String(timestamp).padStart(6, '0')}`;
    }
  }

  /**
   * Create invoice from completed order
   * @param {Object} orderData - Order data from res_orders table
   * @param {Object} connection - Database connection (optional)
   * @returns {Promise<number>} - Invoice ID
   */
  static async createInvoiceFromOrder(orderData, connection = null) {
    const db = connection || pool;
    
    try {
      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(new Date(orderData.created_at));
      
      // Get addresses from order or fetch from user's default address
      let billingAddress = orderData.billing_address;
      let shippingAddress = orderData.shipping_address;
      
      // If addresses not in order, try to get from user's default address
      if (!billingAddress || !shippingAddress) {
        try {
          const [addresses] = await db.execute(
            `SELECT rua.*, 
             (SELECT s.name FROM states s WHERE s.iso2 = rua.state_code COLLATE utf8mb4_general_ci LIMIT 1) AS state_name,
             (SELECT c.name FROM countries c WHERE c.iso2 = rua.country_code COLLATE utf8mb4_general_ci LIMIT 1) AS country_name
             FROM res_user_addresses rua
             WHERE rua.user_id = ? AND rua.is_default = 1
             ORDER BY rua.address_id DESC
             LIMIT 1`,
            [orderData.user_id]
          );
          
          if (addresses.length > 0) {
            const userAddress = addresses[0];
            const addressData = {
              name: userAddress.name || '',
              email: '', // Will be populated from user data
              phone: userAddress.phone || '',
              address: userAddress.address || '',
              locality: userAddress.locality || '',
              landmark: userAddress.landmark || '',
              city: userAddress.city || '',
              state: userAddress.state_name || userAddress.state_code || '',
              zipCode: userAddress.zip_code || '',
              country: userAddress.country_name || userAddress.country_code || '',
            };
            
            // Use user address for both billing and shipping if not provided
            if (!billingAddress) {
              billingAddress = JSON.stringify(addressData);
            }
            if (!shippingAddress) {
              shippingAddress = JSON.stringify(addressData);
            }
          }
        } catch (addressError) {
          console.error('Error fetching user address for invoice:', addressError);
          // Continue with null addresses if fetch fails
        }
      }
      
      // Parse addresses if they're strings
      if (typeof billingAddress === 'string') {
        try {
          billingAddress = JSON.parse(billingAddress);
        } catch (e) {
          billingAddress = null;
        }
      }
      if (typeof shippingAddress === 'string') {
        try {
          shippingAddress = JSON.parse(shippingAddress);
        } catch (e) {
          shippingAddress = null;
        }
      }

      // Parse item_types if it's a string
      let itemTypes = orderData.item_types;
      if (typeof itemTypes === 'string') {
        try {
          itemTypes = JSON.parse(itemTypes);
        } catch (e) {
          itemTypes = [];
        }
      }
      if (!Array.isArray(itemTypes)) {
        itemTypes = [];
      }

      // Parse tax_breakdown and discount_details if they're strings
      let taxBreakdown = orderData.tax_breakdown;
      if (typeof taxBreakdown === 'string' && taxBreakdown) {
        try {
          taxBreakdown = JSON.parse(taxBreakdown);
        } catch (e) {
          taxBreakdown = null;
        }
      }
      
      let discountDetails = orderData.discount_details;
      if (typeof discountDetails === 'string' && discountDetails) {
        try {
          discountDetails = JSON.parse(discountDetails);
        } catch (e) {
          discountDetails = null;
        }
      }

      // Prepare invoice data
      const invoiceData = {
        order_id: orderData.order_id,
        user_id: orderData.user_id,
        invoice_number: invoiceNumber,
        invoice_type: 'standard',
        invoice_date: new Date(orderData.created_at),
        due_date: new Date(orderData.created_at), // Set due date same as invoice date
        payment_date: orderData.payment_status === 2 ? new Date(orderData.created_at) : null,
        subtotal: parseFloat(orderData.subtotal || 0),
        tax_amount: parseFloat(orderData.tax || 0),
        discount_amount: parseFloat(orderData.discount || 0),
        total_amount: parseFloat(orderData.total_amount || orderData.amount_due || 0),
        amount_paid: parseFloat(orderData.amount_paid || orderData.total_amount || orderData.amount_due || 0),
        amount_due: orderData.payment_status === 2 ? 0 : parseFloat(orderData.amount_due || orderData.total_amount || 0),
        currency: orderData.currency || 'INR',
        exchange_rate: parseFloat(orderData.exchange_rate || 1) || 1,
        payment_method: orderData.payment_method || 1,
        payment_status: orderData.payment_status || 1,
        gateway_txn_id: orderData.transaction_id || null,
        gateway_response: null,
        invoice_status: (orderData.payment_status === 2 || orderData.payment_status === '2') ? 3 : 1, // 3=Paid, 1=Draft
        item_types: JSON.stringify(itemTypes),
        tax_breakdown: taxBreakdown ? JSON.stringify(taxBreakdown) : null,
        discount_details: discountDetails ? JSON.stringify(discountDetails) : null,
        billing_address: billingAddress ? (typeof billingAddress === 'object' ? JSON.stringify(billingAddress) : billingAddress) : null,
        shipping_address: shippingAddress ? (typeof shippingAddress === 'object' ? JSON.stringify(shippingAddress) : shippingAddress) : null,
        notes: orderData.notes || null,
        terms_conditions: null,
        created_at: orderData.created_at,
        updated_at: new Date()
      };

      // Insert invoice
      const [result] = await db.execute(
        `INSERT INTO res_invoices 
        (order_id, user_id, invoice_number, invoice_type, invoice_date, due_date, payment_date,
         subtotal, tax_amount, discount_amount, total_amount, amount_paid, amount_due,
         currency, exchange_rate, payment_method, payment_status, gateway_txn_id, gateway_response,
         invoice_status, item_types, tax_breakdown, discount_details, billing_address, shipping_address,
         notes, terms_conditions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceData.order_id,
          invoiceData.user_id,
          invoiceData.invoice_number,
          invoiceData.invoice_type,
          invoiceData.invoice_date,
          invoiceData.due_date,
          invoiceData.payment_date,
          invoiceData.subtotal,
          invoiceData.tax_amount,
          invoiceData.discount_amount,
          invoiceData.total_amount,
          invoiceData.amount_paid,
          invoiceData.amount_due,
          invoiceData.currency,
          invoiceData.exchange_rate,
          invoiceData.payment_method,
          invoiceData.payment_status,
          invoiceData.gateway_txn_id,
          invoiceData.gateway_response,
          invoiceData.invoice_status,
          invoiceData.item_types,
          invoiceData.tax_breakdown,
          invoiceData.discount_details,
          invoiceData.billing_address,
          invoiceData.shipping_address,
          invoiceData.notes,
          invoiceData.terms_conditions,
          invoiceData.created_at,
          invoiceData.updated_at
        ]
      );

      console.log(`Created invoice ${invoiceNumber} (ID: ${result.insertId}) for order ${orderData.order_id}`);
      return result.insertId;

    } catch (error) {
      console.error(`Error creating invoice for order ${orderData.order_id}:`, error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Order data keys:', Object.keys(orderData));
      console.error('Order data sample:', {
        order_id: orderData.order_id,
        user_id: orderData.user_id,
        order_status: orderData.order_status,
        payment_status: orderData.payment_status,
        item_types: orderData.item_types,
        total_amount: orderData.total_amount
      });
      throw error;
    }
  }

  /**
   * Check if invoice already exists for an order
   * @param {number} orderId - Order ID
   * @param {Object} connection - Database connection (optional)
   * @returns {Promise<boolean>} - True if invoice exists
   */
  static async invoiceExists(orderId, connection = null) {
    const db = connection || pool;
    
    try {
      const [[result]] = await db.execute(
        "SELECT COUNT(*) as count FROM res_invoices WHERE order_id = ?",
        [orderId]
      );
      
      return result.count > 0;
    } catch (error) {
      console.error(`Error checking invoice existence for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Update invoice payment information
   * @param {number} invoiceId - Invoice ID
   * @param {Object} paymentData - Payment information
   * @param {Object} connection - Database connection (optional)
   */
  static async updateInvoicePayment(invoiceId, paymentData, connection = null) {
    const db = connection || pool;
    
    try {
      const {
        payment_status,
        payment_date,
        gateway_txn_id,
        gateway_response,
        amount_paid
      } = paymentData;

      await db.execute(
        `UPDATE res_invoices 
         SET payment_status = ?, payment_date = ?, gateway_txn_id = ?, 
             gateway_response = ?, amount_paid = ?, amount_due = total_amount - ?,
             invoice_status = ?, updated_at = NOW()
         WHERE invoice_id = ?`,
        [
          payment_status,
          payment_date,
          gateway_txn_id,
          gateway_response ? JSON.stringify(gateway_response) : null,
          amount_paid,
          amount_paid,
          payment_status === 2 ? 3 : 1, // 3=Paid, 1=Draft
          invoiceId
        ]
      );

      console.log(`Updated payment information for invoice ${invoiceId}`);
    } catch (error) {
      console.error(`Error updating payment for invoice ${invoiceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get invoice by order ID
   * @param {number} orderId - Order ID
   * @param {Object} connection - Database connection (optional)
   * @returns {Promise<Object|null>} - Invoice data or null
   */
  static async getInvoiceByOrderId(orderId, connection = null) {
    const db = connection || pool;
    
    try {
      const [[invoice]] = await db.execute(
        "SELECT * FROM res_invoices WHERE order_id = ?",
        [orderId]
      );
      
      return invoice || null;
    } catch (error) {
      console.error(`Error getting invoice for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create invoice for completed order if it doesn't exist
   * @param {number} orderId - Order ID
   * @param {Object} connection - Database connection (optional)
   * @returns {Promise<number|null>} - Invoice ID or null if not created
   */
  static async createInvoiceIfNeeded(orderId, connection = null) {
    const db = connection || pool;
    
    try {
      // Check if invoice already exists
      const exists = await this.invoiceExists(orderId, db);
      if (exists) {
        console.log(`Invoice already exists for order ${orderId}`);
        return null;
      }

      // Get order data
      const [[order]] = await db.execute(
        "SELECT * FROM res_orders WHERE order_id = ?",
        [orderId]
      );

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Only create invoice for completed orders (status = 7)
      if (order.order_status !== 7) {
        console.log(`Order ${orderId} is not completed, skipping invoice creation`);
        return null;
      }

      // Create invoice
      const invoiceId = await this.createInvoiceFromOrder(order, db);
      return invoiceId;

    } catch (error) {
      console.error(`Error creating invoice for order ${orderId}:`, error.message);
      throw error;
    }
  }
}

module.exports = InvoiceService;
