const { pool } = require("../../config/database");
const { insertOrder } = require("./helper");
const { processOrder, activateOrder } = require("./processOrder");
const NotificationService = require("../../services/notificationService");
const OrderCalculationService = require("../../services/OrderCalculationService");
const { ErrorLogger } = require("../../logger");

/**
 * 🚀 STRIPE CHECKOUT SESSION CREATION (UNIFIED)
 * 
 * Creates a Stripe checkout session using the unified OrderCalculationService.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate input (currency only - amount calculated from cart)
 * 2. Use OrderCalculationService for unified cart calculation
 * 3. Create Stripe checkout session with calculated amount
 * 4. Insert order into database
 * 5. Return checkout URL
 */
async function createSession(req, res) {
  try {
    const { id } = req.user;
    const { currency, discount_code, success_url, cancel_url } = req.body;

    // ✅ INPUT VALIDATION
    if (!currency) {
      return res.status(400).json({
        status: "fail",
        message: "Currency is required. Amount will be calculated from cart."
      });
    }

    // 🔑 FETCH STRIPE CREDENTIALS: Get API keys from database
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["stripe"]
    );

    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        status: "fail",
        message: "Stripe configuration not found."
      });
    }

    const { public_key, secret_key } = paymentGatewayRows[0];

    // Initialize Stripe with database credentials
    const stripe = require("stripe")(secret_key);

    // 🎯 UNIFIED ORDER CALCULATION: Single source of truth for all calculations
    const calculationResult = await OrderCalculationService.calculateOrder({
      userId: id,
      currency: currency,
      paymentGatewayId: 'stripe',
      discountCode: discount_code,
      recordDiscountUsage: true
    });

    const { orderDetails, cartItems } = calculationResult;

    // Validate order details
    if (!orderDetails || orderDetails.amount_due < 0) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid order amount calculated"
      });
    }

    // Reject zero amount orders
    if (orderDetails.amount_due === 0) {
      return res.status(400).json({
        status: "fail",
        message: "Zero amount orders should use the free order endpoint",
        redirect_to: "/api/payment/free-order/process"
      });
    }

    // 💾 INSERT ORDER TO DATABASE
    const payload = {
      user_id: id,
      ...orderDetails,
      amount_due: orderDetails.total_amount,
      payment_method: 3, // Stripe payment method ID
      notes: null,
      item_types: orderDetails.item_types,
      tax_breakdown: orderDetails.tax_breakdown,
      discount_details: orderDetails.discount_details,
    };

    const orderId = await insertOrder(payload);

    if (!orderId) {
      return res.status(500).json({
        status: "fail",
        message: "Failed to create order in database"
      });
    }

    // 🎯 PROCESS ORDER: Create order items with is_active = 0
    await processOrder(orderId, id, 0);

    // 🎯 RECORD DISCOUNT USAGE: Record after order creation with valid order_id
    if (discount_code && orderDetails.discount_details) {
      try {
        const { recordDiscountUsage } = require('../../controllers/shared/discount');
        await recordDiscountUsage({
          discount_id: orderDetails.discount_details.id,
          user_id: id,
          order_id: orderId,
          discount_amount: orderDetails.discount,
          order_amount: orderDetails.subtotal,
          payment_method: 'stripe',
          order_type: '2', // Assuming subscription packages, adjust as needed
          package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
        });
      } catch (discountError) {
        // Log but don't fail the order if discount recording fails
        console.error('Failed to record discount usage:', discountError.message);
      }
    }

    // 🎯 CREATE STRIPE CHECKOUT SESSION
    // Convert amount to cents (Stripe requirement)
    const amountInCents = Math.round(orderDetails.total_amount * 100);

    // Prepare line items for cart summary
    const lineItems = [{
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: amountInCents,
        product_data: {
          name: `Order #${orderId}`,
          description: `${cartItems.length} item(s) - Subtotal: ${orderDetails.subtotal}, Tax: ${orderDetails.tax}, Discount: ${orderDetails.discount}`
        }
      },
      quantity: 1
    }];

    const sessionOptions = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: success_url || `${process.env.APP_BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.APP_BASE_URL}/payment/cancel`,
      metadata: {
        order_id: orderId.toString(),
        user_id: id.toString(),
        discount_code: discount_code || 'none'
      }
    };

    const session = await stripe.checkout.sessions.create(sessionOptions);

    // Send notification
    try {
      await NotificationService.createNotification(
        "stripe_session_created",
        "Stripe Checkout Session Created",
        `Stripe checkout session created for order #${orderId} - ${orderDetails.total_amount} ${currency}`,
        {
          session_id: session.id,
          order_id: orderId,
          user_id: id,
          amount: orderDetails.total_amount,
          currency: currency,
          payment_method: "Stripe",
          checkout_url: session.url,
          cart_items_count: cartItems.length,
          discount_amount: orderDetails.discount,
          tax_amount: orderDetails.tax
        },
        true
      );
    } catch (notificationError) {
      // Don't fail session creation if notification fails
    }

    res.json({
      status: "success",
      url: session.url,
      session_id: session.id,
      order_id: orderId,
      calculated_total: orderDetails.total_amount
    });
  } catch (error) {
    await ErrorLogger.logError({
      errorType: 'payment_gateway',
      errorLevel: 'error',
      errorMessage: 'Error creating Stripe session',
      errorDetails: error.message,
      endpoint: '/stripe/create-session',
      userId: req.user?.id
    });

    res.status(500).json({
      status: "fail",
      message: "Internal server error",
      error: error.message
    });
  }
}

/**
 * 🔍 STRIPE PAYMENT VERIFICATION
 * 
 * Verifies and processes a successful Stripe payment.
 * Retrieves session details and processes the order.
 */
async function fetchPayment(req, res) {
  const sessionID = req.params.id;
  const user = req.user;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 🔑 FETCH STRIPE CREDENTIALS: Get API keys from database
    const [paymentGatewayRows] = await connection.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["stripe"]
    );

    if (!paymentGatewayRows.length) {
      await connection.rollback();
      return res.status(500).json({
        status: "fail",
        message: "Stripe configuration not found."
      });
    }

    const { secret_key } = paymentGatewayRows[0];

    // Initialize Stripe with database credentials
    const stripe = require("stripe")(secret_key);

    // Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionID);

    if (session.payment_status === "paid") {
      const orderId = session.metadata?.order_id;

      if (!orderId) {
        await connection.rollback();
        return res.status(400).json({
          status: "fail",
          message: "Order ID not found in session metadata"
        });
      }

      // Process the order
      await activateOrder(orderId, user.id, connection);

      // Send payment success notification
      try {
        await NotificationService.createNotification(
          "stripe_payment",
          "Stripe Payment Received",
          `Stripe payment of ${session.amount_total / 100} ${session.currency.toUpperCase()} received for order #${orderId}`,
          {
            session_id: sessionID,
            order_id: orderId,
            user_id: user.id,
            amount: session.amount_total / 100,
            currency: session.currency.toUpperCase(),
            payment_method: "Stripe",
            payment_status: session.payment_status
          },
          true
        );
      } catch (notificationError) {
        // Don't fail the payment process if notification fails
      }

      await connection.commit();

      res.status(200).json({
        status: "success",
        message: "Payment processed successfully",
        order_id: orderId
      });
    } else {
      await connection.rollback();
      res.status(400).json({
        status: "fail",
        message: "Payment not completed",
        payment_status: session.payment_status
      });
    }
  } catch (error) {
    await connection.rollback();

    await ErrorLogger.logError({
      errorType: 'payment_gateway',
      errorLevel: 'error',
      errorMessage: 'Error processing Stripe payment',
      errorDetails: error.message,
      endpoint: '/stripe/fetch-payment',
      userId: user?.id,
      sessionId: sessionID
    });

    res.status(500).json({
      status: "fail",
      message: "Internal server error",
      error: error.message
    });
  } finally {
    connection.release();
  }
}

/**
 * 🔔 STRIPE WEBHOOK HANDLER
 * 
 * Handles Stripe webhook events for payment confirmations.
 * This is the recommended way to handle payment confirmations
 * instead of relying on redirect-based verification.
 */
async function webhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  
  // 🔑 FETCH STRIPE CREDENTIALS: Get API keys from database
  const [paymentGatewayRows] = await pool.execute(
    "SELECT * FROM payment_gateways WHERE gateway_type = ?",
    ["stripe"]
  );

  if (!paymentGatewayRows.length) {
    return res.status(500).json({
      status: "fail",
      message: "Stripe configuration not found."
    });
  }

  const { secret_key, webhook_secret } = paymentGatewayRows[0];

  // Initialize Stripe with database credentials
  const stripe = require("stripe")(secret_key);

  let event;

  try {
    // Verify webhook signature using webhook secret from database
    const endpointSecret = webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!endpointSecret) {
      console.log('Webhook secret not found in database or environment');
      return res.status(400).send('Webhook secret not configured');
    }

    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        
        if (session.payment_status === 'paid') {
          const orderId = session.metadata?.order_id;
          
          if (orderId) {
            // Update order status to paid
            await connection.execute(
              "UPDATE res_orders SET payment_status = 2, order_status = 7 WHERE order_id = ?",
              [orderId]
            );

            // Insert transaction record
            const [transactionResult] = await connection.execute(
              "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
              [
                orderId,
                session.metadata.user_id,
                session.currency.toUpperCase(),
                session.amount_total / 100,
                1, // exchange_rate
                2, // payment_status (paid)
                3, // payment_method (Stripe)
                session.id,
                JSON.stringify(session)
              ]
            );

            const transactionId = transactionResult.insertId;

            // Update order with transaction ID
            await connection.execute(
              "UPDATE res_orders SET transaction_id = ? WHERE order_id = ?",
              [transactionId, orderId]
            );

            // Process the order
            await activateOrder(orderId, session.metadata.user_id, connection);

            // Send payment success notification
            try {
              await NotificationService.createNotification(
                "stripe_payment_webhook",
                "Stripe Payment Received via Webhook",
                `Stripe payment of ${session.amount_total / 100} ${session.currency.toUpperCase()} received for order #${orderId} via webhook`,
                {
                  session_id: session.id,
                  order_id: orderId,
                  user_id: session.metadata.user_id,
                  amount: session.amount_total / 100,
                  currency: session.currency.toUpperCase(),
                  payment_method: "Stripe",
                  transaction_id: transactionId,
                  webhook_source: true
                },
                true
              );
            } catch (notificationError) {
              // Don't fail the webhook processing if notification fails
              await ErrorLogger.logError({
                errorType: 'notification',
                errorLevel: 'error',
                errorMessage: notificationError.message,
                errorDetails: notificationError,
                userId: session.metadata.user_id,
                endpoint: '/stripe/webhook',
                additionalData: {
                  order_id: orderId,
                  session_id: session.id
                }
              });
            }
          }
        }
        break;

      case 'payment_intent.succeeded':
        // Handle successful payment intent
        const paymentIntent = event.data.object;
        console.log('PaymentIntent succeeded:', paymentIntent.id);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    await connection.commit();
    res.json({ received: true });

  } catch (error) {
    await connection.rollback();
    
    await ErrorLogger.logError({
      errorType: 'webhook',
      errorLevel: 'error',
      errorMessage: 'Stripe webhook processing error',
      errorDetails: error,
      endpoint: '/stripe/webhook',
      additionalData: {
        event_type: event.type,
        event_id: event.id
      }
    });

    res.status(500).json({
      status: 'fail',
      message: 'Webhook processing failed'
    });
  } finally {
    connection.release();
  }
}

/**
 * 📋 LIST STRIPE SESSIONS
 * 
 * Returns list of Stripe checkout sessions (admin function)
 */
async function fetchSessions(req, res) {
  try {
    // 🔑 FETCH STRIPE CREDENTIALS: Get API keys from database
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["stripe"]
    );

    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        status: "fail",
        message: "Stripe configuration not found."
      });
    }

    const { secret_key } = paymentGatewayRows[0];

    // Initialize Stripe with database credentials
    const stripe = require("stripe")(secret_key);

    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    return res.status(200).json({
      status: "success",
      data: sessions
    });
  } catch (error) {
    res.status(500).json({
      status: "fail",
      error: error.message
    });
  }
}

module.exports = { createSession, fetchPayment, webhookHandler, fetchSessions };
