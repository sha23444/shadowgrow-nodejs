const { format } = require("date-fns");
const { pool } = require("../../config/database");
const { sendEmail } = require("../../email-service/email-service");
const { formatBytes } = require('../utils/index');
const { PAYMENT_METHOD } = require("../utils/constants");
const NotificationService = require("../../services/notificationService");
const { ErrorLogger } = require("../../logger");
const InvoiceService = require("../../services/InvoiceService");
const { notifyOrderCompleted } = require("../admin/telegram");
const ServiceCheckoutManager = require("../../services/ServiceCheckoutManager");
const ShipRocketAutoShip = require("../../services/ShipRocketAutoShip");
const DigitalProductDeliveryService = require("../../services/DigitalProductDeliveryService");

const processOrder = async (order_id, user_id, is_active = 0, externalConnection = null) => {
  let connection;
  let shouldCommit = false;
  
  try {
    // Use external connection if provided, otherwise create new one
    if (externalConnection) {
      connection = externalConnection;
    } else {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      shouldCommit = true;
    }

    // Fetch user's cart
    const [userCart] = await connection.execute(
      "SELECT * FROM res_cart WHERE user_id = ?",
      [user_id]
    );

    const serviceItems = userCart.filter((item) => Number(item.item_type) === 7);

    if (!userCart || userCart.length === 0) {
      throw new Error(`Cart is empty for user ${user_id}. Order processing cannot continue without cart items.`);
    }

    // Separate file and package items
    const files = userCart.filter((item) => item.item_type === 1);
    const packages = userCart.filter((item) => item.item_type === 2);
    const products = userCart.filter((item) => item.item_type === 3 || item.item_type === 6); // Include both digital (3) and physical (6) products
    const courses = userCart.filter((item) => item.item_type === 4);

    // Packages 

    if (packages.length > 0) {
      const packageIds = packages.map((item) => item.item_id);
      const placeholders = packageIds.map(() => "?").join(", ");

      const [packageDetails] = await connection.execute(
        `SELECT * FROM res_download_packages WHERE package_id IN (${placeholders})`,
        packageIds
      );

      if (packageDetails.length > 0) {
        await connection.execute(
          "UPDATE res_upackages SET is_current = 0  WHERE user_id = ? ",
          [user_id]
        );

        const packageInsertions = packageDetails.map((item) => {
          const currentDate = new Date();
          const expireDate = new Date(
            currentDate.getTime() + item.period * 1000
          );

          return [
            item.package_id,
            order_id,
            item.title,
            JSON.stringify(item),
            user_id,
            item.bandwidth,
            item.bandwidth_files,
            item.extra,
            item.extra_files,
            item.fair,
            item.fair_files,
            item.devices,
            1,
            is_active,
            expireDate,
            "Manual payment"
          ];
        });

        await connection.query(
          `INSERT INTO res_upackages (
            package_id, order_id, package_title, package_object, user_id, 
            bandwidth, bandwidth_files, extra, extra_files, fair, fair_files, devices,
             is_current, is_active,  date_expire, notes 
          ) VALUES ?`,
          [packageInsertions]
        );

      }
    }

    // Files
    if (files.length > 0) {
      const fileInsertValues = files.map((file) => [
        user_id,
        file.item_id,
        file.sale_price,
        order_id,
        is_active,
      ]);
      await connection.query(
        "INSERT INTO res_ufiles (user_id, file_id, price, order_id, is_active) VALUES ?",
        [fileInsertValues]
      );

    }


    if (products.length > 0) {
      const productInsertValues = products.map((product) => [
        user_id,
        product.item_id,
        order_id,
        product.quantity,
        product.meta,
      ]);
      await connection.query(
        "INSERT INTO res_uproducts (user_id, product_id, order_id, quantity, meta) VALUES ?",
        [productInsertValues]
      );
    }

    // Courses

    if (courses.length > 0) {
      for (const course of courses) {
        const [rows] = await connection.execute(
          "SELECT * FROM res_courses WHERE course_id = ?",
          [course.item_id]
        );
        const courseDetail = rows[0];
        if (!courseDetail)
          throw new Error(`Course not found: ${course.item_id}`);

        let expiryDate = new Date();
        if (courseDetail.duration_type === 1) {
          switch (courseDetail.duration_unit) {
            case "hours":
              expiryDate.setHours(
                expiryDate.getHours() + courseDetail.duration
              );
              break;
            case "days":
              expiryDate.setDate(expiryDate.getDate() + courseDetail.duration);
              break;
            case "weeks":
              expiryDate.setDate(
                expiryDate.getDate() + courseDetail.duration * 7
              );
              break;
            case "months":
              expiryDate.setMonth(
                expiryDate.getMonth() + courseDetail.duration
              );
              break;
            case "years":
              expiryDate.setFullYear(
                expiryDate.getFullYear() + courseDetail.duration
              );
              break;
            default:
              throw new Error(
                `Unknown duration_unit: ${courseDetail.duration_unit}`
              );
          }
        } else {
          expiryDate = new Date(courseDetail.expiry_date);
        }

        await connection.execute(
          "INSERT INTO res_ucourses (user_id, course_id, order_id, expiry_date, meta) VALUES (?, ?, ?, ?, ?)",
          [
            user_id,
            course.item_id,
            order_id,
            expiryDate,
            JSON.stringify(courseDetail),
          ]
        );
      }
    }

    // send payment confirmation in case of active

    if (is_active === 1) {

      sendPaymentConfirmationEmail({
        user_id,
        order_id,
        userCart,
      }).catch(console.error);

      // Process digital product delivery (activation keys, emails, etc.)
      // Only process if order contains digital products (item_type = 3)
      const hasDigitalProducts = products.some(p => Number(p.item_type) === 3);
      if (hasDigitalProducts) {
        try {
          const deliveryResult = await DigitalProductDeliveryService.processDigitalProductDelivery(
            order_id,
            user_id,
            connection
          );
          console.log(`Digital product delivery processed for order ${order_id}:`, {
            assignedKeys: deliveryResult.assignedKeys.length,
            emailsSent: deliveryResult.emailsSent,
            errors: deliveryResult.errors.length,
          });
        } catch (deliveryError) {
          console.error(`Error processing digital product delivery for order ${order_id}:`, deliveryError);
          // Don't fail the order if delivery processing fails - log and continue
          await ErrorLogger.logError({
            errorType: 'digital_delivery',
            errorLevel: 'error',
            errorMessage: `Failed to process digital product delivery: ${deliveryError.message}`,
            errorDetails: deliveryError,
            userId: user_id,
            orderId: order_id,
            endpoint: 'processOrder.digitalDelivery',
          });
        }
      }
      
      // 🎯 ONLY CLEAR CART WHEN PAYMENT IS CONFIRMED (is_active = 1)
      // This prevents cart from being deleted if user cancels payment before completion
      await connection.execute("DELETE FROM res_cart WHERE user_id = ?", [
        user_id,
      ]);
    }

    if (serviceItems.length > 0) {
      await ServiceCheckoutManager.handleOrderCreated({
        orderId: order_id,
        userId: user_id,
        serviceItems,
        connection,
      });
    }

    // Create invoice for completed order if it doesn't exist
    try {
      await InvoiceService.createInvoiceIfNeeded(order_id, connection);
    } catch (invoiceError) {
      console.error(`Error creating invoice for order ${order_id}:`, invoiceError.message);
      // Don't fail the order processing if invoice creation fails
      // Log the error but continue
    }

    // Only commit if we created the transaction
    if (shouldCommit) {
      await connection.commit();
    }
  } catch (error) {
    // Only rollback if we created the transaction
    if (shouldCommit && connection) {
      await connection.rollback();
    }
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'order_processing',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: user_id,
      endpoint: '/processOrder'
    });
    throw error;
  } finally {
    // Only release connection if we created it
    if (shouldCommit && connection) {
      connection.release();
    }
  }
};

// New function to activate an order after payment confirmation
const activateOrder = async (order_id, user_id, externalConnection = null) => {
  let connection;
  let shouldCommit = false;
  
  try {
    // Use external connection if provided, otherwise create new one
    if (externalConnection) {
      connection = externalConnection;
    } else {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      shouldCommit = true;
    }

    // Helper function to check if column exists and update if it does
    const updateIsActiveIfColumnExists = async (tableName, orderId, userId) => {
      try {
        // Check if is_active column exists in the table
        const [columns] = await connection.execute(
          `SELECT COLUMN_NAME 
           FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = ? 
           AND COLUMN_NAME = 'is_active'`,
          [tableName]
        );
        
        // Only update if column exists
        if (columns.length > 0) {
          await connection.execute(
            `UPDATE ${tableName} SET is_active = 1 WHERE order_id = ? AND user_id = ?`,
            [orderId, userId]
          );
        }
      } catch (error) {
        // Silently skip if there's an error (table might not exist or other issues)
        // Don't log warnings as this is expected behavior for optional columns
      }
    };

    // Update is_active for user packages, files, products, and courses (if columns exist)
    await updateIsActiveIfColumnExists('res_upackages', order_id, user_id);
    await updateIsActiveIfColumnExists('res_ufiles', order_id, user_id);
    await updateIsActiveIfColumnExists('res_uproducts', order_id, user_id);
    await updateIsActiveIfColumnExists('res_ucourses', order_id, user_id);

    // Fetch user's cart for email (before clearing)
    const [userCart] = await connection.execute(
      "SELECT * FROM res_cart WHERE user_id = ?",
      [user_id]
    );

    // 🎯 PROCESS DIGITAL PRODUCT DELIVERY (activation keys, emails, etc.)
    // Only process if order contains digital products (item_type = 3)
    const products = userCart.filter((item) => item.item_type === 3 || item.item_type === 6);
    const hasDigitalProducts = products.some(p => Number(p.item_type) === 3);
    if (hasDigitalProducts) {
      try {
        const deliveryResult = await DigitalProductDeliveryService.processDigitalProductDelivery(
          order_id,
          user_id,
          connection
        );
        console.log(`Digital product delivery processed for order ${order_id}:`, {
          assignedKeys: deliveryResult.assignedKeys.length,
          emailsSent: deliveryResult.emailsSent,
          errors: deliveryResult.errors.length,
        });
      } catch (deliveryError) {
        console.error(`Error processing digital product delivery for order ${order_id}:`, deliveryError);
        // Don't fail the order if delivery processing fails - log and continue
        await ErrorLogger.logError({
          errorType: 'digital_delivery',
          errorLevel: 'error',
          errorMessage: `Failed to process digital product delivery: ${deliveryError.message}`,
          errorDetails: deliveryError,
          userId: user_id,
          orderId: order_id,
          endpoint: 'activateOrder.digitalDelivery',
        });
      }
    }

    // 🎯 CLEAR CART WHEN PAYMENT IS CONFIRMED (order is activated)
    // This ensures cart is only deleted after successful payment, not when order is created
    await connection.execute("DELETE FROM res_cart WHERE user_id = ?", [
      user_id,
    ]);

    try {
      await ServiceCheckoutManager.markPaymentByOrder(order_id, user_id, connection);
    } catch (serviceMarkError) {
      console.warn('Service booking update skipped for order', order_id, serviceMarkError.message);
    }

    // Only commit if we created the transaction
    if (shouldCommit) {
      await connection.commit();
    }

    // Automatically create Ship Rocket shipment for physical products (non-blocking)
    // Check if order has physical products before attempting shipment creation
    try {
      const [orderData] = await (externalConnection || pool).execute(
        "SELECT item_types FROM res_orders WHERE order_id = ?",
        [order_id]
      );

      if (orderData.length > 0) {
        let itemTypes;
        try {
          itemTypes = JSON.parse(orderData[0].item_types || '[]');
        } catch (parseError) {
          // Invalid item types, skip
        }

        // Only attempt auto-shipment if order has physical products
        if (itemTypes && itemTypes.includes(6)) {
          // Create shipment asynchronously (don't block order activation)
          setImmediate(async () => {
            try {
              await ShipRocketAutoShip.createShipmentForOrder(order_id, user_id);
            } catch (shipmentError) {
              console.error('Error in automatic Ship Rocket shipment creation:', shipmentError);
              // Don't throw - this is non-blocking
            }
          });
        }
      }
    } catch (autoShipmentError) {
      // Log but don't fail order activation
      console.error('Error checking for auto-shipment:', autoShipmentError);
    }
    
    // Check if order is completed and send Telegram notification (non-blocking)
    try {
      const [orders] = await (externalConnection || pool).execute(
        "SELECT order_id, order_status, total_amount, amount_paid, currency FROM res_orders WHERE order_id = ?",
        [order_id]
      );
      
      if (orders.length > 0 && orders[0].order_status === 7) {
        // Order is completed (status 7), send notification
        const order = orders[0];
        
        // Fetch user details
        const [users] = await (externalConnection || pool).execute(
          "SELECT username, email, first_name, last_name FROM res_users WHERE user_id = ?",
          [user_id]
        );
        
        const user = users[0] || {};
        const customerName = user.first_name || user.username || `User #${user_id}`;
        
        // Get items count from cart or calculate
        const itemsCount = userCart ? userCart.length : 1;
        
        const telegramPayload = {
          order_id: order.order_id,
          id: order.order_id,
          user_id: user_id,
          customer_name: customerName,
          user_name: customerName,
          total_amount: order.total_amount || order.amount_paid || 0,
          amount: order.amount_paid || order.total_amount || 0,
          currency: order.currency || 'USD',
          items_count: itemsCount,
          status: 'Completed'
        };

        setImmediate(() => {
          notifyOrderCompleted(telegramPayload).catch((telegramError) => {
            console.error('Error sending Telegram notification for completed order:', telegramError);
          });
        });
      }
    } catch (telegramError) {
      // Log error but don't fail the activation
      console.error('Error sending Telegram notification for completed order:', telegramError);
    }
    
    // Send all emails after activation
    if (userCart && userCart.length > 0) {
      // Send package emails
      const packages = userCart.filter((item) => item.item_type === 2);
      if (packages.length > 0) {
        const packageIds = packages.map((item) => item.item_id);
        const placeholders = packageIds.map(() => "?").join(", ");
        
        const [packageDetails] = await (externalConnection || pool).execute(
          `SELECT * FROM res_download_packages WHERE package_id IN (${placeholders})`,
          packageIds
        );
        
        for (const item of packageDetails) {
          sendPackageEmail({
            user_id,
            order_id,
            package: item,
          }).catch(console.error);
        }
      }
      
      // Send file emails
      const files = userCart.filter((item) => item.item_type === 1);
      if (files.length > 0) {
        sendFileEmail({
          user_id,
          order_id,
          files,
        }).catch(console.error);
      }
      
      // Send payment confirmation email
      sendPaymentConfirmationEmail({
        user_id,
        order_id,
        userCart,
      }).catch(console.error);
    }
    
  } catch (error) {
    // Only rollback if we created the transaction
    if (shouldCommit && connection) {
      await connection.rollback();
    }
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'order_activation',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: user_id,
      endpoint: '/activateOrder'
    });
    throw error;
  } finally {
    // Only release connection if we created it
    if (shouldCommit && connection) {
      connection.release();
    }
  }
};

// Send Package Email confirmation

const sendPackageEmail = async ({ user_id, order_id, package }) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [userRows, orderRows, siteOptionRows] = await Promise.all([
      connection.execute("SELECT * FROM res_users WHERE user_id = ?", [user_id]),
      connection.execute("SELECT * FROM res_orders WHERE order_id = ?", [order_id]),
      connection.query("SELECT option_value FROM res_options WHERE option_name = 'site_name'")
    ]);

    const user = userRows[0][0];
    const order = orderRows[0][0];
    const siteName = siteOptionRows[0][0].option_value;

    if (!user || !order || !siteName) {
      throw new Error("Missing required data (user/order/siteName)");
    }

    const currentDate = new Date();
    const expireDate = new Date(currentDate.getTime() + package.period * 1000);
    const activationDate = currentDate.toISOString();
    const dashboardUrl = `${process.env.APP_BASE_URL}/account/dashboard`;
    const subject = `Your Subscription Package is Activated! 🎉`;

    const email = user.email;

    const data = {
      ...user,
      ...order,
      ...package,
      activation_date: activationDate,
      expiry_date: expireDate.toISOString(),
      siteName,
      dashboardUrl,
      bandwidth: formatBytes(package.bandwidth),
      fair: formatBytes(package.fair),
    };


    await sendEmail(email, subject, "package-order-success", data);

  } catch (error) {
//     // console.error("Error in sendPackageEmail:", error.message);
  } finally {
    if (connection) connection.release();
  }
};

// send file emails

const sendFileEmail = async ({ user_id, order_id, files }) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [userRows, orderRows, siteOptionRows] = await Promise.all([
      connection.execute("SELECT * FROM res_users WHERE user_id = ?", [user_id]),
      connection.execute("SELECT * FROM res_orders WHERE order_id = ?", [order_id]),
      connection.query("SELECT option_value FROM res_options WHERE option_name = 'site_name'")
    ]);

    const user = userRows[0][0];
    const order = orderRows[0][0];
    const siteName = siteOptionRows[0][0].option_value;

    if (!user || !order || !siteName) {
      throw new Error("Missing user/order/site info");
    }

    const email = user.email;
    const downloadPage = `${process.env.APP_BASE_URL}/account/downloads`;
    const downloadUrl = `${process.env.API_BASE_URL}/account/orders/${order_id}`;


    const subject = `🎉 Purchase Successful! Your Files Are Ready to Download – Order #${order_id}`;

    const emailData = {
      order_id: order_id,
      first_name: user.first_name,
      last_name: user.last_name,
      order_date: new Date(),
      siteName,
      downloadPage,
      files: files.map((f) => ({
        title: f.item_name,
        download_url: downloadUrl
      })),
    };

    await sendEmail(email, subject, "file-order-success", emailData);

  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'email',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      userId: user_id,
      endpoint: '/sendFileEmail'
    });
  } finally {
    if (connection) connection.release();
  }
};


// Send Payment Confirmation Email

const sendPaymentConfirmationEmail = async ({ user_id, order_id, userCart }) => {
  let connection;
  try {
    connection = await pool.getConnection();

    // Run queries in parallel
    const [userRows, orderRows, transactionRows] = await Promise.all([
      connection.execute("SELECT * FROM res_users WHERE user_id = ?", [user_id]),
      connection.execute("SELECT * FROM res_orders WHERE order_id = ?", [order_id]),
      connection.execute("SELECT * FROM res_transactions WHERE order_id = ?", [order_id]),
    ]);

    const user = userRows[0][0];
    const order = orderRows[0][0];
    const transaction = transactionRows[0][0];

    if (!user || !order || !transaction) {
      throw new Error("Missing required data (user/order/transaction)");
    }

    const [optionsRows] = await pool.query(
      "SELECT option_value FROM res_options WHERE option_name = 'site_name'"
    );
    const siteName = optionsRows[0]?.option_value || "Our Site";

    const subject = `Thanks for Your Purchase! Payment Confirmation for Order #${order_id}`;
    const invoiceUrl = `${process.env.APP_BASE_URL}/account/dashboard`;
    const email = user.email;

    const items = userCart.map((item) => ({
      title: item.item_name || "Item",
      quantity: item.quantity,
      price: item.sale_price,

    }));

    const data = {
      order_id: order.order_id,
      currency: order.currency,
      payment_id: transaction.gateway_txn_id,
      payment_method: PAYMENT_METHOD[order.payment_method],
      first_name: user.first_name !== null ? user.first_name : user.email,
      last_name: user.last_name !== null ? user.last_name : '',
      payment_date: new Date(),
      invoiceUrl,
      subtotal: order.subtotal,
      tax: order.tax,
      discount: order.discount,
      total: order.amount_paid,
      siteName,
      items,
    };

    await sendEmail(email, subject, "payment-confirmation", data);

  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'email',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: user_id,
      endpoint: '/sendPaymentConfirmationEmail'
    });
  } finally {
    if (connection) connection.release();
  }
};

const addCreditsBalance = async (order_id) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get order details
    const [[order]] = await connection.execute(
      "SELECT * FROM res_orders WHERE order_id = ?",
      [order_id]
    );

    if (!order) throw new Error("Order not found");

    const user_id = order.user_id;
    const amount = Number(order.amount_paid);
    const exchangeRate = Number(order.exchange_rate) || 1;
    const amountToAdd = amount / exchangeRate;

    // Add recharge record
    await connection.execute(
      "INSERT INTO res_uwallet_recharge (user_id, order_id, amount) VALUES (?, ?, ?)",
      [user_id, order_id, amountToAdd]
    );

    // Get user wallet
    const [[userWallet]] = await connection.execute(
      "SELECT balance, email, first_name, last_name FROM res_users WHERE user_id = ?",
      [user_id]
    );

    const previousBalance = Number(userWallet.balance);
    const newBalance = previousBalance + amountToAdd;

    // Update user balance
    await connection.execute(
      "UPDATE res_users SET balance = ? WHERE user_id = ?",
      [newBalance, user_id]
    );

    // Add to transaction history
    await connection.execute(
      `INSERT INTO res_transfers (user_id, order_id, amount, type, notes, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        order_id,
        amountToAdd,
        "credit",
        "Wallet recharge",
        `Wallet recharge #${order_id}`,
      ]
    );

    // Commit changes
    await connection.commit();

    // Prepare email data
    const emailData = {
      user_id,
      order_id,
      previous_balance: previousBalance,
      exchange_rate: exchangeRate,
      amount: amountToAdd,
      new_balance: newBalance,
    };

    // Send emails (fire and forget)
    sendWalletRechargeConfirmationEmail(emailData).catch(console.error);

    // Send wallet recharge completion notification to admin
    try {
      await NotificationService.createNotification(
        "wallet_recharge_completed",
        "Wallet Recharge Completed",
        `Wallet recharge completed for order #${order_id}. Amount: ${amountToAdd} added to user balance.`,
        {
          order_id,
          user_id,
          amount_added: amountToAdd,
          previous_balance: previousBalance,
          new_balance: newBalance,
          exchange_rate: exchangeRate,
          original_amount: amount
        },
        true
      );
    } catch (notificationError) {
      // console.error("Error creating wallet recharge notification:", notificationError);
      // Don't fail the recharge process if notification fails
    }

  } catch (error) {
    if (connection) await connection.rollback();
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'wallet_recharge',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: user_id,
      endpoint: '/addCreditsBalance'
    });
    throw error;
  } finally {
    if (connection) connection.release();
  }
};


// Send Wallet Recharge Confirmation

const sendWalletRechargeConfirmationEmail = async (data) => {
  let connection;

  try {
    connection = await pool.getConnection();

    // Destructure user_id and order_id from data
    const { user_id, order_id, amount, previous_balance, exchange_rate, new_balance } = data;

    // Execute all queries in parallel
    const [[userRow], [orderRow], [transactionRow], [currencyRow]] = await Promise.all([
      connection.execute("SELECT * FROM res_users WHERE user_id = ?", [user_id]),
      connection.execute("SELECT * FROM res_orders WHERE order_id = ?", [order_id]),
      connection.execute("SELECT * FROM res_transactions WHERE order_id = ?", [order_id]),
      connection.execute("SELECT option_value FROM res_options WHERE option_name = 'currency'")
    ]);

    const user = userRow[0];
    const order = orderRow[0];
    const transaction = transactionRow[0];
    const walletCurrency = currencyRow[0]?.option_value || 'USD'; // Default fallback

    if (!user || !order) {
//       // console.warn("Missing user or order data:", { user_id, order_id });
      return;
    }

    const subject = `🎉 Credit Balance Updated – Order #${order_id}`;
    const email = user.email;

    const emailPayload = {
      order_id,
      currency: order.currency,
      payment_id: transaction?.gateway_txn_id || 'N/A',
      payment_method: PAYMENT_METHOD?.[order.payment_method] || 'Unknown',
      first_name: user.first_name || user.email,
      last_name: user.last_name || '',
      payment_date: new Date(),
      amount: amount.toFixed(2),
      previous_balance,
      exchange_rate,
      wallet_currency: walletCurrency,
      new_balance,
      show_exchange_rate: exchange_rate !== 1
    };

    await sendEmail(email, subject, "wallet-recharge-confirmation", emailPayload);
  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'email',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: user_id,
      endpoint: '/sendWalletRechargeConfirmationEmail'
    });
  } finally {
    if (connection) connection.release();
  }
};


module.exports = { processOrder, activateOrder, addCreditsBalance };