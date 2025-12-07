const { pool } = require("../../config/database");

const { insertOrder } = require("./helper");
const { processOrder, activateOrder, addCreditsBalance } = require("./processOrder");
const NotificationService = require("../../services/notificationService");
const { ErrorLogger } = require("../../logger");
const OrderCalculationService = require("../../services/OrderCalculationService");

const paypal = require('@paypal/paypal-server-sdk');

/**
 * 🚀 PAYPAL ORDER CREATION
 * 
 * Creates a PayPal order using the unified OrderCalculationService.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate input (currency only - amount calculated from cart)
 * 2. Fetch PayPal credentials from database
 * 3. Use OrderCalculationService for unified cart calculation
 * 4. Create PayPal order with calculated amount
 * 5. Insert order into database
 * 6. Generate PayPal checkout URL
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createPayPalOrder(req, res) {
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

    // 🔑 FETCH PAYPAL CREDENTIALS: Get API keys from database
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["paypal"]
    );

    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        status: "fail",
        message: "PayPal configuration not found.",
      });
    }

    const { extra_config } = paymentGatewayRows[0];

    // 🔧 PARSE PAYPAL CONFIG: Extract webhook URL and business email
    let business_email = null;
    let webhook_url = null;
    try {
      if (extra_config) {
        const config = JSON.parse(extra_config);
        business_email = config.business_email;
        webhook_url = config.webhook_url;
      }
    } catch (error) {
      await ErrorLogger.logError({
        errorType: 'config',
        errorLevel: 'warning',
        errorMessage: 'Error parsing PayPal extra_config',
        errorDetails: error,
        endpoint: '/paypal/createOrder'
      });
    }

    // 🎯 SINGLE SOURCE OF TRUTH: Use unified order calculation service
    const calculationResult = await OrderCalculationService.calculateOrder({
      userId: id,
      currency: options.currency,
      paymentGatewayId: 'paypal',
      discountCode: options.discount_code,
      recordDiscountUsage: true
    });

    const { orderDetails, cartItems } = calculationResult;

    // ✅ VALIDATE ORDER DETAILS
    if (!orderDetails || orderDetails.total_amount <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid order amount calculated. Please check your cart.",
      });
    }

    // Reject zero amount orders
    if (orderDetails.total_amount === 0) {
      return res.status(400).json({
        status: "fail",
        message: "Zero amount orders should use the free order endpoint",
        redirect_to: "/api/payment/free-order/process"
      });
    }

    // 🎯 PRODUCTION-READY: Prepare payload using unified order details
    const payload = {
      user_id: id,
      ...orderDetails,
      amount_due: orderDetails.total_amount,
      payment_method: 6, // PayPal
      notes: options.notes || null,
      item_types: orderDetails.item_types, // Already JSON stringified by service
      tax_breakdown: orderDetails.tax_breakdown,
      discount_details: orderDetails.discount_details,
    };

    // Insert the order into the database
    const orderId = await insertOrder(payload);

    if (!orderId) {
      return res.status(500).json({
        status: "fail",
        message: "Failed to create order in database",
      });
    }

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
          payment_method: 'paypal',
          order_type: '2', // Assuming subscription packages, adjust as needed
          package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
        });
      } catch (discountError) {
        // Log but don't fail the order if discount recording fails
        console.error('Failed to record discount usage:', discountError.message);
      }
    }

    // Create PayPal checkout URL - use sandbox for testing, production for live
    const paypalBaseUrl =  "https://www.paypal.com/cgi-bin/webscr";
    
    // Generate a unique token for manual verification
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(20).toString('hex');
    
    // Store the token in the order for later verification
    await pool.execute(
      "UPDATE res_orders SET notes = ? WHERE order_id = ?",
      [verificationToken, orderId]
    );
    
    const appUrl = process.env.APP_BASE_URL;
    const returnUrl = `${appUrl}/payment/paypal/success?order_id=${orderId}&token=${verificationToken}`;
    const cancelUrl = `${appUrl}/payment/paypal/cancel`;

    // webhook url
    const webhookUrl = `${process.env.API_BASE_URL}/api/v1/user/payment/paypal/webhook`;
    
    // Use webhook URL from database configuration, fallback to local URL
    const notifyUrl = webhookUrl;

    const paypalBusinessEmail = business_email;
    
    // Validate business email
    if (!paypalBusinessEmail) {
      return res.status(500).json({
        status: "fail",
        message: "PayPal business email not configured.",
      });
    }

    // 🔧 IMPROVED PAYPAL PARAMETERS: Better URL encoding and validation
    const paypalParams = new URLSearchParams({
      cmd: '_xclick',
      business: paypalBusinessEmail,
      item_name: `Order #${orderId}`,
      amount: orderDetails.total_amount.toFixed(2), // Ensure proper decimal formatting
      currency_code: options.currency.toUpperCase(), // Ensure uppercase currency
      return: returnUrl,
      cancel_return: cancelUrl,
      notify_url: notifyUrl,
      custom: orderId.toString(), // Pass order ID as custom parameter for verification
      no_shipping: '1',
      no_note: '1',
      charset: 'utf-8',
      rm: '2', // Return method: POST to return URL
      bn: 'PP-BuyNowBF' // PayPal button code
    });

    const paypalCheckoutUrl = `${paypalBaseUrl}?${paypalParams.toString()}`;

    // Send order creation notification to admin
    try {
      await NotificationService.createNotification(
        "order_created",
        "New Order Created",
        `New order #${orderId} created via PayPal for ${orderDetails.total_amount} ${options.currency}`,
        {
          order_id: orderId,
          user_id: id,
          total_amount: orderDetails.total_amount,
          currency: options.currency,
          payment_method: "PayPal",
          item_types: orderDetails.item_types,
          checkout_url: paypalCheckoutUrl,
          cart_items_count: cartItems.length,
          discount_amount: orderDetails.discount,
          tax_amount: orderDetails.tax
        },
        true
      );
    } catch (notificationError) {
      await ErrorLogger.logError({
        errorType: 'notification',
        errorLevel: 'error',
        errorMessage: notificationError.message,
        errorDetails: notificationError,
        userId: id,
        endpoint: '/paypal/createOrder'
      });
    }

    // Send response with checkout URL
    return res.json({
      status: "success",
      data: {
        checkout_url: paypalCheckoutUrl,
       }
    });

  } catch (err) {
    await ErrorLogger.logError({
      errorType: 'payment',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      endpoint: '/paypal/createOrder',
      userId: req.user?.id
    });
    return res.status(500).json({
      status: "fail",
      message: "Internal Server Error",
      error: err.message
    });
  }
}

// Webhook handler for PayPal notifications
async function handleWebhook(req, res) {
  try {
    // Log webhook received for debugging
    await ErrorLogger.logError({
      errorType: 'webhook',
      errorLevel: 'info',
      errorMessage: 'PayPal webhook received',
      errorDetails: {
        method: req.method,
        bodyKeys: Object.keys(req.body),
        timestamp: new Date().toISOString()
      },
      endpoint: '/paypal/webhook'
    });

    // Validate webhook request
    if (!req.body || Object.keys(req.body).length === 0) {
      await ErrorLogger.logError({
        errorType: 'webhook',
        errorLevel: 'warning',
        errorMessage: 'PayPal webhook: Empty request body',
        endpoint: '/paypal/webhook'
      });
      return res.status(400).json({ status: "error", message: "Empty request body" });
    }

    // Check if this is IPN format (old PayPal format)
    if (req.body.payment_status && req.body.custom) {
      // IPN format processing
      const paymentStatus = req.body.payment_status;
      const orderId = req.body.custom;
      const amount = req.body.mc_gross;
      const currency = req.body.mc_currency;
      const paypalTransactionId = req.body.txn_id;

      if (paymentStatus === 'Completed' && orderId) {
        
        // Find the order in database using the order ID
        const [orders] = await pool.execute(
          "SELECT * FROM res_orders WHERE order_id = ?",
          [orderId]
        );

        if (orders.length > 0) {
          const order = orders[0];
          
          // Update order status if not already processed
          if (order.payment_status !== 2) {
          
            const [transactionResult] = await pool.execute(
              "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
              [
                order.order_id,
                order.user_id,
                currency,
                parseFloat(amount),
                order.exchange_rate,
                2, // Paid
                6, // PayPal
                paypalTransactionId,
                JSON.stringify(req.body)
              ]
            );

            const dbTransactionId = transactionResult.insertId;
           
            // updated order status
            
            await pool.execute(
              "UPDATE res_orders SET transaction_id = ? , payment_status = ?, amount_paid = ?, order_status = ? WHERE order_id = ?",
              [dbTransactionId, 2, parseFloat(amount), 7, order.order_id]
            );
            
            // Process order
            let itemTypes;
            try {
              itemTypes = JSON.parse(order.item_types);
            } catch (err) {
              await ErrorLogger.logError({
                errorType: 'data_parsing',
                errorLevel: 'error',
                errorMessage: 'Error parsing item types',
                errorDetails: err,
                endpoint: '/paypal/webhook'
              });
              return res.status(200).json({ status: "success" });
            }

            if (itemTypes.includes(5)) {
              try {
                await addCreditsBalance(order.order_id);
              } catch (err) {
                await ErrorLogger.logError({
                  errorType: 'wallet',
                  errorLevel: 'error',
                  errorMessage: 'addCreditsBalance failed',
                  errorDetails: err,
                  endpoint: '/paypal/webhook'
                });
              }
            } else {
              try {
                await activateOrder(order.order_id, order.user_id);
              } catch (err) {
                await ErrorLogger.logError({
                  errorType: 'order_activation',
                  errorLevel: 'error',
                  errorMessage: 'activateOrder failed in PayPal webhook (IPN)',
                  errorDetails: err,
                  orderId: order.order_id,
                  userId: order.user_id,
                  endpoint: '/paypal/webhook'
                });
                // Don't throw - log error but continue with notification
              }
            }

            // Send notification
            try {
              await NotificationService.createNotification(
                "payment_received",
                "Payment Received",
                `Payment of ${amount} ${currency} received for order #${order.order_id}`,
                {
                  order_id: order.order_id,
                  user_id: order.user_id,
                  amount: parseFloat(amount),
                  currency: currency,
                  payment_method: "PayPal",
                  gateway_txn_id: dbTransactionId
                },
                true
              );
            } catch (notificationError) {
              await ErrorLogger.logError({
                errorType: 'notification',
                errorLevel: 'error',
                errorMessage: 'Error creating notification',
                errorDetails: notificationError,
                endpoint: '/paypal/webhook'
              });
            }
          }
        }
      }
    } else {
      // REST API webhook format processing
      const { event_type, resource } = req.body;

      if (event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const payment = resource;
        
        // Try different ways to get the order ID
        const orderId = payment.custom_id || payment.custom || payment.invoice_id || payment.reference_id;

        if (orderId) {
          
          // Find the order in database using the order ID
          const [orders] = await pool.execute(
            "SELECT * FROM res_orders WHERE order_id = ?",
            [orderId]
          );

          if (orders.length > 0) {
            const order = orders[0];
            
            // Update order status if not already processed
            if (order.payment_status !== 2) {
              // Insert transaction record first
              const [transactionResult] = await pool.execute(
                "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                [
                  order.order_id,
                  order.user_id,
                  payment.amount.currency_code || payment.amount.currencyCode,
                  parseFloat(payment.amount.value),
                  order.exchange_rate,
                  2, // Paid
                  6, // PayPal
                  payment.id,
                  JSON.stringify(payment)
                ]
              );

              const dbTransactionId = transactionResult.insertId;

              // Update order status with transaction ID
              await pool.execute(
                "UPDATE res_orders SET transaction_id = ?, payment_status = ?, amount_paid = ?, order_status = ? WHERE order_id = ?",
                [dbTransactionId, 2, parseFloat(payment.amount.value), 7, order.order_id]
              );

              // Process order
              let itemTypes;
              try {
                itemTypes = JSON.parse(order.item_types);
              } catch (err) {
                await ErrorLogger.logError({
                  errorType: 'data_parsing',
                  errorLevel: 'error',
                  errorMessage: 'Error parsing item types',
                  errorDetails: err,
                  endpoint: '/paypal/webhook'
                });
                return res.status(200).json({ status: "success" });
              }

              if (itemTypes.includes(5)) {
                try {
                  await addCreditsBalance(order.order_id);
                } catch (err) {
                  await ErrorLogger.logError({
                    errorType: 'wallet',
                    errorLevel: 'error',
                    errorMessage: 'addCreditsBalance failed',
                    errorDetails: err,
                    endpoint: '/paypal/webhook'
                  });
                }
              } else {
                try {
                  await activateOrder(order.order_id, order.user_id);
                } catch (err) {
                  await ErrorLogger.logError({
                    errorType: 'order_activation',
                    errorLevel: 'error',
                    errorMessage: 'activateOrder failed in PayPal webhook (REST API)',
                    errorDetails: err,
                    orderId: order.order_id,
                    userId: order.user_id,
                    endpoint: '/paypal/webhook'
                  });
                  // Don't throw - log error but continue with notification
                }
              }

              // Send notification
              try {
                await NotificationService.createNotification(
                  "payment_received",
                  "Payment Received",
                  `Payment of ${payment.amount.value} ${payment.amount.currency_code || payment.amount.currencyCode} received for order #${order.order_id}`,
                  {
                    order_id: order.order_id,
                    user_id: order.user_id,
                    amount: parseFloat(payment.amount.value),
                    currency: payment.amount.currency_code || payment.amount.currencyCode,
                    payment_method: "PayPal",
                    gateway_txn_id: dbTransactionId
                  },
                  true
                );
              } catch (notificationError) {
                await ErrorLogger.logError({
                  errorType: 'notification',
                  errorLevel: 'error',
                  errorMessage: 'Error creating notification',
                  errorDetails: notificationError,
                  endpoint: '/paypal/webhook'
                });
              }
            }
          }
        }
      }
    }

    return res.status(200).json({ status: "success" });
  } catch (error) {
    await ErrorLogger.logError({
      errorType: 'webhook',
      errorLevel: 'error',
      errorMessage: 'PayPal webhook error',
      errorDetails: error,
      endpoint: '/paypal/webhook'
    });
    return res.status(500).json({ status: "error", message: error.message });
  }
}


async function updateOrder(req, res) {
  try {
    const { order_id, token } = req.body;
    const userId = req.user.id;
    
    if (!order_id) {
      return res.status(400).json({
        status: "fail",
        message: "Order ID is required"
      });
    }
    
    // Fetch order details from database
    const [orderRows] = await pool.execute(
      "SELECT * FROM res_orders WHERE order_id = ?",
      [order_id]
    );
    
    if (!orderRows.length) {
      return res.status(404).json({
        status: "fail",
        message: "Order not found"
      });
    }
    
    const order = orderRows[0];
    
    // Check if user is authorized to verify this order
    if (order.user_id !== userId) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to verify this order"
      });
    }

    // Extract token from notes - assuming it's stored as a plain string
    let verificationToken = null;
    if (order.notes) {
      verificationToken = order.notes;
    }

    // If we still don't have a token, check if it's in the verification_token column
    if (!verificationToken && order.verification_token) {
      verificationToken = order.verification_token;
    }

    // If we still don't have a token, return an error
    if (!verificationToken) {
      return res.status(500).json({
        status: "fail",
        message: "Order verification token not found."
      });
    }
    
    // If token is provided, verify it matches
    if (token && token !== verificationToken) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid verification token"
      });
    }
    
    // Check if order is already paid
    if (order.payment_status === 2) {
      return res.json({
        status: "success",
        message: "Order is already paid",
        order_id: order.order_id,
        payment_status: "paid"
      });
    }
    
    // Update transaction details
    const [transactionResult] = await pool.execute(
      "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, payment_date, gateway_txn_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW())",
      [order.order_id, order.user_id, order.currency, order.total_amount, order.exchange_rate, 2, 6, verificationToken] 
    );

    const transactionId = transactionResult.insertId;

    // Update order status to paid
    await pool.execute(
      "UPDATE res_orders SET payment_status = 2, order_status = 7, transaction_id = ?, amount_paid = ? WHERE order_id = ?",
      [transactionId, order.total_amount, order.order_id]
    );

    // Activate order using the existing activateOrder function
    try {
      await activateOrder(order.order_id, order.user_id);
    } catch (err) {
      await ErrorLogger.logError({
        errorType: 'order_activation',
        errorLevel: 'error',
        errorMessage: 'activateOrder failed in PayPal updateOrder',
        errorDetails: err,
        orderId: order.order_id,
        userId: order.user_id,
        endpoint: '/paypal/updateOrder'
      });
      throw err; // Re-throw in manual verification so user knows activation failed
    }

    // Create payment notification
    try {
      await NotificationService.createPaymentNotification({
        payment_id: transactionId,
        order_id: order.order_id,
        user_id: order.user_id,
        amount: order.total_amount,
        currency: order.currency,
        payment_method: "PayPal",
        payment_status: "paid"
      });
    } catch (notificationError) {
      await ErrorLogger.logError({
        errorType: 'notification',
        errorLevel: 'error',
        errorMessage: 'Error creating payment notification',
        errorDetails: notificationError,
        endpoint: '/paypal/updateOrder',
        userId: userId
      });
    }

    return res.json({
      status: "success",
      message: "Order verified successfully",
      order_id: order.order_id,
      payment_status: "paid",
      transaction_id: transactionId
    });

    
  } catch (error) {
    await ErrorLogger.logError({
      errorType: 'payment',
      errorLevel: 'error',
      errorMessage: 'Error in PayPal manual verification: ' + error.message,
      errorDetails: error.stack,
      endpoint: '/paypal/updateOrder',
      userId: req.user?.id
    });
    
    return res.status(500).json({
      status: "fail",
      message: "Internal server error",
      error: error.message
    });
  }
}

module.exports = {
  createPayPalOrder,
  handleWebhook,
  updateOrder,
};