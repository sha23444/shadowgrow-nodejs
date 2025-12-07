const axios = require("axios");
const crypto = require("crypto");
const { insertOrder, checkExistingPayment } = require("./helper");
const { processOrder, activateOrder } = require("./processOrder");
const { pool } = require("../../config/database");
const NotificationService = require("../../services/notificationService");
const OrderCalculationService = require("../../services/OrderCalculationService");
const { ErrorLogger } = require("../../logger");

// Function to create HMAC SHA-512 signature
const createSignature = (payload, secretKey) => {
  const hmac = crypto.createHmac("sha512", secretKey);
  hmac.update(payload);
  return hmac.digest("hex").toUpperCase(); // Convert to uppercase as required
};

// Function to generate a nonce

const generateNonce = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    const pos = Math.floor(Math.random() * chars.length);
    nonce += chars.charAt(pos);
  }
  return nonce;
};

// Function to create order payload
const createOrderPayload = (merchantTradeNo, total, orderId) => ({
  env: {
    terminalType: "APP",
  },
  merchantTradeNo,
  orderAmount: total,
  currency: "USDT",
  returnUrl: `${process.env.APP_BASE_URL}/binance?trade_number=${merchantTradeNo}`,
  goods: {
    goodsType: "01",
    goodsCategory: "D000",
    referenceGoodsId: orderId.toString(),
    goodsName: "Paid Order",
    goodsDetail: "Paid Order",
  },
});

/**
 * 🚀 BINANCE PAY ORDER CREATION
 * 
 * Creates a Binance Pay order using the unified OrderCalculationService.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate input (currency - USDT only)
 * 2. Fetch Binance Pay credentials from database
 * 3. Use OrderCalculationService for unified cart calculation
 * 4. Create Binance Pay order with calculated amount
 * 5. Insert order into database
 * 6. Return Binance Pay checkout URL
 */
async function createOrder(req, res) {
  try {
    const { id } = req.user;
    const { currency = 'USDT', discount_code } = req.body;

    // ✅ INPUT VALIDATION: Only USDT currency supported by Binance Pay
    if (currency !== 'USDT') {
      return res.status(400).json({
        status: "fail",
        message: "Only USDT currency is supported for Binance Pay",
        showCurrencyDialog: true
      });
    }

    // 🔑 FETCH BINANCE PAY CREDENTIALS
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["binance"]
    );

    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        status: "fail",
        message: "Binance Pay configuration not found"
      });
    }

    const { public_key, secret_key } = paymentGatewayRows[0];

    if (!public_key || !secret_key) {
      return res.status(500).json({
        status: "fail",
        message: "Binance Pay API credentials not configured"
      });
    }

    // 🎯 UNIFIED ORDER CALCULATION: Single source of truth for all calculations
    const calculationResult = await OrderCalculationService.calculateOrder({
      userId: id,
      currency: currency,
      paymentGatewayId: 'binance',
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

    // 💾 INSERT ORDER TO DATABASE FIRST
    const payload = {
      user_id: id,
      ...orderDetails,
      amount_due: orderDetails.total_amount,
      payment_method: 7, // Binance Pay payment method ID
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
          payment_method: 'binance',
          order_type: '2', // Assuming subscription packages, adjust as needed
          package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
        });
      } catch (discountError) {
        // Log but don't fail the order if discount recording fails
        console.error('Failed to record discount usage:', discountError.message);
      }
    }

    // 🎯 CREATE BINANCE PAY ORDER
    const timestamp = Date.now();
    const nonce = generateNonce();
    const merchantTradeNumber = `order_${id}_${timestamp}`;
    const total = orderDetails.total_amount; // Use calculated amount

    // Prepare the Binance Pay payload
    const binancePayload = createOrderPayload(merchantTradeNumber, total, orderId);
    const jsonPayload = JSON.stringify(binancePayload);

    // Create the signature
    const signaturePayload = `${timestamp}\n${nonce}\n${jsonPayload}\n`;
    const signature = createSignature(signaturePayload, secret_key);

    // Prepare headers
    const headers = {
      "Content-Type": "application/json",
      "BinancePay-Timestamp": timestamp,
      "BinancePay-Nonce": nonce,
      "BinancePay-Certificate-SN": public_key,
      "BinancePay-Signature": signature,
    };

    // 🚀 SEND REQUEST TO BINANCE PAY API
    const response = await axios.post(
      "https://bpay.binanceapi.com/binancepay/openapi/v2/order",
      binancePayload,
      { headers }
    );

    // ✅ HANDLE RESPONSE
    if (response.data.status === "SUCCESS") {
      // Send notification
      try {
        await NotificationService.createNotification(
          "binance_order_created",
          "Binance Order Created",
          `Binance payment order #${orderId} created for ${total} USDT`,
          {
            order_id: orderId,
            merchant_trade_no: merchantTradeNumber,
            user_id: id,
            amount: total,
            currency: "USDT",
            payment_method: "Binance Pay",
            cart_items_count: cartItems.length,
            discount_amount: orderDetails.discount,
            tax_amount: orderDetails.tax
          },
          true
        );
      } catch (notificationError) {
        // Don't fail order creation if notification fails
      }

      res.status(200).json({
        status: "success",
        data: response.data,
        order_id: orderId,
        merchantTradeNo: merchantTradeNumber,
        checkoutUrl: response.data.data?.checkoutUrl,
        calculated_total: total
      });
    } else {
      // Log error and return failure
      await ErrorLogger.logError({
        errorType: 'payment_gateway',
        errorLevel: 'error',
        errorMessage: 'Binance Pay order creation failed',
        errorDetails: response.data,
        endpoint: '/binance/create-order',
        userId: id
      });

      res.status(400).json({
        status: "fail",
        message: "Failed to create Binance payment order",
        details: response.data
      });
    }
  } catch (error) {
    // Log error
    await ErrorLogger.logError({
      errorType: 'payment_gateway',
      errorLevel: 'error',
      errorMessage: 'Error creating Binance payment order',
      errorDetails: error.response?.data || error.message,
      endpoint: '/binance/create-order',
      userId: req.user?.id
    });

    res.status(500).json({
      status: "fail",
      message: "Internal server error",
      error: error.message
    });
  }
}

// Check payment status function
async function checkPaymentStatus(req, res) {
  try {
    const [paymentGatewayRows] = await pool.execute(
      "SELECT * FROM payment_gateways WHERE gateway_type = ?",
      ["binance"]
    );
    if (!paymentGatewayRows.length) {
      return res.status(500).json({
        error: "Binance API credentials are not configured",
        details: "Please check your environment variables"
      });
    }
    const { public_key, secret_key } = paymentGatewayRows[0];

    const { merchantTradeNo } = req.body;
    const { id } = req.user;
    const timestamp = Date.now();
    const nonce = generateNonce();

    // Prepare the payload
    const payload = { merchantTradeNo };
    const jsonPayload = JSON.stringify(payload);

    // Create the signature
    const signaturePayload = `${timestamp}\n${nonce}\n${jsonPayload}\n`;
    const signature = createSignature(signaturePayload, secret_key);

    // Prepare headers
    const headers = {
      "Content-Type": "application/json",
      "BinancePay-Timestamp": timestamp,
      "BinancePay-Nonce": nonce,
      "BinancePay-Certificate-SN": public_key,
      "BinancePay-Signature": signature,
    };

    // Send the request to Binance Pay API
    const response = await axios.post(
      "https://bpay.binanceapi.com/binancepay/openapi/v2/order/query",
      payload,
      { headers }
    );


    const existingPayment = await checkExistingPayment(merchantTradeNo); // You should implement this function

    if (existingPayment) {
      return res.status(200).json({
        status: "info",
        message: "Payment has already been processed.",
        order_id: response.data.data.merchantTradeNo,
      });
    }

    // Handle the response
    if (response.data.status === "SUCCESS") {
      const orderId = response.data.data.merchantTradeNo;
      const transactionId = response.data.data.transactionId;


      await activateOrder(orderId, id);

      // Send payment success notification to admin
      try {
        await NotificationService.createNotification(
          "payment_received",
          "Payment Received",
          `Payment received for order #${orderId} via Binance Pay`,
          {
            order_id: orderId,
            user_id: id,
            payment_method: "Binance Pay",
            gateway_txn_id: transactionId
          },
          true
        );
      } catch (notificationError) {
        // console.error("Error creating payment notification:", notificationError);
        // Don't fail the payment process if notification fails
      }

      res.status(200).json({
        status: "success",
        message: "Payment processed successfully",
        order_id: orderId,
      });
    } else {
      res.status(400).json({
        error: "Failed to query Binance payment order",
        details: response.data,
      });
    }
  } catch (error) {
    console.error(
      "Error querying payment order:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  createOrder,
  checkPaymentStatus,
};
