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


/**
 * 🚀 INR PORTAL ORDER CREATION
 * 
 * Creates a inr Portal order using the unified OrderCalculationService.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate input (currency only - amount calculated from cart)
 * 2. Fetch inr Portal credentials from database
 * 3. Use OrderCalculationService for unified cart calculation
 * 4. Create inr Portal order with calculated amount
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
            currency = 'INR', discount_code
        } = req.body;
        const {
            id
        } = req.user; // Get user ID from authenticated request

        // Only INR currency is allowed
        if (currency !== 'INR') {
            return res.status(400).json({
                status: "fail",
                message: "Only INR currency is allowed",
                showCurrencyDialog: true
            });
        }

        // 🎯 UNIFIED ORDER CALCULATION: Single source of truth for all calculations
        const calculationResult = await OrderCalculationService.calculateOrder({
            userId: id,
            currency: 'INR',
            paymentGatewayId: 'inrportal',
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
            payment_method: 7, // INR Portal
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
              payment_method: 'inrportal',
              order_type: '2', // Assuming subscription packages, adjust as needed
              package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
            });
          } catch (discountError) {
            // Log but don't fail the order if discount recording fails
            console.error('Failed to record discount usage:', discountError.message);
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
            customer_mobile = "+919876543210"; // Default fallback with proper format
        } else if (!customer_mobile.startsWith('+')) {
            customer_mobile = `+${customer_mobile}`; // Add country code if missing
        }

        // Get INR token from payment options
        const [paymentOptions] = await pool.execute(
            "SELECT secret_key FROM payment_gateways WHERE gateway_type = ?",
            ['inrportal']
        );

        if (!paymentOptions.length) {
            return res.status(500).json({
                status: "fail",
                message: "INR Portal configuration not found",
            });
        }

        const inr_token = paymentOptions[0].secret_key;
        
        // Validate INR token
        if (!inr_token) {
            return res.status(500).json({
                status: "fail",
                message: "INR Portal token not configured"
            });
        }

        // Generate unique order ID for INR Portal (combine internal order ID with timestamp)
        const inrPortalOrderId = `INR_${orderId}_${Date.now()}`;

        // Prepare request payload with unique order ID for INR Portal
        const requestPayload = {
            customer_mobile: customer_mobile,
            user_token: inr_token,
            amount: orderDetails.amount_due.toString(),
            order_id: inrPortalOrderId, // Use unique ID for INR Portal
            redirect_url: `${process.env.APP_BASE_URL}/payment/inrportal/success?id=${inrPortalOrderId}`,
            remark1: `Order ID: ${orderId}`,
            remark2: `Amount: ${orderDetails.amount_due}`
        };

        console.log('INR Portal request payload:', requestPayload);

        // Call INR Portal API with retry logic
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                response = await axios.post(
                    `https://inrportal.com/api/create-order`,
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

        // Validate response structure
        if (!response.data) {
            console.error('Empty response from INR Portal API');
            return res.status(500).json({
                status: "fail",
                message: 'Empty response from INR Portal API'
            });
        }

        // Handle response
        if (response.data && response.data.status === true) {
            // Send order creation notification to admin
            try {
                await NotificationService.createNotification(
                    "inrportal_order_created",
                    "INR Portal Order Created",
                    `INR Portal order created for amount ${orderDetails.amount_due} INR`, {
                        order_id: orderId,
                        amount: orderDetails.amount_due,
                        currency: 'INR',
                        payment_method: "INR Portal",
                        payment_url: response.data.result.payment_url,
                        customer_mobile: customer_mobile
                    },
                    true
                );
            } catch (notificationError) {
                // console.error("Error creating INR Portal order notification:", notificationError);
                // Don't fail the order creation if notification fails
            }

            res.json({
                status: "success",
                message: 'Order created successfully via INR Portal',
                data: {
                    paymentUrl: response.data.result.payment_url,
                    orderId: response.data.result.orderId,
                    fullResponse: response.data // Include full response for debugging
                }
            });
        } else {
            res.status(400).json({
                status: "fail",
                message: response.data.message || 'Failed to create order via INR Portal',
                error: response.data,
                fullResponse: response.data // Include full response for debugging
            });
        }

    } catch (error) {
        // console.error('Create order error:', error);

        // Log error
        await ErrorLogger.logPaymentError(error, null, null, req);

        if (error.response) {
            res.status(error.response.status).json({
                status: "fail",
                message: error.response.data?.message || 'INR Portal API error',
                error: error.response.data
            });
        } else {
            res.status(500).json({
                status: "fail",
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}


async function webhook(req, res) {
    try {
        
        // Extract webhook data
        const webhookData = req.body;
        
        // Validate webhook data
        if (!webhookData || !webhookData.order_id) {
            console.log('Invalid webhook data:', webhookData);
            return res.status(400).json({
                status: "fail",
                message: 'Invalid webhook data - order_id required',
            });
        }
        
        // Extract internal order ID from INR Portal order ID
        // Format: INR_{internalOrderId}_{timestamp}
        let internalOrderId = webhookData.order_id;
        if (webhookData.order_id.startsWith('INR_')) {
            const parts = webhookData.order_id.split('_');
            if (parts.length >= 2) {
                internalOrderId = parts[1]; // Extract the internal order ID
            }
        }
                
        // Check if payment is successful
        if (webhookData.status === 'COMPLETED' || webhookData.status === 'SUCCESS' || webhookData.payment_status === 'SUCCESS') {
            try {
                await processOrderInternally(internalOrderId, webhookData);
                console.log('Order processed successfully via webhook');
            } catch (orderError) {
                console.error('Order processing error in webhook:', orderError);
                // Don't fail the webhook response, just log the error
            }
        }
        
        res.status(200).json({
            status: "success",
            message: 'Webhook processed successfully',
            
        });
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({
            status: "fail",
            message: 'Failed to process webhook',
        });
    }
}



/**
 * Check Payment Status - INR Portal API
 */

async function checkPaymentStatus(req, res) {
    try {
        const {
            orderId
        } = req.body;

        if (!orderId) {
            return res.status(400).json({
                status: "fail",
                message: 'Order ID is required'
            });
        }

        // Extract internal order ID from INR Portal order ID
        // Format: INR_{internalOrderId}_{timestamp}
        let internalOrderId = orderId;
        if (orderId.startsWith('INR_')) {
            const parts = orderId.split('_');
            if (parts.length >= 2) {
                internalOrderId = parts[1]; // Extract the internal order ID
            }
        }

        // get token from database
        const [paymentOptions] = await pool.execute(
            "SELECT secret_key FROM payment_gateways WHERE gateway_type = ?",
            ['inrportal']
        );

        if (!paymentOptions.length) {
            return res.status(500).json({
                status: "fail",
                message: "INR Portal configuration not found",
            });
        }

        const inr_token = paymentOptions[0].secret_key;

        // Call INR Portal API to check payment status
        const response = await axios.post(
            `https://inrportal.com/api/check-order-status`,
            new URLSearchParams({
                user_token: inr_token,
                order_id: orderId // Use the full INR Portal order ID for API call
            }).toString(), {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        // Handle response
        if (response.data && response.data.status === 'COMPLETED') {
            // Payment successful - process the order internally using the extracted internal order ID
            try {
                await processOrderInternally(internalOrderId, response.data.result);

                res.json({
                    status: "success",
                    message: 'Payment verified and order processed successfully',
                    data: {
                        inrPortalOrderId: orderId,
                        internalOrderId: internalOrderId,
                        amount: response.data.result.amount,
                        status: response.data.result.status,
                        utr: response.data.result.utr,
                        message: response.data.message,
                        orderProcessed: true
                    }
                });
            } catch (orderError) {
                // console.error('Order processing error:', orderError);
                res.status(500).json({
                    status: "fail",
                    message: 'Payment verified but order processing failed',
                    error: orderError.message
                });
            }
        } else if (response.data && response.data.status === 'ERROR') {
            res.status(400).json({
                status: "fail",
                message: 'Failed to retrieve payment status',
                error: response.data.message
            });
        } else {
            res.status(400).json({
                status: "fail",
                message: 'Unexpected response format from INR Portal',
                error: response.data
            });
        }

    } catch (error) {
        // console.error('Payment status error:', error);

        // Log error
        await ErrorLogger.logPaymentError(error, null, null, req);

        res.status(500).json({
            status: "fail",
            message: 'Failed to retrieve payment status',
            error: error.message
        });
    }
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
        const paymentAmount = paymentResult.amount || paymentResult.amount_paid || order.amount_due;
        const utr = paymentResult.utr || paymentResult.transaction_id || paymentResult.gateway_txn_id || `INR_${Date.now()}`;

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
                'INR',
                paymentAmount,
                order.exchange_rate || 1,
                2, // Paid
                7, // INR Portal
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
                // console.error("addCreditsBalance failed:", err.message);
            }
        } else {
            await activateOrder(orderId, userId, connection);
        }

        // Send payment success notification to admin
        try {
            await NotificationService.createNotification(
                "payment_received",
                "Payment Received",
                `Payment of ${paymentAmount} INR received for order #${orderId}`, {
                    order_id: orderId,
                    user_id: userId,
                    amount: paymentAmount,
                    currency: 'INR',
                    payment_method: "INR Portal",
                    transaction_id: transactionId,
                    gateway_txn_id: utr
                },
                true
            );
        } catch (notificationError) {
            // console.error("Error creating payment notification:", notificationError);
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
    webhook
};