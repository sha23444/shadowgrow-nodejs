const axios = require("axios");
const {
    pool
} = require("../../config/database");
const {
    insertOrder
} = require("./helper");
const {
    processOrder,
    activateOrder,
    addCreditsBalance
} = require("./processOrder");
const NotificationService = require("../../services/notificationService");
const {
    ErrorLogger
} = require("../../logger");
const OrderCalculationService = require("../../services/OrderCalculationService");

const show = (...args) => console.log("[Coinflexpay]", ...args);
const cshow = (label, data) =>
    console.dir({
        [label]: data
    }, {
        depth: null
    });


/**
 * 🚀 COINFLEXPAY ORDER CREATION
 * 
 * Creates a coinflexpay order using the unified OrderCalculationService.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate input (currency only - amount calculated from cart)
 * 2. Fetch coinflexpay credentials from database
 * 3. Use OrderCalculationService for unified cart calculation
 * 4. Create coinflexpay order with calculated amount
 * 5. Insert order into database
 * 6. Send notifications
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createOrder(req, res) {
    try {
        // Input validation
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                status: "fail",
                message: "Authentication required"
            });
        }

        const {
            currency = 'USD', discount_code
        } = req.body;
        const {
            id
        } = req.user; // Get user ID from authenticated request

    
        // Only USD currency is allowed
        if (currency !== 'USD') {
            const response = {
                status: "fail",
                message: "Only USD currency is allowed",
                showCurrencyDialog: true
            };
            return res.status(400).json(response);
        }

        // 🎯 UNIFIED ORDER CALCULATION: Single source of truth for all calculations
        const calculationResult = await OrderCalculationService.calculateOrder({
            userId: id,
            currency: currency,
            paymentGatewayId: 'coinflexpay',
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

        // Reject zero amount orders - should use free order endpoint instead
        if (orderDetails.amount_due === 0) {
            return res.status(400).json({
                status: "fail",
                message: "Zero amount orders should use the free order endpoint",
                redirect_to: "/api/payment/free-order/process"
            });
        }

        // Validate APP_BASE_URL
        if (!process.env.APP_BASE_URL) {
            return res.status(500).json({
                status: "fail",
                message: "Application base URL not configured"
            });
        }

        // Prepare payload for database insertion
        const payload = {
            user_id: id,
            ...orderDetails,
            amount_due: orderDetails.amount_due,
            payment_method: 8, // Coin Flex Pay
            notes: null,
            item_types: orderDetails.item_types // Already JSON stringified by service,
        };

        let orderId;
        try {
            orderId = await insertOrder(payload);
        } catch (dbError) {
            return res.status(500).json({
                status: "fail",
                message: "Failed to create order in database",
                error: dbError.message
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
              payment_method: 'coinflexpay',
              order_type: '2', // Assuming subscription packages, adjust as needed
              package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
            });
          } catch (discountError) {
            // Log but don't fail the order if discount recording fails
            // Log discount recording error silently - don't fail order
          }
        }

        // Get customer mobile from user with proper validation
        const [user] = await pool.execute(
            "SELECT phone FROM res_users WHERE user_id = ?",
            [id]
        );

        if (!user || !user[0]) {
            return res.status(404).json({
                status: "fail",
                message: "User not found"
            });
        }

        // Format phone number properly with country code
        let customer_mobile = user[0].phone;
        if (!customer_mobile) {
            customer_mobile = "+1234567890"; // Default fallback with proper format
        } else if (!customer_mobile.startsWith('+')) {
            customer_mobile = `+${customer_mobile}`; // Add country code if missing
        }

        // Get Coinflexpay credentials from payment options
        const [paymentOptions] = await pool.execute(
            "SELECT secret_key FROM payment_gateways WHERE gateway_type = ?",
            ['coinflexpay']
        );

        if (!paymentOptions.length) {
            const response = {
                status: "fail",
                message: "Coinflexpay configuration not found",
            };
            return res.status(500).json(response);
        }

        const user_token = paymentOptions[0].secret_key;
        
        // Validate user_token
        if (!user_token) {
            return res.status(500).json({
                status: "fail",
                message: "CoinFlexPay user token not configured"
            });
        }

        // Generate unique order ID for Coinflexpay (combine internal order ID with timestamp)
        const coinflexpayOrderId = `PAY_${orderId}_${Date.now()}`;

        // Prepare request payload with unique order ID for Coinflexpay
        const requestPayload = {
            customer_mobile: customer_mobile,
            user_token: user_token,
            amount: orderDetails.amount_due.toString(),
            order_id: coinflexpayOrderId, // Use unique ID for Coinflexpay
            redirect_url: `${process.env.APP_BASE_URL}/payment/coinflexpay/success?id=${orderId}`
        };

        // Call Coinflexpay API with increased timeout and retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                response = await axios.post(
                    `https://coinflexpay.com/api/create-binance-order/`,
                    new URLSearchParams(requestPayload).toString(), {
                        timeout: 30000, // Increased to 30 seconds
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                break; // Success, exit retry loop
            } catch (error) {
                retryCount++;
                
                if (retryCount >= maxRetries) {
                    throw error; // Re-throw if all retries failed
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
        }

        // update  order with payment_url
        await pool.execute(
            "UPDATE res_orders SET notes = ? WHERE order_id = ?",
            [response.data.result.orderId, orderId]
        );

        // Handle response - Updated to match actual CoinFlexPay API response structure
        if (response.data && response.data.status === true) {
            // Send order creation notification to admin
            try {
                await NotificationService.createNotification(
                    "coinflexpay_order_created",
                    "Coinflexpay Order Created",
                    `Coinflexpay order created for amount ${orderDetails.amount_due} USD`, {
                        order_id: orderId,
                        amount: orderDetails.amount_due,
                        currency: 'USD',
                        payment_method: "Coinflexpay",
                        payment_url: response.data.payment_url || response.data.result?.payment_url,
                        customer_mobile: customer_mobile
                    },
                    true
                );
            } catch (notificationError) {
                // Don't fail the order creation if notification fails
            }

            const successResponse = {
                status: "success",
                message: 'Order created successfully via Coinflexpay',
                data: {
                    paymentUrl: response.data.result.payment_url,
                }
            };
            res.json(successResponse);
        } else {
            const failResponse = {
                status: "fail",
                message: response.data?.message || 'Failed to create order via Coinflexpay',
                error: response.data
            };
            res.status(400).json(failResponse);
        }

    } catch (error) {

        // Log error
        await ErrorLogger.logPaymentError(error, null, null, req);

        // Handle different types of errors gracefully
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            const timeoutResponse = {
                status: "fail",
                message: 'Coinflexpay service is currently unavailable. Please try again later.',
                error: 'Service timeout - please retry'
            };
            res.status(408).json(timeoutResponse);
        } else if (error.response) {
            const apiErrorResponse = {
                status: "fail",
                message: 'Coinflexpay API error',
                error: error.response.data
            };
            res.status(error.response.status).json(apiErrorResponse);
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            const connectionErrorResponse = {
                status: "fail",
                message: 'Coinflexpay service is temporarily unavailable',
                error: 'Service connection failed'
            };
            res.status(503).json(connectionErrorResponse);
        } else {
            const internalErrorResponse = {
                status: "fail",
                message: 'Internal server error',
                error: error.message
            };
            res.status(500).json(internalErrorResponse);
        }
    }
}

/**
 * Check Payment Status - Coinflexpay API
 */
async function checkPaymentStatus(req, res) {
    try {
        const {
            orderId
        } = req.body;

        if (!orderId) {
            const response = {
                status: "fail",
                message: 'Order ID is required'
            };
            return res.status(400).json(response);
        }

       // get notes from order Id
        const [paymentIdData] = await pool.execute(
            "SELECT notes FROM res_orders WHERE order_id = ?",
            [orderId]
        );

        if (!paymentIdData.length) {
            const response = {
                status: "fail",
                message: 'Order not found'
            };
            return res.status(400).json(response);
        }

        const paymentId = paymentIdData[0].notes;
        const internalOrderId = orderId;

        if (!paymentId) {
            const response = {
                status: "fail",
                message: 'Order not found'
            };
            return res.status(400).json(response);
        }

        show("Checking Coinflexpay payment status", {
            orderId,
            paymentId
        });

        // get credentials from database
        const [paymentOptions] = await pool.execute(
            "SELECT secret_key FROM payment_gateways WHERE gateway_type = ?",
            ['coinflexpay']
        );

        if (!paymentOptions.length) {
            const response = {
                status: "fail",
                message: "Coinflexpay configuration not found",
            };
            return res.status(500).json(response);
        }

        const user_token = paymentOptions[0].secret_key;

        // Call Coinflexpay API to check payment status with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        
   
        while (retryCount < maxRetries) {
            try {
                response = await axios.post(
                    `https://coinflexpay.com/api/payment-status/${paymentId}/`,
                    new URLSearchParams({
                        user_token: user_token
                    }).toString(),
                    {
                        timeout: 30000, // Increased to 30 seconds
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );
                
                cshow("coinflexpayStatusResponse", response.data);
                
                
                break; // Success, exit retry loop
            } catch (error) {
                retryCount++;
                
                
                if (retryCount >= maxRetries) {
                    throw error; // Re-throw if all retries failed
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
        }

        // Validate response structure
        if (!response.data) {
            return res.status(400).json({
                status: "fail",
                message: 'No response data from Coinflexpay',
                error: 'Empty response'
            });
        }


        const { verified, payload: paymentPayload, failureMessage } = normalizeCoinflexpayResponse(response.data);

        if (!verified) {
            show("Coinflexpay payment not verified", response.data);
            return res.status(400).json({
                status: "fail",
                message: failureMessage || 'Payment not verified or unexpected response format',
                error: response.data
            });
        }

        // Payment is verified - process the order
        try {
            cshow("coinflexpayPaymentPayload", paymentPayload);
            await processOrderInternally(internalOrderId, paymentPayload);

            const successResponse = {
                status: "success",
                message: 'Payment verified and order processed successfully',
                data: {
                    coinflexpayOrderId: paymentId,
                    internalOrderId: internalOrderId,
                    amount: paymentPayload.amount,
                    status: paymentPayload.status,
                    transactionId: paymentPayload.transaction_id,
                    paymentNote: paymentPayload.payment_note,
                    createdAt: paymentPayload.created_at,
                    verifiedAt: paymentPayload.verified_at,
                    orderProcessed: true
                }
            };
            
            return res.json(successResponse);
        } catch (orderError) {
            return res.status(500).json({
                status: "fail",
                message: 'Payment verified but order processing failed',
                error: orderError.message
            });
        }

    } catch (error) {
        // Log error
        await ErrorLogger.logPaymentError(error, null, null, req);

        // Handle different types of errors with early returns
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            return res.status(408).json({
                status: "fail",
                message: 'Coinflexpay service is currently unavailable. Please try again later.',
                error: 'Service timeout - please retry'
            });
        }

        if (error.response) {
            return res.status(error.response.status).json({
                status: "fail",
                message: 'Coinflexpay API error',
                error: error.response.data
            });
        }

        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                status: "fail",
                message: 'Coinflexpay service is temporarily unavailable',
                error: 'Service connection failed'
            });
        }

        // Generic internal error
        return res.status(500).json({
            status: "fail",
            message: 'Internal server error',
            error: error.message
        });
    }
}

function normalizeCoinflexpayResponse(data) {
    if (!data || typeof data !== "object") {
        return {
            verified: false,
            payload: null,
            failureMessage: "Empty response data"
        };
    }

    const paymentSection = data.payment || data.result || {};
    const transactionDetails = data.transaction_details || {};
    const statusCandidates = [
        paymentSection.status,
        data.status,
        data.payment_status,
        transactionDetails.status
    ].filter(Boolean);

    const normalizedStatus = (statusCandidates[0] || "").toString().toLowerCase();

    const isSuccessFlag = typeof data.success === "boolean" ? data.success : null;
    const isStatusVerified = normalizedStatus === "verified";
    const isExplicitVerified = data.payment_verified === true || data.is_verified === true;

    const verified = Boolean(
        isStatusVerified ||
        isExplicitVerified ||
        isSuccessFlag === true
    );

    const payload = {
        status: normalizedStatus || (verified ? "verified" : "pending"),
        amount: paymentSection.amount ?? data.amount ?? transactionDetails.amount ?? null,
        transaction_id: paymentSection.transaction_id || data.transaction_id || transactionDetails.transaction_id || null,
        order_id: paymentSection.order_id || data.order_id || transactionDetails.order_id || null,
        payment_note: paymentSection.payment_note || data.payment_note || data.verification_note || transactionDetails.note || null,
        created_at: paymentSection.created_at || data.created_at || null,
        verified_at: paymentSection.verified_at || transactionDetails.transaction_time || null,
        raw_response: data
    };

    return {
        verified,
        payload,
        failureMessage: verified ? null : (data.message || paymentSection.message || null)
    };
}

/**
 * Internal function to process order after payment verification
 */
async function processOrderInternally(orderId, paymentResult) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Check if order exists and get user ID from it
        const [existingOrder] = await connection.execute(
            "SELECT * FROM res_orders WHERE order_id = ?",
            [orderId]
        );

        if (existingOrder.length === 0) {
            throw new Error("Invalid order");
        }

        const order = existingOrder[0];
        const userId = order.user_id; // Get user ID from the order

        // If payment already processed
        if (order.payment_status === 2) {
            await connection.commit();
            return {
                message: "Payment already processed"
            };
        }

        // Validate and extract payment details with fallbacks
        const paymentAmount = paymentResult.amount;
        const utr = paymentResult.order_id;

        // Debug logging to see actual paymentResult structure

        // Validate required fields
        if (!paymentAmount) {
            throw new Error("Payment amount is required");
        }

        // Insert into transactions
        const [transactionResult] = await connection.execute(
            "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, gateway_txn_id, gateway_response, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
            [
                orderId,
                userId,
                'USD',
                paymentAmount,
                order.exchange_rate || 1,
                2, // Paid
                8, // Coin Flex Pay
                utr,
                JSON.stringify(paymentResult)
            ]
        );

        const transactionId = transactionResult.insertId;

        // Update order
        await connection.execute(
            "UPDATE res_orders SET payment_status = ?, amount_paid = ?, order_status = ?, transaction_id = ? WHERE order_id = ?",
            [2, paymentAmount, 7, transactionId, orderId]
        );

        // Process order or add credits
        let itemTypes;
        try {
            itemTypes = JSON.parse(order.item_types);
        } catch (err) {
            throw new Error("Invalid item types in order");
        }

        if (itemTypes.includes(5)) {
            try {
                await addCreditsBalance(orderId);
            } catch (err) {
            }
        } else {
            await activateOrder(orderId, userId, connection);
        }

        // Send payment success notification to admin
        try {
            await NotificationService.createNotification(
                "payment_received",
                "Payment Received",
                `Payment of ${paymentAmount} USD received for order #${orderId}`, {
                    order_id: orderId,
                    user_id: userId,
                    amount: paymentAmount,
                    currency: 'USD',
                    payment_method: "Coinflexpay",
                    transaction_id: transactionId,
                    gateway_txn_id: utr
                },
                true
            );
        } catch (notificationError) {
        }

        await connection.commit();
        return {
            message: "Order processed successfully"
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


module.exports = {
    createOrder,
    checkPaymentStatus,
};
