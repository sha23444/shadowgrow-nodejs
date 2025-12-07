const OrderCalculationService = require("../../services/OrderCalculationService");

/**
 * 🎯 SINGLE SOURCE OF TRUTH: Cart Calculation Endpoint
 * 
 * This endpoint uses the same OrderCalculationService as payment gateways,
 * ensuring consistent calculations across the entire application.
 * 
 * Frontend only needs to send: currency, discountCode (optional), paymentGatewayId
 * API automatically handles everything else using the unified calculation service.
 */
async function calculateCartTotal(req, res) {
  try {
    const {
      currency,
      discountCode,
      discount_code, // Support snake_case from frontend
      paymentGatewayId
    } = req.body;

    // Use snake_case if provided, otherwise fallback to camelCase
    const finalDiscountCode = discount_code || discountCode;

    // Get user ID from middleware
    const userId = req.user.id;

    // Validate required fields
    if (!currency) {
      return res.status(400).json({
        success: false,
        error: "Currency is required"
      });
    }

    // Convert numeric gateway ID to gateway type string if needed
    let gatewayType = paymentGatewayId;
    if (paymentGatewayId && typeof paymentGatewayId === 'number') {
      const { pool } = require("../../config/database");
      const [gatewayResult] = await pool.execute(
        'SELECT gateway_type FROM payment_gateways WHERE gateway_id = ?',
        [paymentGatewayId]
      );
      
      if (gatewayResult.length > 0) {
        gatewayType = gatewayResult[0].gateway_type;
      } else {
        return res.status(400).json({
          success: false,
          error: `Invalid payment gateway ID: ${paymentGatewayId}`
        });
      }
    }

    // 🎯 USE UNIFIED CALCULATION SERVICE - SINGLE SOURCE OF TRUTH
    // This is the same service used by all payment gateways
    let calculationResult;
    let discountError = null;
    
    try {
      calculationResult = await OrderCalculationService.calculateOrder({
        userId,
        currency,
        paymentGatewayId: gatewayType,
        discountCode: finalDiscountCode,
        recordDiscountUsage: false
      });
    } catch (error) {
      // If error is due to invalid discount code, try without discount
      if (error.message.includes("Invalid discount code") && finalDiscountCode) {
        discountError = `Invalid discount code: ${finalDiscountCode}`;
        
        // Calculate without discount code
        calculationResult = await OrderCalculationService.calculateOrder({
          userId,
          currency,
          paymentGatewayId: gatewayType,
          discountCode: null,
          recordDiscountUsage: false
        });
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    const { orderDetails, cartItems, calculationResult: calcResult, discountError: serviceDiscountError } = calculationResult;

    // Always return consistent structure for frontend
    const response = {
      success: calcResult.success, // Use the actual success status from CartCalculator
      currency: calcResult.currency,
      subtotal: calcResult.subtotal,
      discount: {
        code: discountError ? null : (calcResult.discount?.details?.code || null),
        amount: discountError ? 0 : (calcResult.discount?.amount || 0)
      },
      tax: {
        total: calcResult.tax?.total || 0,
        breakdown: calcResult.tax?.breakdown || []
      },
      total: calcResult.total,
      cartSummary: {
        itemCount: cartItems.reduce((acc, item) => acc + parseInt(item.quantity), 0),
        totalItems: cartItems.length
      }
    };

    // Add messaging
    if (discountError) {
      response.error = discountError;
      response.message = discountError;
      response.type = "discountCode";
    } else if (serviceDiscountError) {
      // Handle OrderCalculationService discount errors
      response.error = serviceDiscountError;
      response.message = serviceDiscountError;
      response.type = "discountCode";
    } else if (!calcResult.success) {
      // Handle CartCalculator errors (like discount validation failures)
      response.error = calcResult.error;
      response.message = calcResult.error;
      response.type = "discountCode";
    } else {
      response.message = "Cart calculated successfully";
      response.type = "success";
    }
    
    res.status(200).json(response);

  } catch (error) {
    // 🚨 UNIFIED ERROR HANDLING
    // Categorize errors for frontend to handle appropriately
    
    const errorMessage = error.message || "Unknown error occurred";
    let errorType = "general";
    
    // Categorize error types for better frontend handling
    if (errorMessage.includes("Invalid discount code") || 
        errorMessage.includes("Discount code") ||
        errorMessage.includes("Minimum order amount")) {
      errorType = "discountCode";
    } else if (errorMessage.includes("Cart is empty")) {
      errorType = "cart";
    } else if (errorMessage.includes("Currency")) {
      errorType = "currency";
    } else if (errorMessage.includes("Payment gateway") || 
               errorMessage.includes("Invalid payment gateway")) {
      errorType = "paymentGateway";
    } else if (errorMessage.includes("Tax calculation")) {
      errorType = "tax";
    } else if (errorMessage.includes("user ID") || 
               errorMessage.includes("authentication")) {
      errorType = "authentication";
    }
    
    // Return consistent structure even for errors
    res.status(200).json({
      success: false,
      currency: req.body.currency || "USD",
      subtotal: 0,
      discount: {
        code: null,
        amount: 0
      },
      tax: {
        total: 0,
        breakdown: []
      },
      total: 0,
      cartSummary: {
        itemCount: 0,
        totalItems: 0
      },
      error: errorMessage,
      message: errorMessage,
      type: errorType
    });
  }
}


module.exports = {
  calculateCartTotal
};
