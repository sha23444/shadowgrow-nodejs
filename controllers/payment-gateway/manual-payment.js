const { pool, secretKey } = require("../../config/database");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const { insertOrder } = require("./helper");
const { processOrder, activateOrder } = require("./processOrder");
const NotificationService = require("../../services/notificationService");
const OrderCalculationService = require("../../services/OrderCalculationService");

async function createOrder(req, res) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const { id } = req.user;
    const { currency, discount_code } = req.body;

    // ✅ INPUT VALIDATION: Only currency required, amount calculated from cart
    if (!currency) {
      await connection.rollback();
      return res.status(400).json({
        status: "fail",
        message: "Currency is required. Amount will be calculated from cart.",
      });
    }

    // 🎯 UNIFIED ORDER CALCULATION: Use OrderCalculationService like other payment gateways
    const calculationResult = await OrderCalculationService.calculateOrder({
      userId: id,
      currency: currency,
      paymentGatewayId: 'offline',
      discountCode: discount_code,
      recordDiscountUsage: true,
      connection: connection
    });

    const { orderDetails, cartItems } = calculationResult;

    // 💾 PREPARE DATABASE PAYLOAD: Use unified order details from OrderCalculationService
    const payload = {
      user_id: id,
      ...orderDetails,
      amount_due: orderDetails.total_amount, // Calculated total amount
      payment_method: 2, // Manual payment method ID
      notes: null,
      item_types: orderDetails.item_types, // JSON stringified by OrderCalculationService
      tax_breakdown: orderDetails.tax_breakdown,
      discount_details: orderDetails.discount_details,
    };

    // 💾 INSERT ORDER TO DATABASE: Save order with all calculated details
    const orderId = await insertOrder(payload, connection);

    if (!orderId) {
      await connection.rollback();
      return res.status(500).json({
        status: "fail",
        message: "Failed to create order.",
      });
    }

    // 🎯 PROCESS ORDER: Create order items with is_active = 0
    await processOrder(orderId, id, 0, connection);

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
          payment_method: 'offline',
          order_type: '2', // Assuming subscription packages, adjust as needed
          package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
        });
      } catch (discountError) {
        // Log but don't fail the order if discount recording fails
        console.error('Failed to record discount usage:', discountError.message);
      }
    }

    // Send manual payment order notification to admin
    try {
      await NotificationService.createNotification(
        "manual_payment_order",
        "Manual Payment Order Created",
        `Manual payment order #${orderId} created by user ID ${id} for ${orderDetails.total_amount} ${currency}`,
        {
          order_id: orderId,
          user_id: id,
          total_amount: orderDetails.total_amount,
          currency: currency,
          payment_method: "Manual Payment",
          item_types: orderDetails.item_types,
          cart_items_count: cartItems.length,
          discount_amount: orderDetails.discount,
          tax_amount: orderDetails.tax
        },
        true
      );
    } catch (notificationError) {
//       // console.error("Error creating manual payment notification:", notificationError);
      // Don't fail the order process if notification fails
    }


    // Commit the transaction
    await connection.commit();

    // Send response with order details
    return res.json({
      status: "success",
      order_id: orderId,
      order_details: {
        total_amount: orderDetails.total_amount,
        currency: currency,
        subtotal: orderDetails.subtotal,
        discount: orderDetails.discount,
        tax: orderDetails.tax,
        item_types: orderDetails.item_types,
        cart_items_count: cartItems.length
      }
    });
  } catch (err) {
    await connection.rollback();
//     // console.error("Error creating order:", err.message);
    return res.status(500).json({
      status: "fail",
      message: "Internal Server Error",
      error: err,
    });
  } finally {
    connection.release();
  }
}

async function confirmOrder(req, res) {
  const { id } = req.user;
  const { order_id } = req.body;

  try {
    const [order] = await pool.execute(
      "SELECT * FROM res_orders WHERE order_id = ? AND user_id = ?",
      [order_id, id]
    );

    if (!order.length) {
      return res.status(404).json({
        status: "fail",
        message: "Order not found.",
      });
    }

    await activateOrder(order_id, id);

    // Send manual payment confirmation notification to admin
    try {
      await NotificationService.createNotification(
        "manual_payment_confirmed",
        "Manual Payment Confirmed",
        `Manual payment for order #${order_id} has been confirmed`,
        {
          order_id,
          user_id: id,
          confirmed_by: id
        },
        true
      );
    } catch (notificationError) {
//       // console.error("Error creating manual payment confirmation notification:", notificationError);
      // Don't fail the confirmation process if notification fails
    }

    return res.json({
      status: "success",
      message: "Order confirmed successfully.",
    });
  } catch (err) {
//     // console.error("Error confirming order:", err.message);
    res.status(500).send({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

module.exports = { createOrder, confirmOrder };