const OrderCalculationService = require("../../services/OrderCalculationService");
const { processZeroAmountOrder } = require("./helper");
const { ErrorLogger } = require("../../logger");
const { pool } = require("../../config/database");

/**
 * 🎁 FREE ORDER CONTROLLER
 * Secure endpoint for processing 100% discount orders
 * 
 * Security Features:
 * - Validates discount calculation on server-side
 * - Ensures order is actually 100% discounted
 * - Prevents manipulation of discount amounts
 * - Logs all free order attempts for auditing
 */

/**
 * Process free order (100% discount) - Single API call
 * Validates discount eligibility and processes order in one request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function processFreeOrder(req, res) {
    try {
        // 🔒 AUTHENTICATION CHECK
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                status: "fail",
                message: "Authentication required"
            });
        }

        const { discount_code } = req.body;
        const userId = req.user.id;

        // 🌍 FETCH DEFAULT SITE CURRENCY from database
        let currency = 'INR'; // Default fallback
        try {
            const [currencyRows] = await pool.execute(
                `SELECT option_value FROM res_options WHERE option_name = ?`,
                ['currency']
            );
            
            if (currencyRows.length > 0 && currencyRows[0].option_value) {
                currency = currencyRows[0].option_value;
            }
        } catch (currencyError) {
            console.warn('Failed to fetch site currency, using default:', currencyError.message);
            // Continue with default currency
        }

        // 🛡️ SECURITY VALIDATION: Discount code must be provided
        if (!discount_code) {
            return res.status(400).json({
                status: "fail",
                message: "Discount code is required for free orders"
            });
        }

        // 🧮 STEP 1: Calculate order total with discount
        const calculationResult = await OrderCalculationService.calculateOrder({
            userId,
            currency,
            paymentGatewayId: 'free_order',
            discountCode: discount_code,
            recordDiscountUsage: false  // This should be false for cart calculation
        });

        const { orderDetails, cartItems } = calculationResult;

        // 🛡️ SECURITY VALIDATION: Verify calculation was successful
        if (!calculationResult.success) {
            return res.status(400).json({
                status: "fail",
                message: "Order calculation failed",
                error: calculationResult.error,
                eligible: false
            });
        }

        // 🛡️ CRITICAL SECURITY CHECK: Ensure order is actually 100% discounted
        if (!orderDetails || orderDetails.amount_due !== 0) {
            return res.status(400).json({
                status: "fail",
                message: "Order is not eligible for free processing",
                eligible: false,
                details: {
                    amount_due: orderDetails?.amount_due,
                    subtotal: orderDetails?.subtotal,
                    discount: orderDetails?.discount,
                    reason: "Discount does not cover full order amount"
                }
            });
        }

        // 🛡️ ADDITIONAL VALIDATION: Ensure discount was actually applied
        if (!orderDetails.discount || orderDetails.discount <= 0) {
            return res.status(400).json({
                status: "fail",
                message: "No valid discount applied to order",
                eligible: false,
                details: {
                    discount_applied: orderDetails?.discount,
                    reason: "No discount was applied"
                }
            });
        }

        // 🛡️ CART VALIDATION: Ensure cart has items
        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({
                status: "fail",
                message: "Cart is empty",
                eligible: false
            });
        }

        // 📊 LOG AUDIT TRAIL for security monitoring
        console.log(`🎁 Processing free order for user ${userId} with discount ${discount_code}`, {
            subtotal: orderDetails.subtotal,
            discount: orderDetails.discount,
            amount_due: orderDetails.amount_due,
            items_count: cartItems.length
        });

        // 🎯 STEP 2: Process the free order
        const result = await processZeroAmountOrder({
            userId,
            orderDetails,
            paymentMethodId: 9 // Free Order payment gateway ID
        });

        // 🎯 RECORD DISCOUNT USAGE: Record after order creation with valid order_id
        if (discount_code && orderDetails.discount_details) {
          try {
            const { recordDiscountUsage } = require('../../controllers/shared/discount');
            await recordDiscountUsage({
              discount_id: orderDetails.discount_details.id,
              user_id: userId,
              order_id: result.data.order_id,
              discount_amount: orderDetails.discount,
              order_amount: orderDetails.subtotal,
              payment_method: 'free_order',
              order_type: '2', // Assuming subscription packages, adjust as needed
              package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
            });
          } catch (discountError) {
            // Log but don't fail the order if discount recording fails
            console.error('Failed to record discount usage:', discountError.message);
          }
        }

        // 📊 LOG SUCCESS for analytics
        console.log(`✅ Free order processed successfully`, {
            userId,
            orderId: result.data.order_id,
            discountCode: discount_code,
            originalAmount: orderDetails.subtotal
        });

        // 🎉 RETURN SUCCESS RESPONSE
        return res.status(200).json({
            status: "success",
            message: "Order processed successfully with 100% discount",
            order_id: result.data.order_id, // Order ID at top level for easy access
            data: {
                ...result.data,
                discount_code: discount_code,
                original_amount: orderDetails.subtotal,
                savings: orderDetails.discount,
                message: `Congratulations! Your order is completely free with ${discount_code} discount.`
            }
        });

    } catch (error) {
        // 🚨 ERROR HANDLING & LOGGING
        ErrorLogger.logError({
            message: 'Free order processing failed',
            userId: req.user?.id,
            discountCode: req.body?.discount_code,
            error: error.message,
            stack: error.stack
        });

        console.error('Error in processFreeOrder:', error);
        
        return res.status(500).json({
            status: "fail",
            message: "Failed to process free order",
            error: "Internal server error"
        });
    }
}

module.exports = {
    processFreeOrder
};