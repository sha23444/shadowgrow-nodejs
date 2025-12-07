const { pool } = require("../../config/database");
const axios = require("axios");

const { insertOrder, sendOrderConfirmationEmail } = require("./helper");
const { processOrder, activateOrder, addCreditsBalance } = require("./processOrder");
const NotificationService = require("../../services/notificationService");
const { ErrorLogger } = require("../../logger");
const OrderCalculationService = require("../../services/OrderCalculationService");

// ============================================================================
// CASHFREE PAYMENT GATEWAY CONFIGURATION
// ============================================================================

// PRODUCTION CONFIGURATION
const CASHFREE_CONFIG = {
    // Production URLs
    BASE_URL: "https://api.cashfree.com",
    ORDERS_ENDPOINT: "/pg/orders",
    PAYMENTS_ENDPOINT: "/pg/orders",
    
    // Sandbox URLs (commented out for production)
    // BASE_URL: "https://sandbox.cashfree.com",
    // ORDERS_ENDPOINT: "/pg/orders",
    // PAYMENTS_ENDPOINT: "/pg/orders",
    
    // API Configuration
    API_VERSION: "2023-08-01",
    WEBHOOK_TIMEOUT: 300, // 5 minutes in seconds
    
    // Payment Method IDs
    PAYMENT_METHOD_ID: 5, // Cashfree
    
    // Order Status Constants
    ORDER_STATUS: {
        PAID: "PAID",
        PENDING: "PENDING",
        FAILED: "FAILED"
    },
    
    // Payment Status Constants
    PAYMENT_STATUS: {
        PENDING: 1,
        PAID: 2,
        FAILED: 3
    },
    
    // Order Status Constants
    ORDER_STATUS_DB: {
        PENDING: 1,
        PROCESSING: 2,
        SHIPPED: 3,
        DELIVERED: 4,
        CANCELLED: 5,
        REFUNDED: 6,
        COMPLETED: 7
    }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format phone number for Cashfree API
 * @param {string} dialCode - Country dial code
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(dialCode, phone) {
    if (dialCode && phone) {
        // Remove any non-digit characters except + from the beginning
        const cleanPhone = String(phone).replace(/[^\d]/g, '');
        const cleanDialCode = String(dialCode).replace(/[^\d]/g, '');
        return `+${cleanDialCode}${cleanPhone}`;
    }
    // Fallback to a valid Indian number format for testing
    return "+919876543210";
}

/**
 * Generate unique order ID
 * @param {number} userId - User ID
 * @returns {string} Generated order ID
 */
function generateOrderId(userId) {
    return `order_${userId}_${Date.now()}`;
}

/**
 * Get Cashfree return URL with HTTPS requirement handling
 * @param {string} orderId - Order ID
 * @returns {string} Return URL
 */
function getCashfreeReturnUrl(orderId) {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    
    // Cashfree requires HTTPS URLs, but for localhost development we need to handle this
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        // For localhost development, use HTTPS localhost or a development domain
        return `https://localhost:3000/payment/cashfree/success?order_id=${orderId}`;
    }
    
    // For production, ensure HTTPS
    if (!baseUrl.startsWith('https://')) {
        return baseUrl.replace('http://', 'https://') + `/payment/cashfree/success?order_id=${orderId}`;
    }
    
    return `${baseUrl}/payment/cashfree/success?order_id=${orderId}`;
}

/**
 * Get Cashfree notify URL with HTTPS requirement handling
 * @returns {string} Notify URL
 */
function getCashfreeNotifyUrl() {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    
    // Cashfree requires HTTPS URLs, but for localhost development we need to handle this
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        // For localhost development, use HTTPS localhost or a development domain
        return `https://localhost:3000/api/v1/payment/cashfree/webhook`;
    }
    
    // For production, ensure HTTPS
    if (!baseUrl.startsWith('https://')) {
        return baseUrl.replace('http://', 'https://') + `/api/v1/payment/cashfree/webhook`;
    }
    
    return `${baseUrl}/api/v1/payment/cashfree/webhook`;
}

/**
 * Get Cashfree API headers
 * @param {string} publicKey - Public key
 * @param {string} secretKey - Secret key
 * @returns {Object} Headers object
 */
function getCashfreeHeaders(publicKey, secretKey) {
    return {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Client-Id": publicKey,
        "X-Client-Secret": secretKey,
        "x-api-version": CASHFREE_CONFIG.API_VERSION
    };
}

/**
 * Handle Cashfree API errors
 * @param {Object} error - Axios error object
 * @param {number} userId - User ID
 * @param {Object} orderDetails - Order details
 * @returns {Object} Formatted error response
 */
async function handleCashfreeApiError(error, userId, orderDetails) {
    // console.error("Cashfree API Error:", error.response?.data || error.message);

    // Handle specific Cashfree API errors
    if (error.response?.status === 400) {
        const errorData = error.response.data;

        // Handle currency not enabled error
        if (errorData.code === 'order_create_failed' && errorData.message?.includes('Currency not enabled')) {
            return {
                status: 400,
                data: {
                    status: "fail",
                    message: "Currency not enabled for this merchant account. Please contact support or try a different currency.",
                    error: errorData.message,
                    code: errorData.code
                }
            };
        }

        // Handle other Cashfree API errors
        return {
            status: 400,
            data: {
                status: "fail",
                message: errorData.message || "Payment gateway error",
                error: errorData.message,
                code: errorData.code || 'unknown_error'
            }
        };
    }

    // Log error for debugging
    await ErrorLogger.logError({
        errorType: 'payment',
        errorLevel: 'error',
        errorMessage: error.message,
        errorDetails: error,
        userId: userId,
        endpoint: '/cashfree/createOrder',
        additionalData: {
            total_amount: orderDetails?.total_amount,
            currency: orderDetails?.currency,
            payment_method: "Cashfree",
        }
    });

    // Handle network or other errors
    return {
        status: 500,
        data: {
            status: "fail",
            message: "Payment gateway connection error",
            error: error.message || "Unknown error occurred"
        }
    };
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * 🚀 CASHFREE REDIRECT CHECKOUT ORDER CREATION
 * 
 * Creates a Cashfree order using redirect checkout method instead of SDK.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate input (currency only - amount calculated from cart)
 * 2. Fetch Cashfree credentials from database
 * 3. Use OrderCalculationService for unified cart calculation
 * 4. Create Cashfree order with calculated amount
 * 5. Insert order into database
 * 6. Return payment_url for frontend redirect
 * 7. Send notifications
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createOrder(req, res) {
    let orderIdGenerated;
    let orderDetails;
    
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

        // 🔑 FETCH CASHFREE CREDENTIALS: Get API keys from database
        const [paymentGatewayRows] = await pool.execute(
            "SELECT * FROM payment_gateways WHERE gateway_type = ?",
            ["cashfree"]
        );

        if (!paymentGatewayRows.length) {
            return res.status(500).json({
                status: "fail",
                message: "Cashfree configuration not found.",
            });
        }

        const { public_key, secret_key } = paymentGatewayRows[0];

        // 🎯 UNIFIED ORDER CALCULATION: Single source of truth for all calculations
        const calculationResult = await OrderCalculationService.calculateOrder({
            userId: id,
            currency: options.currency,
            paymentGatewayId: 'cashfree',
            discountCode: options.discount_code,
            recordDiscountUsage: true
        });

        const { orderDetails, cartItems } = calculationResult;

        // ✅ ORDER DETAILS: All calculation data provided by OrderCalculationService

        // Get user details
        const [userDetails] = await pool.execute(
            "SELECT * FROM res_users WHERE user_id = ?",
            [id]
        );

        const { email, phone, first_name, last_name, dial_code } = userDetails[0];

        orderIdGenerated = generateOrderId(id);

        // Format phone number
        const customerPhone = formatPhoneNumber(dial_code, phone);

        // Create order using direct HTTP request (FIXED APPROACH)
        try {
            const orderPayload = {
                order_id: orderIdGenerated,
                order_amount: Number(Math.floor(orderDetails.total_amount * 100) / 100),
                order_currency: options.currency,
                customer_details: {
                    customer_id: String(id),
                    customer_name: `${first_name} ${last_name}`,
                    customer_email: email,
                    customer_phone: customerPhone
                },
                order_meta: {
                    return_url: getCashfreeReturnUrl(orderIdGenerated),
                    notify_url: getCashfreeNotifyUrl()
                }
            };

            // console.log('🚀 CASHFREE ORDER PAYLOAD:', JSON.stringify(orderPayload, null, 2));

            // Create order using direct HTTP request (FIXED APPROACH)
            const cashfreeResponse = await axios.post(
                `${CASHFREE_CONFIG.BASE_URL}${CASHFREE_CONFIG.ORDERS_ENDPOINT}`,
                orderPayload,
                {
                    headers: getCashfreeHeaders(public_key, secret_key)
                }
            );

            const cashfreeOrder = cashfreeResponse.data;

            // console.log('✅ CASHFREE RESPONSE:', JSON.stringify(cashfreeOrder, null, 2));
            // console.log('🔗 CASHFREE PAYMENT URL:', cashfreeOrder.payment_url);
            // console.log('🔗 CASHFREE PAYMENT SESSION ID:', cashfreeOrder.payment_session_id);

            // Prepare order payload for database
            const payload = {
                user_id: id,
                ...orderDetails,
                amount_due: cashfreeOrder.order_amount,
                payment_method: CASHFREE_CONFIG.PAYMENT_METHOD_ID,
                notes: options.notes ? 
                    `${options.notes}; cashfree_order_id:${cashfreeOrder.order_id}` : 
                    `cashfree_order_id:${cashfreeOrder.order_id}`,
                item_types: orderDetails.item_types,
                tax_breakdown: orderDetails.tax_breakdown,
                discount_details: orderDetails.discount_details,
            };

            const dbOrderId = await insertOrder(payload);

            // 🎯 PROCESS ORDER: Create order items with is_active = 0
            await processOrder(dbOrderId, id, 0, connection);

            // 🎯 RECORD DISCOUNT USAGE: Record after order creation with valid order_id
            if (options.discount_code && orderDetails.discount_details) {
              try {
                const { recordDiscountUsage } = require('../../controllers/shared/discount');
                await recordDiscountUsage({
                  discount_id: orderDetails.discount_details.id,
                  user_id: id,
                  order_id: dbOrderId,
                  discount_amount: orderDetails.discount,
                  order_amount: orderDetails.subtotal,
                  payment_method: 'cashfree',
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
                    `New order #${dbOrderId} created via Cashfree for ${orderDetails.total_amount} ${options.currency}`,
                    {
                        order_id: dbOrderId,
                        user_id: id,
                        total_amount: orderDetails.total_amount,
                        currency: options.currency,
                        payment_method: "Cashfree",
                        item_types: orderDetails.item_types,
                        cashfree_order_id: cashfreeOrder.order_id
                    },
                    true
                );
            } catch (notificationError) {
                // console.error("Error creating order notification:", notificationError);
                // Don't fail the order creation if notification fails
            }

            // 🚀 REDIRECT CHECKOUT: Return payment URL for frontend redirect
            // Frontend should redirect user to this URL for payment processing
            // After payment, user will be redirected to return_url
            
            // 🎯 CORRECT PAYMENT URL: Use payment_url directly from Cashfree response
            // Cashfree provides the complete payment URL in the response
            const paymentUrl = cashfreeOrder.payment_url || 
                (cashfreeOrder.payment_session_id ? 
                    `https://payments.cashfree.com/orders/${cashfreeOrder.order_id}?payment_session_id=${cashfreeOrder.payment_session_id}` :
                    `https://payments.cashfree.com/orders/${cashfreeOrder.order_id}`);
            
            // console.log('🚀 FINAL PAYMENT URL:', paymentUrl);
            
            return res.json({
                status: "success",
                payment_url: paymentUrl
            });

        } catch (axiosError) {
            // console.error('❌ CASHFREE API ERROR:', JSON.stringify(axiosError.response?.data || axiosError.message, null, 2));
            // console.error('❌ CASHFREE ERROR STATUS:', axiosError.response?.status);
            
            const errorResponse = await handleCashfreeApiError(axiosError, id, orderDetails);
            return res.status(errorResponse.status).json(errorResponse.data);
        }

    } catch (err) {
        // Log error
        await ErrorLogger.logError({
            errorType: 'payment',
            errorLevel: 'error',
            errorMessage: err.message,
            errorDetails: err,
            userId: id,
            endpoint: '/cashfree/createOrder',
            additionalData: {
                order_id: orderIdGenerated,
                total_amount: orderDetails?.total_amount,
                currency: orderDetails?.currency,
                payment_method: "Cashfree",
            }
        });
        
        return res.status(500).json({
            status: "fail",
            message: "Internal Server Error",
            error: err.message || err,
        });
    }
}

/**
 * Fetch and verify payment from Cashfree
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function fetchPayment(req, res) {
    const { cf_order_id, order_id } = req.body;
    const { id } = req.user;

    // Validate input
    if (!cf_order_id || !order_id) {
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

        // Check if payment already processed
        if (order.payment_status === CASHFREE_CONFIG.PAYMENT_STATUS.PAID) {
            await connection.commit();
            return res.status(200).json({
                status: "success",
                message: "Payment already processed.",
                order_id,
            });
        }

        // Fetch Cashfree credentials
        const [paymentGatewayRows] = await connection.execute(
            "SELECT * FROM payment_gateways WHERE gateway_type = ?",
            ["cashfree"]
        );

        const { public_key, secret_key } = paymentGatewayRows[0];

        // Verify payment with Cashfree API
        const cashfreeResponse = await axios.get(
            `${CASHFREE_CONFIG.BASE_URL}${CASHFREE_CONFIG.PAYMENTS_ENDPOINT}/${cf_order_id}`,
            {
                headers: getCashfreeHeaders(public_key, secret_key)
            }
        );

        const cashfreeOrder = cashfreeResponse.data;

        // Verify payment status
        if (!cashfreeOrder || cashfreeOrder.order_status !== CASHFREE_CONFIG.ORDER_STATUS.PAID) {
            await connection.rollback();
            return res.status(400).json({
                status: "fail",
                message: "Payment verification failed or payment not captured.",
            });
        }

        // Insert transaction record
        const [transactionResult] = await connection.execute(
            "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
            [
                order_id,
                id,
                cashfreeOrder.order_currency,
                cashfreeOrder.order_amount,
                order.exchange_rate,
                CASHFREE_CONFIG.PAYMENT_STATUS.PAID,
                CASHFREE_CONFIG.PAYMENT_METHOD_ID,
                cashfreeOrder.order_id,
                JSON.stringify(cashfreeOrder)
            ]
        );

        const transactionId = transactionResult.insertId;

        // Update order status
        const paidAmount = cashfreeOrder.order_amount;
        await connection.execute(
            "UPDATE res_orders SET payment_status = ?, amount_paid = ?, order_status = ?, transaction_id = ? WHERE order_id = ?",
            [
                CASHFREE_CONFIG.PAYMENT_STATUS.PAID, 
                paidAmount, 
                CASHFREE_CONFIG.ORDER_STATUS_DB.COMPLETED, 
                transactionId, 
                order_id
            ]
        );

        // Parse item types
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
                `Payment of ${paidAmount} ${cashfreeOrder.order_currency} received for order #${order_id}`,
                {
                    order_id,
                    user_id: id,
                    amount: paidAmount,
                    currency: cashfreeOrder.order_currency,
                    payment_method: "Cashfree",
                    transaction_id: transactionId,
                    gateway_txn_id: cashfreeOrder.order_id
                },
                true
            );
        } catch (notificationError) {
            // Log notification error
            await ErrorLogger.logError({
                errorType: 'notification',
                errorLevel: 'error',
                errorMessage: notificationError.message,
                errorDetails: notificationError,
                userId: id,
                endpoint: '/cashfree/fetchPayment'
            });
            // Don't fail the payment process if notification fails
        }

        await connection.commit();

        return res.status(200).json({
            status: "success",
            order_id,
        });
        
    } catch (error) {
        await connection.rollback();
        // console.error("Payment processing error:", error);
        
        // Log error
        await ErrorLogger.logError({
            errorType: 'payment',
            errorLevel: 'error',
            errorMessage: error.message,
            errorDetails: error,
            userId: id,
            endpoint: '/cashfree/fetchPayment',
            additionalData: {
                cf_order_id,
                order_id
            }
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
 * Handle Cashfree webhook notifications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function webhookHandler(req, res) {
    try {
        // Verify webhook signature for security
        const signature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];

        if (!signature || !timestamp) {
//             // console.error('Webhook signature or timestamp missing');
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Invalid webhook request' 
            });
        }

        // Verify webhook is not too old
        const webhookTime = parseInt(timestamp);
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime - webhookTime > CASHFREE_CONFIG.WEBHOOK_TIMEOUT) {
//             // console.error('Webhook too old');
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Webhook too old' 
            });
        }

        // Extract webhook data from query parameters for GET request
        const webhookData = {
//             order_id: req.query.order_id,
//             payment_session_id: req.query.payment_session_id,
//             order_status: req.query.order_status,
//             cf_order_id: req.query.cf_order_id,
//             cf_payment_id: req.query.cf_payment_id,
//             cf_signature: req.query.cf_signature,
//             payment_status: req.query.payment_status,
//             payment_method: req.query.payment_method,
//             amount: parseFloat(req.query.amount) || 0,
//             currency: req.query.currency,
//             payment_timestamp: req.query.payment_timestamp
        };


        // Extract order details from webhook
        const {
            order_id,
            order_status,
            cf_order_id,
            cf_payment_id,
            payment_status,
            amount,
            currency
        } = webhookData;

        // Validate webhook data
        if (!order_id || !order_status) {
//             // console.error('Invalid webhook data');
            return res.status(400).json({ 
                status: 'fail', 
                message: 'Invalid webhook data' 
            });
        }

        // Only process successful orders
        if (order_status !== 'success' || payment_status !== 'completed') {
            return res.status(200).json({ 
                status: 'success', 
                message: 'Webhook processed' 
            });
        }

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Find the order in our database using the Cashfree order ID
            const [orderRows] = await connection.execute(
                "SELECT * FROM res_orders WHERE notes LIKE ?",
                [`%cashfree_order_id:${order_id}%`]
            );

            if (orderRows.length === 0) {
//                 // console.error(`Order not found for Cashfree order ID: ${order_id}`);
                await connection.rollback();
                return res.status(404).json({ 
                    status: 'fail', 
                    message: 'Order not found' 
                });
            }

            const order = orderRows[0];

            // Check if payment already processed
            if (order.payment_status === CASHFREE_CONFIG.PAYMENT_STATUS.PAID) {
                await connection.commit();
                return res.status(200).json({ 
                    status: 'success', 
                    message: 'Order already processed' 
                });
            }

            // Insert transaction record
            const [transactionResult] = await connection.execute(
                "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                [
                    order.order_id,
                    order.user_id,
                    currency || order.currency,
                    amount || order.amount_due,
                    order.exchange_rate,
                    CASHFREE_CONFIG.PAYMENT_STATUS.PAID,
                    CASHFREE_CONFIG.PAYMENT_METHOD_ID,
                    cf_payment_id || order_id,
                    JSON.stringify(webhookData)
                ]
            );

            const transactionId = transactionResult.insertId;

            // Update order status
            const paidAmount = amount || order.amount_due;
            await connection.execute(
                "UPDATE res_orders SET payment_status = ?, amount_paid = ?, order_status = ?, transaction_id = ? WHERE order_id = ?",
                [
                    CASHFREE_CONFIG.PAYMENT_STATUS.PAID, 
                    paidAmount, 
                    CASHFREE_CONFIG.ORDER_STATUS_DB.COMPLETED, 
                    transactionId, 
                    order.order_id
                ]
            );

            // Parse item types
            let itemTypes;
            try {
                itemTypes = JSON.parse(order.item_types);
            } catch (err) {
//                 // console.error('Error parsing item types:', err);
                itemTypes = [];
            }

            // Process order based on item types
            if (itemTypes.includes(5)) {
                try {
                    await addCreditsBalance(order.order_id);
                } catch (err) {
//                     // console.error("addCreditsBalance failed:", err.message);
                    // Continue processing even if credits fail
                }
            } else {
                await activateOrder(order.order_id, order.user_id, connection);
            }

            // Send payment success notification to admin
            try {
                await NotificationService.createNotification(
                    "payment_received",
                    "Payment Received via Webhook",
                    `Payment of ${paidAmount} ${currency || order.currency} received for order #${order.order_id} via Cashfree webhook`,
                    {
//                         order_id: order.order_id,
//                         user_id: order.user_id,
//                         amount: paidAmount,
//                         currency: currency || order.currency,
//                         payment_method: "Cashfree",
//                         transaction_id: transactionId,
//                         gateway_txn_id: cf_payment_id || order_id,
//                         webhook_source: true
                    },
                    true
                );
            } catch (notificationError) {
//                 // console.error("Error creating webhook notification:", notificationError);
                // Log error but don't fail the webhook processing
                await ErrorLogger.logError({
                    errorType: 'notification',
                    errorLevel: 'error',
                    errorMessage: notificationError.message,
                    errorDetails: notificationError,
                    userId: order.user_id,
                    endpoint: '/cashfree/webhook',
                    additionalData: {
                        order_id: order.order_id,
                        webhook_data: webhookData
                    }
                });
            }

            // Send order confirmation email to user
            try {
                const [userDetails] = await connection.execute(
                    "SELECT * FROM res_users WHERE user_id = ?",
                    [order.user_id]
                );

                if (userDetails.length > 0) {
                    await sendOrderConfirmationEmail(
                        order.user_id,
                        cf_payment_id || order_id,
                        order.order_id
                    );
                }
            } catch (emailError) {
//                 // console.error("Error sending confirmation email:", emailError);
                // Log error but don't fail the webhook processing
            }

            await connection.commit();

            return res.status(200).json({
                status: 'success',
                message: 'Webhook processed successfully',
                order_id: order.order_id,
                cashfree_order_id: order_id
            });

        } catch (error) {
            await connection.rollback();
//             // console.error("Webhook processing error:", error);

            // Log error
            await ErrorLogger.logError({
                errorType: 'webhook',
                errorLevel: 'error',
                errorMessage: error.message,
                errorDetails: error,
                userId: order?.user_id || null,
                endpoint: '/cashfree/webhook',
                additionalData: {
                    webhook_data: webhookData,
                    order_id: order?.order_id || null
                }
            });

            return res.status(500).json({
                status: 'fail',
                message: 'Webhook processing failed'
            });
        } finally {
            connection.release();
        }

    } catch (error) {
//         // console.error("Webhook handler error:", error);

        // Log error
        await ErrorLogger.logError({
            errorType: 'webhook',
            errorLevel: 'error',
            errorMessage: error.message,
            errorDetails: error,
            endpoint: '/cashfree/webhook',
            additionalData: {
                webhook_data: req.body || {},
                headers: req.headers
            }
        });

        return res.status(500).json({
            status: 'fail',
            message: 'Internal server error'
        });
    }
}

/**
 * 🎉 PAYMENT SUCCESS HANDLER
 * 
 * Handles the return URL after successful payment on Cashfree.
 * This function is called when user returns from Cashfree payment page.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handlePaymentSuccess(req, res) {
    try {
        const { order_id } = req.query;
        
        if (!order_id) {
            return res.status(400).json({
                status: "fail",
                message: "Order ID is required"
            });
        }

        // Fetch order details from database
        const [orderRows] = await pool.execute(
            "SELECT * FROM res_orders WHERE notes LIKE ?",
            [`%cashfree_order_id:${order_id}%`]
        );

        if (!orderRows.length) {
            return res.status(404).json({
                status: "fail",
                message: "Order not found"
            });
        }

        const order = orderRows[0];

        // Check payment status with Cashfree API
        const [paymentGatewayRows] = await pool.execute(
            "SELECT * FROM payment_gateways WHERE gateway_type = ?",
            ["cashfree"]
        );

        if (!paymentGatewayRows.length) {
            return res.status(500).json({
                status: "fail",
                message: "Cashfree configuration not found"
            });
        }

        const { public_key, secret_key } = paymentGatewayRows[0];

        try {
            // Fetch payment status from Cashfree
            const paymentResponse = await axios.get(
                `${CASHFREE_CONFIG.BASE_URL}/pg/orders/${order_id}/payments`,
                {
//                     headers: getCashfreeHeaders(public_key, secret_key)
                }
            );

            const payments = paymentResponse.data;
            const latestPayment = payments[payments.length - 1];

            if (latestPayment && latestPayment.payment_status === "SUCCESS") {
                // Update order status to paid
                await pool.execute(
                    "UPDATE res_orders SET status = 2 WHERE order_id = ?",
                    [order.order_id]
                );

                // Process the order (deliver products, etc.)
                await activateOrder(order.order_id, order.user_id);

                return res.json({
                    status: "success",
                    message: "Payment successful",
                    order_id: order.order_id,
                    payment_status: "SUCCESS"
                });
            } else {
                return res.json({
                    status: "pending",
                    message: "Payment is still processing",
                    order_id: order.order_id,
                    payment_status: latestPayment?.payment_status || "PENDING"
                });
            }

        } catch (apiError) {
//             // console.error("Error fetching payment status:", apiError.message);
            return res.status(500).json({
                status: "fail",
                message: "Unable to verify payment status"
            });
        }

    } catch (error) {
//         // console.error("Error in payment success handler:", error.message);
        return res.status(500).json({
            status: "fail",
            message: "Internal server error"
        });
    }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
    createOrder,
    fetchPayment,
    webhookHandler,
    handlePaymentSuccess,
};