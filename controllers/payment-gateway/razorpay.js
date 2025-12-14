const Razorpay = require("razorpay");
const { pool } = require("../../config/database");

const { insertOrder } = require("./helper");
const { processOrder, activateOrder, addCreditsBalance } = require("./processOrder");
const NotificationService = require("../../services/notificationService");
const { ErrorLogger } = require("../../logger");
const OrderCalculationService = require("../../services/OrderCalculationService");

/**
 * 🚀 RAZORPAY ORDER CREATION
 * 
 * Creates a Razorpay order using the unified OrderCalculationService.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate input (currency only - amount calculated from cart)
 * 2. Fetch Razorpay credentials from database
 * 3. Use OrderCalculationService for unified cart calculation
 * 4. Create Razorpay order with calculated amount
 * 5. Insert order into database
 * 6. Send notifications
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createOrder(req, res) {
  try {
    const options = req.body;
    const { id } = req.user;

    // ✅ INPUT VALIDATION: Only currency required, amount calculated from cart
    if (!options || !options.currency) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid input: Currency is required. Amount will be calculated from cart.",
      });
    }

    // 🔑 FETCH RAZORPAY CREDENTIALS: Get API keys from database
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["razorpay"]
    );

    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        status: "fail",
        message: "Razorpay configuration not found.",
      });
    }

    const { public_key, secret_key } = paymentGatewayRows[0];

    // 🏗️ INITIALIZE RAZORPAY CLIENT: Create Razorpay instance
    const razorpay = new Razorpay({
      key_id: public_key,
      key_secret: secret_key,
    });

    // 🎯 UNIFIED ORDER CALCULATION: Single source of truth for all calculations
    const calculationResult = await OrderCalculationService.calculateOrder({
      userId: id,
      currency: options.currency,
      paymentGatewayId: 'razorpay',
      discountCode: options.discount_code,
      recordDiscountUsage: true
    });

    const { orderDetails, cartItems } = calculationResult;

    // 💰 CREATE RAZORPAY ORDER: Convert amount to paise and create order
    // Amount is calculated on backend - frontend should NOT send amount
    const amountInPaise = OrderCalculationService.getAmountInPaise(orderDetails.total_amount);
    
    let option = {
      amount: amountInPaise, // Amount in paise (Razorpay requirement)
      currency: options.currency,
      receipt: options.receipt || `order_${id}_${Date.now()}`,
      payment_capture: 1, // Auto-capture payment
      notes: options.notes || null,
    };

    // 🚀 CREATE RAZORPAY ORDER: Call Razorpay API to create order
    const order = await razorpay.orders.create(option);

    if (!order) {
      return res.status(500).json({
        status: "fail",
        message: "Failed to create Razorpay order.",
      });
    }

    // 💾 PREPARE DATABASE PAYLOAD: Use unified order details from OrderCalculationService
    const payload = {
      user_id: id,
      ...orderDetails,
      amount_due: orderDetails.total_amount, // Calculated total amount
      payment_method: 1, // Razorpay payment method ID
      notes: JSON.stringify({ 
        razorpay_order_id: order.id,
        ...options.notes 
      }) || JSON.stringify({ razorpay_order_id: order.id }),
      item_types: orderDetails.item_types, // JSON stringified by OrderCalculationService
      tax_breakdown: orderDetails.tax_breakdown,
      discount_details: orderDetails.discount_details,
    };

    // 💾 INSERT ORDER TO DATABASE: Save order with all calculated details
    const orderId = await insertOrder(payload);

    // 🎯 PROCESS ORDER: Create order items with is_active = 0
    await processOrder(orderId, id, 0);

    // 🎯 RECORD DISCOUNT USAGE: Record after order creation with valid order_id
    if (options.discount_code && orderDetails.discount_details) {
      try {
        const { recordDiscountUsage } = require('../../controllers/shared/discount');
        await recordDiscountUsage({
          discount_id: orderDetails.discount_details.id,
          user_id: id,
          order_id: orderId,
          discount_amount: orderDetails.discount,
          order_amount: orderDetails.subtotal,
          payment_method: 'razorpay',
          order_type: '2', // Assuming subscription packages, adjust as needed
          package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
        });
      } catch (discountError) {
        // Log but don't fail the order if discount recording fails
        console.error('Failed to record discount usage:', discountError.message);
      }
    }

    // Send order creation notification to admin
    try {
      await NotificationService.createNotification(
        "order_created",
        "New Order Created",
        `New order #${orderId} created via Razorpay for ${orderDetails.total_amount} ${options.currency}`,
        {
          order_id: orderId,
          user_id: id,
          total_amount: orderDetails.total_amount,
          currency: options.currency,
          payment_method: "Razorpay",
          item_types: orderDetails.item_types,
          razorpay_order_id: order.id
        },
        true
      );
    } catch (notificationError) {
      // send error log to error logger
      await ErrorLogger.logError({
        errorType: 'notification',
        errorLevel: 'error',
        errorMessage: notificationError.message,
        errorDetails: notificationError,
        userId: id,
        endpoint: '/razorpay/createOrder'
      });
    }

    // Send response with order details
    return res.json({
      status: "success",
      data: order,
      order_id: orderId,
    });
  } catch (err) {
    // console.error('Razorpay createOrder error:', err);
    
    // send error log to error logger
    try {
      await ErrorLogger.logError({
        errorType: 'payment',
        errorLevel: 'error',
        errorMessage: err.message,
        errorDetails: err,
        endpoint: '/razorpay/createOrder'
      });
    } catch (logError) {
      // console.error('Failed to log error:', logError);
    }
    
    return res.status(500).json({
      status: "fail",
      message: "Internal Server Error",
      error: err.message || "Unknown error occurred"
    });
  }
}

/**
 * 💰 WALLET BALANCE RECHARGE
 * 
 * This is different from cart orders - user specifies amount to add to wallet.
 * Frontend DOES send amount here (unlike cart orders where amount is calculated).
 */
async function addBalanceCreateOrder(req, res) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const options = req.body;
    const { id } = req.user;

    if (!options || !options.amount || !options.currency) {
      await connection.rollback();
      return res.status(400).json({
        status: "fail",
        message: "Invalid input: Amount and currency are required for wallet recharge.",
      });
    }

    // Fetch Razorpay credentials
    const [paymentGatewayRows] = await connection.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["razorpay"]
    );

    if (!paymentGatewayRows.length) {
      await connection.rollback();
      return res.status(500).json({
        status: "fail",
        message: "Razorpay configuration not found.",
      });
    }

    const { public_key, secret_key } = paymentGatewayRows[0];

    const razorpay = new Razorpay({
      key_id: public_key,
      key_secret: secret_key,
    });

    const [exchangeRate] = await connection.execute(
      "SELECT * FROM res_currencies WHERE currency_code = ?",
      [options.currency]
    );

    const rate = exchangeRate[0].rate;

    const amount = parseFloat(options.amount) * parseFloat(rate);

    // Create Razorpay order
    let option = {
      amount: amount * 100,
      currency: options.currency,
      receipt: `order_${id}_${Date.now()}`,
      payment_capture: 1, // Auto-capture payment
      notes: options.notes || null,
    };

    const order = await razorpay.orders.create(option);

    if (!order) {
      await connection.rollback();
      return res.status(500).json({
        status: "fail",
        message: "Failed to create Razorpay order.",
      });
    }

    // Prepare payload for database insertion
    const payload = {
      user_id: id,
      amount_due: amount,
      payment_method: 1,
      notes: JSON.stringify({ 
        razorpay_order_id: order.id,
        ...options.notes 
      }) || JSON.stringify({ razorpay_order_id: order.id }),
      subtotal: amount,
      total_amount: amount,
      amount_paid: 0,
      item_types: JSON.stringify([5]), // Assuming 5 is the item type for balance recharge
      currency: options.currency,
      exchange_rate: rate,
    };

    // Insert the order into the database
    const orderId = await insertOrder(payload, connection);

    // Send wallet recharge order creation notification to admin
    try {
      await NotificationService.createNotification(
        "wallet_recharge_order",
        "Wallet Recharge Order Created",
        `Wallet recharge order #${orderId} created via Razorpay for ${amount} ${options.currency}`,
        {
          order_id: orderId,
          user_id: id,
          amount: amount,
          currency: options.currency,
          payment_method: "Razorpay",
          order_type: "wallet_recharge",
          razorpay_order_id: order.id
        },
        true
      );
    } catch (notificationError) {
      // console.error("Error creating wallet recharge order notification:", notificationError);
      // Don't fail the order creation if notification fails
    }

    await connection.commit();

    // Send response with order details
    return res.json({
      status: "success",
      data: order,
      order_id: orderId,
    });
  } catch (err) {
    await connection.rollback();
    return res.status(500).json({
      status: "fail",
      message: "Internal Server Error",
    });
  } finally {
    connection.release(); // Always release the database connection
  }
}

async function fetchPayment(req, res) {
  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    order_id,
  } = req.body;
  const { id } = req.user;

  if (
    !razorpay_payment_id ||
    !razorpay_order_id ||
    !razorpay_signature ||
    !order_id
  ) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid payment details.",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if order exists and belongs to user
    const [existingOrder] = await connection.execute(
      "SELECT * FROM res_orders WHERE order_id = ? AND user_id = ?",
      [order_id, id]
    );

    if (existingOrder.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        status: "fail",
        message: "Invalid order.",
      });
    }

    const order = existingOrder[0];

    // If payment already processed, check if it was processed via webhook
    if (order.payment_status === 2) {
      // Check if transaction exists (indicates processing is complete)
      const [transactionRows] = await connection.execute(
        "SELECT * FROM res_transactions WHERE order_id = ? AND user_id = ?",
        [order_id, id]
      );
      
      if (transactionRows.length > 0) {
        await connection.commit();
        return res.status(200).json({
          status: "success",
          message: "Payment already processed.",
          order_id,
        });
      }
    }

    // Fetch Razorpay credentials
    const [paymentGatewayRows] = await connection.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["razorpay"]
    );

    const { public_key, secret_key } = paymentGatewayRows[0];

    const razorpay = new Razorpay({
      key_id: public_key,
      key_secret: secret_key,
    });

    // Fetch payment from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (!payment || payment.status !== "captured") {
      await connection.rollback();
      return res.status(400).json({
        status: "fail",
        message: "Payment verification failed or payment not captured.",
      });
    }

    // Insert into transactions
    // Ensure currency is only 3 characters (standard currency code)
    const currencyCode = payment.currency ? payment.currency.substring(0, 3).toUpperCase() : 'USD';
    
    const [transactionResult] = await connection.execute(
      "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
      [
        order_id,
        id,
        currencyCode,
        payment.amount / 100,
        order.exchange_rate || 1,
        2, // Paid
        1, // Razorpay
        payment.id,
        JSON.stringify(payment)
      ]
    );

    const transactionId = transactionResult.insertId;

    // Update order
    const paidAmount = payment.amount / 100;

    // Determine order status: Physical products (item_type 6) should remain Pending (1) for admin approval
    // Digital products can be Completed (7) immediately, EXCEPT if they require manual processing
    let itemTypes;
    try {
      itemTypes = JSON.parse(order.item_types);
    } catch (err) {
      await connection.rollback();
      return res.status(500).json({
        status: "fail",
        message: "Invalid item types in order.",
      });
    }

    // Check if order has manual processing products
    const { hasManualProcessingProducts } = require('./helper');
    const hasManualProcessing = await hasManualProcessingProducts(order_id, connection);

    // If order contains physical products (item_type 6) OR manual processing products, keep it as Pending (1)
    // Otherwise, mark as Completed (7) for digital products
    const orderStatus = (itemTypes.includes(6) || hasManualProcessing) ? 1 : 7;

    await connection.execute(
      "UPDATE res_orders SET payment_status = ?, amount_paid = ?, order_status = ?, transaction_id = ? WHERE order_id = ?",
      [2, paidAmount, orderStatus, transactionId, order_id]
    );

    // Process order or add credits
    if (itemTypes.includes(5)) {
      try {
        await addCreditsBalance(order_id);
      } catch (err) {
        // console.error("addCreditsBalance failed:", err.message);
      }
    } else {
      await activateOrder(order_id, id, connection);
    }

    // Send payment success notification to admin
    try {
      await NotificationService.createNotification(
        "payment_received",
        "Payment Received",
        `Payment of ${paidAmount} ${currencyCode} received for order #${order_id}`,
        {
          order_id,
          user_id: id,
          amount: paidAmount,
          currency: currencyCode,
          payment_method: "Razorpay",
          transaction_id: transactionId,
          gateway_txn_id: payment.id
        },
        true
      );
    } catch (notificationError) {
      // send error log to error logger
      await ErrorLogger.logError({
        errorType: 'notification',
        errorLevel: 'error',
        errorMessage: notificationError.message,
        errorDetails: notificationError,
        userId: id,
        endpoint: '/razorpay/fetchPayment'
      });
      // Don't fail the payment process if notification fails
    }

    await connection.commit();

    return res.status(200).json({
      status: "success",
      order_id,
    });
  } catch (error) {
    // console.error('fetchPayment error:', error);
    await connection.rollback();
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'payment',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: id,
      endpoint: '/razorpay/fetchPayment'
    });
    return res.status(500).json({
      status: "fail",
      message: "Internal Server Error. Please try again later.",
    });
  } finally {
    connection.release();
  }
}

/**
 * 🔔 RAZORPAY WEBHOOK HANDLER
 * 
 * Handles Razorpay webhook events for payment confirmations.
 * Processes orders when payment is captured.
 */
async function webhook(req, res) {
  try {
    // Get the raw body and signature
    const rawBody = req.rawBody;
    const webhookSignature = req.headers['x-razorpay-signature'];
    
    // Parse the webhook payload
    const webhookPayload = JSON.parse(rawBody);
    
    // Fetch Razorpay credentials from database
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["razorpay"]
    );

    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        status: "fail",
        message: "Razorpay configuration not found.",
      });
    }

    const { secret_key } = paymentGatewayRows[0];
    
    const  webhook_secret = false; // we will use this later
    
    // Verify webhook signature if secret is configured
    if (webhook_secret) {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', webhook_secret)
        .update(rawBody)
        .digest('hex');
      
      if (expectedSignature !== webhookSignature) {
        console.log('Webhook signature verification failed.');
        return res.status(400).send('Webhook signature verification failed');
      }
    } else {
      console.log('Warning: Webhook secret not configured for Razorpay. Processing webhook without signature verification.');
      // Continue processing without signature verification
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Handle different webhook events
      const event = webhookPayload.event;
      const payload = webhookPayload.payload;
      
      switch (event) {
        case 'payment.captured':
          const payment = payload.payment.entity;
          
          // Extract order information
          const razorpayOrderId = payment.order_id;
          const razorpayPaymentId = payment.id;
          
          // Find the corresponding order in our database
          // First try to find by razorpay_order_id in notes
          const [orderRows] = await connection.execute(
            "SELECT * FROM res_orders WHERE JSON_UNQUOTE(JSON_EXTRACT(notes, '$.razorpay_order_id')) = ?",
            [razorpayOrderId]
          );
          
          let order, orderId, userId;
          
          if (orderRows.length > 0) {
            order = orderRows[0];
            orderId = order.order_id;
            userId = order.user_id;
          } else {
            // If not found, try to find by transaction reference
            const [transactionRows] = await connection.execute(
              "SELECT o.* FROM res_orders o JOIN res_transactions t ON o.order_id = t.order_id WHERE t.gateway_txn_id = ?",
              [razorpayPaymentId]
            );
            
            if (transactionRows.length > 0) {
              order = transactionRows[0];
              orderId = order.order_id;
              userId = order.user_id;
            } else {
              await connection.rollback();
              console.log(`Order not found for Razorpay order ID: ${razorpayOrderId}`);
              return res.status(400).send('Order not found');
            }
          }
          
          // Check if payment is already processed via fetchPayment
          if (order.payment_status === 2) {
            // Check if transaction exists (indicates processing is complete)
            const [transactionRows] = await connection.execute(
              "SELECT * FROM res_transactions WHERE order_id = ? AND user_id = ?",
              [orderId, userId]
            );
            
            if (transactionRows.length > 0) {
              await connection.commit();
              return res.status(200).json({
                status: "success",
                message: "Payment already processed.",
                order_id: orderId,
              });
            }
          }
          
          // Determine order status: Physical products (item_type 6) should remain Pending (1) for admin approval
          // Digital products can be Completed (7) immediately, EXCEPT if they require manual processing
          const { hasManualProcessingProducts } = require('./helper');
          let itemTypes = [];
          try {
            itemTypes = order.item_types ? JSON.parse(order.item_types) : [];
          } catch (err) {
            itemTypes = [];
          }
          const hasManualProcessing = await hasManualProcessingProducts(orderId, connection);
          const orderStatus = (itemTypes.includes(6) || hasManualProcessing) ? 1 : 7;
          
          // Update order status to paid
          await connection.execute(
            "UPDATE res_orders SET payment_status = 2, order_status = ?, amount_paid = ? WHERE order_id = ?",
            [orderStatus, payment.amount / 100, orderId]
          );
          
          // Insert transaction record
          const [transactionResult] = await connection.execute(
            "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
            [
              orderId,
              userId,
              payment.currency.toUpperCase(),
              payment.amount / 100,
              order.exchange_rate || 1,
              2, // payment_status (paid)
              1, // payment_method (Razorpay)
              razorpayPaymentId,
              JSON.stringify(payment)
            ]
          );
          
          const transactionId = transactionResult.insertId;
          
          // Update order with transaction ID
          await connection.execute(
            "UPDATE res_orders SET transaction_id = ? WHERE order_id = ?",
            [transactionId, orderId]
          );
          
          // Process the order (activate services, send emails, etc.)
          // itemTypes was already declared above, reuse it
          // Process order or add credits based on item types
          if (itemTypes.includes(5)) {
            try {
              await addCreditsBalance(orderId);
            } catch (creditError) {
              console.error("addCreditsBalance failed:", creditError.message);
            }
          } else {
            await activateOrder(orderId, userId, connection);
          }

          // Send payment success notification to admin
          try {
            await NotificationService.createNotification(
              "razorpay_payment_webhook",
              "Razorpay Payment Received via Webhook",
              `Razorpay payment of ${payment.amount / 100} ${payment.currency.toUpperCase()} received for order #${orderId} via webhook`,
              {
                order_id: orderId,
                user_id: userId,
                amount: payment.amount / 100,
                currency: payment.currency.toUpperCase(),
                payment_method: "Razorpay",
                transaction_id: transactionId,
                razorpay_payment_id: razorpayPaymentId,
                razorpay_order_id: razorpayOrderId,
                webhook_source: true
              },
              true
            );
          } catch (notificationError) {
            // Log error but don't fail the webhook processing
            await ErrorLogger.logError({
              errorType: 'notification',
              errorLevel: 'error',
              errorMessage: notificationError.message,
              errorDetails: notificationError,
              userId: userId,
              endpoint: '/razorpay/webhook',
              additionalData: {
                order_id: orderId,
                razorpay_payment_id: razorpayPaymentId,
                razorpay_order_id: razorpayOrderId
              }
            });
          }
          
          break;
          
        case 'payment.failed':
          const failedPayment = payload.payment.entity;
          console.log('Payment failed:', failedPayment);
          // Handle failed payment if needed
          break;
          
        case 'order.paid':
          const paidOrder = payload.order.entity;
          console.log('Order paid:', paidOrder);
          // Handle order paid event if needed
          break;
          
        default:
          console.log(`Unhandled event type ${event}`);
      }
      
      await connection.commit();
      res.json({ received: true });
      
    } catch (error) {
      await connection.rollback();
      
      await ErrorLogger.logError({
        errorType: 'webhook',
        errorLevel: 'error',
        errorMessage: 'Razorpay webhook processing error',
        errorDetails: error,
        endpoint: '/razorpay/webhook',
        additionalData: {
          event_type: event,
        }
      });
      
      res.status(500).json({
        status: 'fail',
        message: 'Webhook processing failed'
      });
    } finally {
      connection.release();
    }
  } catch (err) {
    await ErrorLogger.logError({
      errorType: 'webhook',
      errorLevel: 'error',
      errorMessage: 'Razorpay webhook error',
      errorDetails: err,
      endpoint: '/razorpay/webhook'
    });
    
    return res.status(500).json({
      status: "fail",
      message: "Internal Server Error",
      error: err.message || "Unknown error occurred"
    });
  }
}

// Fetch all orders
async function fetchOrders(req, res) {
  try {
    // Fetch Razorpay credentials
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["razorpay"]
    );

    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        status: "fail",
        message: "Razorpay configuration not found.",
      });
    }

    const { public_key, secret_key } = paymentGatewayRows[0];

    const razorpay = new Razorpay({
      key_id: public_key,
      key_secret: secret_key,
    });

    const orders = await razorpay.orders.all();
    return res.status(200).json({
      status: "success",
      data: orders,
    });
  } catch (err) {
    // console.error("Error fetching orders:", err.message);
    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
}

module.exports = {
  createOrder,
  fetchPayment,
  fetchOrders,
  addBalanceCreateOrder,
  webhook
};
