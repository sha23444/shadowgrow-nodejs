const { pool } = require("../../config/database");
const { sendEmail } = require("../../email-service/email-service");
const NotificationService = require("../../services/notificationService");
const { ErrorLogger } = require("../../logger");
const { notifyOrderPending } = require("../admin/telegram");

/**
 * 🛠️ PAYMENT GATEWAY HELPER FUNCTIONS
 * 
 * This module contains utility functions for payment gateways.
 * Order calculation logic has been moved to OrderCalculationService for consistency.
 * 
 * Functions:
 * - insertOrder: Insert order into database with validation
 * - sendOrderConfirmationEmail: Send email confirmation
 * - createNewUser: Create new user account
 * - getPackagePeriods: Get package period information
 */

/**
 * 💾 INSERT ORDER TO DATABASE
 * 
 * Inserts an order into the database with comprehensive validation.
 * All order data comes from OrderCalculationService for consistency.
 * 
 * @param {Object} d - Order data object
 * @param {Object} connection - Database connection (optional)
 * @returns {Promise<number>} - Order ID
 */
const insertOrder = async (d, connection = null) => {
  const {
    user_id,
    subtotal = 0,
    total_amount = 0,
    amount_due = 0,
    tax = 0,
    discount = 0,
    exchange_rate = 1,
    payment_method,
    currency,
    notes = null,
    item_types = "[]",
    tax_breakdown = null,
    discount_details = null,
    billing_address = null,
    shipping_address = null,
  } = d;

  if (!user_id || !payment_method || !currency || !item_types) {
    throw new Error("Missing required fields");
  }

  // Validate and ensure all numeric values are valid numbers
  const validatedData = {
    user_id: parseInt(user_id) || 0,
    subtotal: parseFloat(subtotal) || 0,
    total_amount: parseFloat(total_amount) || 0,
    amount_due: parseFloat(amount_due) || 0,
    tax: parseFloat(tax) || 0,
    discount: parseFloat(discount) || 0,
    exchange_rate: parseFloat(exchange_rate) || 1,
    payment_method: parseInt(payment_method) || 0,
    currency: String(currency),
    notes: notes || null,
    item_types: String(item_types),
    tax_breakdown: tax_breakdown || null,
    discount_details: discount_details || null
  };

  // Check for NaN values
  Object.keys(validatedData).forEach(key => {
    if (typeof validatedData[key] === 'number' && isNaN(validatedData[key])) {
      throw new Error(`Invalid numeric value for ${key}: ${validatedData[key]}`);
    }
  });

  try {
     
    // Handle addresses - accept both JSON strings and objects
    let billingAddressJson = null;
    let shippingAddressJson = null;
    
    if (billing_address) {
      billingAddressJson = typeof billing_address === 'string' 
        ? billing_address 
        : JSON.stringify(billing_address);
    }
    
    if (shipping_address) {
      shippingAddressJson = typeof shipping_address === 'string' 
        ? shipping_address 
        : JSON.stringify(shipping_address);
    }

    const [order] = await (connection || pool).execute(
      `INSERT INTO res_orders 
      (user_id, subtotal, total_amount, amount_due, tax, discount, exchange_rate, payment_method, currency, notes, item_types, tax_breakdown, discount_details, billing_address, shipping_address, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        validatedData.user_id,
        validatedData.subtotal,
        validatedData.total_amount,
        validatedData.amount_due,
        validatedData.tax,
        validatedData.discount,
        validatedData.exchange_rate,
        validatedData.payment_method,
        validatedData.currency,
        validatedData.notes,
        validatedData.item_types,
        validatedData.tax_breakdown ? JSON.stringify(validatedData.tax_breakdown) : null,
        validatedData.discount_details ? JSON.stringify(validatedData.discount_details) : null,
        billingAddressJson,
        shippingAddressJson,
      ]
    );

  // send notification to admin
  await NotificationService.createNotification(
    "order_placed",
    "New Order Placed",
    `New order #${order.insertId} placed for ${validatedData.total_amount} ${validatedData.currency}`,
    { 
      order_id: order.insertId, 
      user_id: validatedData.user_id, 
      total_amount: validatedData.total_amount, 
      currency: validatedData.currency,
      payment_method: validatedData.payment_method,
      item_types: JSON.parse(validatedData.item_types),
      subtotal: validatedData.subtotal,
      tax: validatedData.tax,
      discount: validatedData.discount,
      exchange_rate: validatedData.exchange_rate
    },
    true
  );

  // Send Telegram notification for pending order asynchronously (non-blocking)
  try {
    const [users] = await (connection || pool).execute(
      "SELECT username, email, first_name, last_name FROM res_users WHERE user_id = ?",
      [validatedData.user_id]
    );

    const user = users[0] || {};
    const customerName = user.first_name || user.username || `User #${validatedData.user_id}`;
    const itemTypesArray = JSON.parse(validatedData.item_types);
    const itemsCount = itemTypesArray.length;

    const telegramPayload = {
      order_id: order.insertId,
      id: order.insertId,
      user_id: validatedData.user_id,
      customer_name: customerName,
      user_name: customerName,
      total_amount: validatedData.total_amount,
      amount: validatedData.total_amount,
      currency: validatedData.currency,
      payment_method: validatedData.payment_method,
      items_count: itemsCount,
      status: 'Pending'
    };

    setImmediate(() => {
      notifyOrderPending(telegramPayload).catch((telegramError) => {
        console.error('Error sending Telegram notification for pending order:', telegramError);
      });
    });
  } catch (telegramPrepError) {
    console.error('Error preparing Telegram notification for pending order:', telegramPrepError);
  }

    return order.insertId;
  } catch (error) {
    // console.error("Error inserting order:", error.message);
    throw error;
  }
};

const getPackagePeriods = async (packageIds) => {
  const placeholders = packageIds.map(() => "?").join(",");
  const [periods] = await pool.execute(
    `SELECT package_id, period FROM res_download_packages WHERE package_id IN (${placeholders})`,
    packageIds
  );
  return new Map(periods.map((p) => [p.package_id, p.period])); // Map for quick lookup
};


// Send order confirmation email
const sendOrderConfirmationEmail = async (userId, paymentId, orderId) => {
  try {
    const [user] = await pool.execute(
      "SELECT email FROM res_users WHERE user_id = ?",
      [userId]
    );

    if (!user || user.length === 0) {
      throw new Error("User not found.");
    }

    const userEmail = user[0].email || "mkverma541@gmail.com"; // Fallback to default email if none is present

    if (!userEmail) {
      throw new Error(
        "No email address found for the user, and no fallback email provided."
      );
    }

    const emailSubject = "Order Confirmation";
    const emailBody = `
      Hi,<br><br>
      Your order has been confirmed.<br><br>
      Order ID: ${orderId}<br>
      Payment ID: ${paymentId}<br>
      Thank you for your purchase.
    `;

    await sendEmail(userEmail, emailSubject, emailBody);
  } catch (error) {
  
    await ErrorLogger.logError({
      errorType: 'email',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: userId,
      endpoint: '/sendOrderConfirmationEmail'
    });
  }
};

/**
 * Process zero-amount order (100% discount)
 * @param {Object} params - Order parameters
 * @param {number} params.userId - User ID
 * @param {Object} params.orderDetails - Order details from calculation
 * @param {number} params.paymentMethodId - Payment method ID
 * @returns {Object} Success response
 */
const processZeroAmountOrder = async (params) => {
  const { userId, orderDetails, paymentMethodId } = params;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const payload = {
      user_id: userId,
      ...orderDetails,
      amount_due: 0,
      payment_method: paymentMethodId,
      notes: "100% discount applied - no payment required",
      item_types: orderDetails.item_types
    };

    const orderId = await insertOrder(payload, connection);

    // Create transaction record for free order
    const [transactionResult] = await connection.execute(
      "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
      [
        orderId,
        userId,
        orderDetails.currency,
        0, // Amount paid is 0 for free orders
        orderDetails.exchange_rate || 1,
        2, // Payment status: Paid
        paymentMethodId,
        `FREE_ORDER_${Date.now()}`, // Gateway transaction ID
        JSON.stringify({ type: 'free_order', discount_applied: orderDetails.discount })
      ]
    );

    const transactionId = transactionResult.insertId;

    // Update order with correct statuses
    await connection.execute(
      "UPDATE res_orders SET payment_status = ?, amount_paid = ?, order_status = ?, transaction_id = ? WHERE order_id = ?",
      [2, 0, 7, transactionId, orderId] // payment_status=2 (Paid), order_status=7 (Completed)
    );

    // Process the order (deliver products, etc.)
    const { processOrder, activateOrder } = require('./processOrder');
    
    // First, process the order to add items to upackage/ufiles tables
    await processOrder(orderId, userId, 0, connection);
    
    // Then activate the order to set is_active = 1
    await activateOrder(orderId, userId, connection);

    await connection.commit();

    return {
      status: "success",
      message: "Order processed successfully with 100% discount",
      data: {
        order_id: orderId,
        transaction_id: transactionId,
        amount_due: 0,
        amount_paid: 0,
        discount_applied: orderDetails.discount || 0,
        payment_required: false,
        order_status: "completed",
        payment_status: "paid"
      }
    };
  } catch (error) {
    await connection.rollback();
    console.error('Error processing 100% discount order:', error);
    throw new Error('Failed to process order with 100% discount');
  } finally {
    connection.release();
  }
};

module.exports = {
  getPackagePeriods,
  insertOrder,
  sendOrderConfirmationEmail,
  processZeroAmountOrder
};
