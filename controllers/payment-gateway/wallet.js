const { pool } = require("../../config/database");

const { insertOrder } = require("./helper");
const { processOrder, activateOrder } = require("./processOrder");
const OrderCalculationService = require("../../services/OrderCalculationService");

/**
 * 🚀 WALLET ORDER CREATION
 * 
 * Creates a wallet payment order using the unified OrderCalculationService.
 * This ensures consistent calculation across all payment gateways.
 * 
 * Flow:
 * 1. Validate user existence and wallet balance
 * 2. Use OrderCalculationService for unified cart calculation
 * 3. Validate wallet balance against order amount
 * 4. Create order and deduct from wallet
 * 5. Process order items
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createOrder(req, res) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.user;
    const options = req.body;
    const { currency, amount, discount_code } = options;

    const parsedAmount = Number(amount);
    if (!currency || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({
        status: "fail",
        message: "Invalid input: currency and a positive amount are required.",
      });
    }

    // 👤 VALIDATE USER: Check user existence and lock balance for update
    const [userRows] = await connection.execute(
      "SELECT user_id, balance FROM res_users WHERE user_id = ? FOR UPDATE",
      [id]
    );

    if (!userRows.length) {
      await connection.rollback();
      return res
        .status(400)
        .json({ status: "fail", message: "User not found." });
    }

    let userBalance = parseFloat(userRows[0].balance);

    // 🎯 CART VALIDATION: Handled by OrderCalculationService

    // Get store currency
    const [settings] = await connection.execute(
      "SELECT option_value FROM res_options WHERE option_name = 'currency'"
    );

    if (!settings.length) {
      await connection.rollback();
      return res
        .status(400)
        .json({ status: "fail", message: "Currency setting not found." });
    }

    const storeCurrency = settings[0].option_value;

    // Get exchange rates
    const [orderExchangeRateRows] = await connection.execute(
      "SELECT rate FROM res_currencies WHERE currency_code = ?",
      [currency]
    );

    const orderExchangeRate = orderExchangeRateRows.length
      ? parseFloat(orderExchangeRateRows[0].rate)
      : 1;

    const [walletExchangeRateRows] = await connection.execute(
      "SELECT rate FROM res_currencies WHERE currency_code = ?",
      [storeCurrency]
    );

    const walletExchangeRate = walletExchangeRateRows.length
      ? parseFloat(walletExchangeRateRows[0].rate)
      : 1;

    const totalInBaseCurrency = parsedAmount / orderExchangeRate;
    const walletBalanceInBaseCurrency = userBalance / walletExchangeRate;

    if (walletBalanceInBaseCurrency < totalInBaseCurrency) {
      await connection.rollback();
      return res
        .status(400)
        .json({ status: "fail", message: "Insufficient wallet balance." });
    }

    // 🎯 SINGLE SOURCE OF TRUTH: Use unified order calculation service
    const calculationResult = await OrderCalculationService.calculateOrder({
      userId: id,
      currency,
      paymentGatewayId: 'wallet',
      discountCode: discount_code,
      recordDiscountUsage: true,
      connection
    });

    const { orderDetails, cartItems } = calculationResult;

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        status: "fail",
        message: "No items found in cart. Please add items before using wallet payment.",
      });
    }

    // Prevent wallet recharge payment method
    if (cartItems.some((item) => item.item_type === 5)) {
      await connection.rollback();
      return res.status(400).json({
        status: "fail",
        message:
          "Please choose another payment method for wallet top-up recharge.",
      });
    }

    if (!orderDetails || isNaN(orderDetails.amount_due)) {
      await connection.rollback();
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid order details." });
    }

    const totalAmountDueInBaseCurrency =
      parseFloat(orderDetails.amount_due) /
      orderExchangeRate /
      walletExchangeRate;

    if (totalAmountDueInBaseCurrency > walletBalanceInBaseCurrency) {
      await connection.rollback();
      return res
        .status(400)
        .json({ status: "fail", message: "Insufficient wallet balance." });
    }

    const itemTypes = [...new Set(cartItems.map((item) => item.item_type))];
    let payload = {
      user_id: id,
      ...orderDetails,
      amount_due: parseFloat(orderDetails.amount_due),
      payment_method: 3,
      notes: null,
      item_types: orderDetails.item_types,
      tax_breakdown: orderDetails.tax_breakdown,
      discount_details: orderDetails.discount_details,
    };

    // Use transactional insert
    const orderId = await insertOrder(payload, connection);

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
          payment_method: 'wallet',
          order_type: '2', // Assuming subscription packages, adjust as needed
          package_id: cartItems.length > 0 && cartItems[0].item_type === 2 ? cartItems[0].item_id : null
        });
      } catch (discountError) {
        // Log but don't fail the order if discount recording fails
        console.error('Failed to record discount usage:', discountError.message);
      }
    }

    if (!orderId) {
      throw new Error("Failed to create order.");
    }

    // Deduct balance
    await connection.execute(
      "UPDATE res_users SET balance = balance - ? WHERE user_id = ?",
      [totalAmountDueInBaseCurrency, id]
    );

    // Wallet log
    await connection.execute(
      "INSERT INTO res_transfers (user_id, amount, order_id, type, notes, description) VALUES (?, ?, ?, ?, ?, ?)",
      [
        id,
        totalAmountDueInBaseCurrency,
        orderId,
        "debit",
        "Order Paid",
        `Debiting user wallet for order #${orderId}`,
      ]
    );

    // Create transaction
    const [txnResult] = await connection.execute(
      "INSERT INTO res_transactions (order_id, user_id, currency, amount, exchange_rate, payment_status, payment_method, payment_date, gateway_txn_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        orderId,
        id,
        currency,
        parseFloat(orderDetails.amount_due),
        orderExchangeRate,
        2,
        3,
        new Date(),
        "wallet",
      ]
    );

    const transactionId = txnResult.insertId;

    await connection.execute(
      "UPDATE res_orders SET payment_status = ?, amount_paid = ?, order_status = ?, transaction_id = ? WHERE order_id = ?",
      [2, parseFloat(orderDetails.amount_due), 7, transactionId, orderId]
    );

    // Process order (also use transaction)
    await activateOrder(orderId, id, connection);

    await connection.commit();
    return res.json({ 
      status: "success",
      message: "Order created successfully using wallet balance",
      data: {
        order_id: orderId,
        amount_paid: parseFloat(orderDetails.amount_due),
        currency: currency,
        payment_method: "Wallet",
        transaction_id: transactionId
      }
    });
  } catch (err) {
   // console.error("Error creating order:", err.message);
    if (connection) await connection.rollback();
    res.status(500).json({ 
      status: "error", 
      message: "Internal Server Error",
      error: err.message 
    });
  } finally {
    if (connection) await connection.release();
  }
}


module.exports = { createOrder };
