const { pool } = require("../../config/database");
const InvoiceService = require("../../services/InvoiceService");

const SAFE_EXCHANGE_RATE_EXPRESSION = `CASE WHEN exchange_rate IS NULL OR exchange_rate = 0 THEN 1 ELSE exchange_rate END`;

async function getBaseCurrencyInfo() {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value 
       FROM res_options 
       WHERE option_name IN ('currency', 'currency_symbol')`
    );

    const currencyRow = rows.find(row => row.option_name === 'currency');
    const symbolRow = rows.find(row => row.option_name === 'currency_symbol');

    return {
      code: currencyRow ? currencyRow.option_value : 'USD',
      symbol: symbolRow ? symbolRow.option_value : '$'
    };
  } catch (error) {
    console.error('Error fetching base currency info:', error);
    return {
      code: 'USD',
      symbol: '$'
    };
  }
}


async function getAllOrderList(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";

  const orderStatus = req.query['order-status'];
  const paymentStatus = req.query['payment-status'];
  const itemTypes = req.query['item-types'];
  const paymentMethod = req.query['payment-method'];
  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

  // Initialize filters
  const whereClauses = [];
  const queryParams = [];

  // Comprehensive search across multiple fields
  if (search) {
    whereClauses.push(`(
      o.order_id LIKE ? OR 
      u.username LIKE ? OR 
      u.email LIKE ? OR 
      u.phone LIKE ? OR 
      u.first_name LIKE ? OR 
      u.last_name LIKE ? OR
      CONCAT(u.first_name, ' ', u.last_name) LIKE ?
    )`);
    const searchParam = `%${search}%`;
    queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
  }

  if (orderStatus) {
    whereClauses.push('o.order_status = ?');
    queryParams.push(orderStatus);
  }

  if (paymentStatus) {
    whereClauses.push('o.payment_status = ?');
    queryParams.push(paymentStatus);
  }

  if (paymentMethod) {
    whereClauses.push('o.payment_method = ?');
    queryParams.push(paymentMethod);
  }

  if (startDate) {
    whereClauses.push('o.created_at >= ?');
    queryParams.push(startDate);
  }

  if (endDate) {
    whereClauses.push('o.created_at <= ?');
    queryParams.push(endDate);
  }

  if (itemTypes) {
    const itemTypeArray = Array.isArray(itemTypes)
      ? itemTypes
      : itemTypes.split(',').map(type => type.trim());
  
    const itemTypeConditions = itemTypeArray.map(() => `JSON_CONTAINS(o.item_types, ?)`);
    whereClauses.push(`(${itemTypeConditions.join(' OR ')})`);
  
    queryParams.push(...itemTypeArray.map(type => JSON.stringify(parseInt(type, 10))));
  }
  
  const whereSQL = whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';

  const baseCurrency = await getBaseCurrencyInfo();

  try {
    // Aggregate queries
    const totalQuery = `
      SELECT COUNT(*) as total 
      FROM res_orders AS o 
      LEFT JOIN res_users AS u ON o.user_id = u.user_id
      WHERE ${whereSQL}
    `;
    const summaryQuery = `
      SELECT
        COUNT(*) AS total_orders,
        SUM(o.amount_due / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS total_amount_due_converted,
        SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS total_amount_paid_converted,
        SUM(CASE WHEN o.payment_status = 2 THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN o.payment_status IN (0,1) THEN 1 ELSE 0 END) AS pending_payments,
        SUM(CASE WHEN o.payment_status IN (3,4,5) THEN 1 ELSE 0 END) AS failed_payments,
        SUM(CASE WHEN o.order_status = 7 THEN 1 ELSE 0 END) AS completed_orders,
        SUM(CASE WHEN o.order_status IN (1,2,3,4,5,6) THEN 1 ELSE 0 END) AS in_progress_orders,
        SUM(CASE WHEN o.order_status IN (8,9) THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN o.order_status = 10 THEN 1 ELSE 0 END) AS refunded_orders
      FROM res_orders AS o
      LEFT JOIN res_users AS u ON o.user_id = u.user_id
      WHERE ${whereSQL}
    `;

    const [
      [[{ total }]],
      [summaryRows],
    ] = await Promise.all([
      pool.execute(totalQuery, queryParams),
      pool.execute(summaryQuery, queryParams),
    ]);

    // Orders query
    const ordersQuery = `
      SELECT 
        o.*, 
        u.user_id, 
        u.username, 
        u.email, 
        u.phone, 
        u.dial_code AS phone_dial_code,
        u.first_name,
        u.last_name
      FROM res_orders AS o
      LEFT JOIN res_users AS u ON o.user_id = u.user_id
      WHERE ${whereSQL}
      ORDER BY o.created_at DESC, o.order_id DESC
      LIMIT ? OFFSET ?
    `;
    const ordersParams = [...queryParams, limit, offset];
    const [orders] = await pool.execute(ordersQuery, ordersParams);

    const summaryRow = Array.isArray(summaryRows) ? summaryRows[0] : null;
    const summary = {
      totalOrders: summaryRow?.total_orders ? Number(summaryRow.total_orders) : 0,
      totalAmountDue: summaryRow?.total_amount_due_converted ? Number(summaryRow.total_amount_due_converted) : 0,
      totalAmountPaid: summaryRow?.total_amount_paid_converted ? Number(summaryRow.total_amount_paid_converted) : 0,
      paidOrders: summaryRow?.paid_orders ? Number(summaryRow.paid_orders) : 0,
      pendingPayments: summaryRow?.pending_payments ? Number(summaryRow.pending_payments) : 0,
      failedPayments: summaryRow?.failed_payments ? Number(summaryRow.failed_payments) : 0,
      completedOrders: summaryRow?.completed_orders ? Number(summaryRow.completed_orders) : 0,
      inProgressOrders: summaryRow?.in_progress_orders ? Number(summaryRow.in_progress_orders) : 0,
      cancelledOrders: summaryRow?.cancelled_orders ? Number(summaryRow.cancelled_orders) : 0,
      refundedOrders: summaryRow?.refunded_orders ? Number(summaryRow.refunded_orders) : 0,
    };

    const groupedOrders = orders.map((order) => ({
      order_id: order.order_id,
      created_at: order.created_at,
      amount_due: order.amount_due,
      amount_paid: order.amount_paid,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      order_status: order.order_status,
      exchange_rate: order.exchange_rate,
      currency: order.currency,
      item_types: JSON.parse(order.item_types || "[]"),
      user_id: order.user_id,
      username: order.username,
      email: order.email,
      first_name: order.first_name,
      last_name: order.last_name,
      phone: order.phone,
      phone_dial_code: order.phone_dial_code,
      products: [],
      files: [],
      packages: [],
      topups: [],
      services: [],
    }));

    await Promise.all(
      groupedOrders.map(async (order) => {
        const { order_id, item_types } = order;

        if (item_types.includes(5)) {
          const [topups] = await pool.execute(
            `SELECT amount, created_at FROM res_uwallet_recharge WHERE order_id = ?`,
            [order_id]
          );
          if (topups.length) order.topups.push(...topups);
        }

        if (item_types.includes(1)) {
          const [files] = await pool.execute(
            `
              SELECT 
                rf.file_id,
                rf.title,
                rf.slug,
                uf.price
              FROM res_ufiles uf
              INNER JOIN res_files rf ON uf.file_id = rf.file_id
              WHERE uf.order_id = ?
            `,
            [order_id]
          );
          if (files.length) order.files.push(...files);
        }

        if (item_types.includes(2)) {
          const [packages] = await pool.execute(
            `
              SELECT 
                up.package_id,
                up.plan_title,
                up.meta
              FROM res_upackages up
              WHERE up.order_id = ?
            `,
            [order_id]
          );
          if (packages.length) order.packages.push(...packages);
        }

        if (item_types.includes(3)) {
          const [products] = await pool.execute(
            `
              SELECT 
                up.product_id, 
                up.quantity,
                rp.product_name, 
                rp.sale_price, 
                rp.slug,
                m.file_name AS image
              FROM res_uproducts AS up
              INNER JOIN res_products AS rp ON up.product_id = rp.product_id
              LEFT JOIN res_product_media AS m ON rp.product_id = m.product_id AND m.is_cover = 1
              WHERE up.order_id = ?
            `,
            [order_id]
          );
          if (products.length) order.products.push(...products);
        }

        if (item_types.includes(7)) {
          const [services] = await pool.execute(
            `
              SELECT 
                b.booking_id,
                b.user_id,
                b.total_price,
                b.currency,
                b.booking_status,
                b.payment_status,
                b.preferred_date,
                b.fulfillment_type,
                b.customer_message,
                b.created_at,
                s.service_id,
                s.service_name,
                s.slug,
                s.thumbnail
              FROM res_service_bookings b
              JOIN res_services s ON s.service_id = b.service_id
              WHERE b.last_order_id = ?
            `,
            [order_id]
          );
          if (services.length) order.services.push(...services);
        }
      })
    );

    return res.status(200).json({
      status: "success",
      response: {
        data: groupedOrders,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        summary,
        currency: baseCurrency,
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}


async function getOrderDetails(req, res) {
  const { order_id } = req.params; // Order ID from the request parameters

  try {
    // Fetch order details with user details
    const [[order]] = await pool.execute(
      `
        SELECT 
          o.order_id,
          o.created_at,
          o.amount_due,
          o.amount_paid,
          o.payment_method,
          o.payment_status,
          o.order_status,
          o.currency,
          o.exchange_rate,
          o.notes,
          o.item_types,
          o.billing_address,
          o.shipping_address,
          o.shiprocket_order_id,
          o.shiprocket_shipment_id,
          o.shiprocket_awb,
          o.shiprocket_courier_id,
          o.shiprocket_courier_name,
          o.shiprocket_tracking_url,
          o.shiprocket_status,
          o.shiprocket_label_url,
          o.shiprocket_manifest_url,
          o.shiprocket_pickup_scheduled_date,
          o.shiprocket_pickup_token,
          o.shiprocket_pickup_attempts,
          o.shiprocket_created_at,
          o.shiprocket_updated_at,
          u.user_id,
          u.username,
          u.email,
          u.phone,
          u.dial_code AS phone_dial_code,
          u.first_name,
          u.last_name
        FROM res_orders AS o
        LEFT JOIN res_users AS u ON o.user_id = u.user_id
        WHERE o.order_id = ?
      `,
      [order_id]
    );

    // Check if order exists
    if (!order) {
      return res.status(404).json({
        status: "error",
        message: "Order not found",
      });
    }

    // Parse `item_types` with error handling
    let itemTypes = [];
    try {
      itemTypes = JSON.parse(order.item_types || "[]");
    } catch (error) {
      console.error("Error parsing item_types:", error);
      itemTypes = [];
    }

    // Parse addresses
    let billingAddress = null;
    let shippingAddress = null;
    
    try {
      if (order.billing_address) {
        billingAddress = typeof order.billing_address === 'string' 
          ? JSON.parse(order.billing_address) 
          : order.billing_address;
      }
    } catch (e) {
      console.error('Error parsing billing_address:', e);
    }
    
    try {
      if (order.shipping_address) {
        shippingAddress = typeof order.shipping_address === 'string' 
          ? JSON.parse(order.shipping_address) 
          : order.shipping_address;
      }
    } catch (e) {
      console.error('Error parsing shipping_address:', e);
    }

    // Initialize response structure
    const orderDetails = {
      order_id: order.order_id,
      created_at: order.created_at,
      amount_due: order.amount_due,
      amount_paid: order.amount_paid,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      order_status: order.order_status,
      currency: order.currency,
      exchange_rate: order.exchange_rate,
      notes: order.notes,
      item_types: itemTypes,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      shiprocket_order_id: order.shiprocket_order_id,
      shiprocket_shipment_id: order.shiprocket_shipment_id,
      shiprocket_awb: order.shiprocket_awb,
      shiprocket_courier_id: order.shiprocket_courier_id,
      shiprocket_courier_name: order.shiprocket_courier_name,
      shiprocket_tracking_url: order.shiprocket_tracking_url,
      shiprocket_status: order.shiprocket_status,
      shiprocket_label_url: order.shiprocket_label_url,
      shiprocket_manifest_url: order.shiprocket_manifest_url,
      shiprocket_pickup_scheduled_date: order.shiprocket_pickup_scheduled_date,
      shiprocket_pickup_token: order.shiprocket_pickup_token,
      shiprocket_created_at: order.shiprocket_created_at,
      shiprocket_updated_at: order.shiprocket_updated_at,
      user_id: order.user_id,
      username: order.username,
      email: order.email,
      phone: order.phone,
      first_name: order.first_name,
      last_name: order.last_name,
      products: [],
      files: [],
      courses: [],
      packages: [],
      topups: [],
      services: [],
    };

    // Fetch files if applicable
    if (itemTypes.includes(1)) {
      const [files] = await pool.execute(
        `
          SELECT 
            rf.file_id,
            rf.folder_id,
            rf.title,
            rf.thumbnail,
            rf.size,
            uf.price,
            rf.slug,
            uf.ufile_id,
            uf.user_id,
            uf.order_id
          FROM res_files rf
          JOIN res_ufiles uf ON rf.file_id = uf.file_id
          WHERE uf.order_id = ?
        `,
        [order_id]
      );

      if (files.length) {
        orderDetails.files.push(...files);
      }
    }

    // Fetch packages if applicable
    if (itemTypes.includes(2)) {
      const [packages] = await pool.execute(
        `SELECT * FROM res_upackages WHERE order_id = ?`,
        [order_id]
      );

      if (packages.length) {
        orderDetails.packages.push(...packages);
      }
    }

    // Fetch products if applicable
    if (itemTypes.includes(3)) {
      const [products] = await pool.execute(
        `
          SELECT 
            up.product_id,
            up.quantity,
            up.meta,
            rp.product_name,
            rp.sale_price,
            rp.slug,
            m.file_name AS image
          FROM res_uproducts AS up
          INNER JOIN res_products AS rp ON up.product_id = rp.product_id
          LEFT JOIN res_product_media AS m ON rp.product_id = m.product_id AND m.is_cover = 1
          WHERE up.order_id = ?
        `,
        [order_id]
      );

      if (products.length) {
        orderDetails.products.push(...products);
      }
    }

    if (itemTypes.includes(7)) {
      const [services] = await pool.execute(
        `
          SELECT 
            b.booking_id,
            b.user_id,
            b.total_price,
            b.currency,
            b.booking_status,
            b.payment_status,
            b.preferred_date,
            b.fulfillment_type,
            b.customer_message,
            b.created_at,
            s.service_id,
            s.service_name,
            s.slug,
            s.thumbnail
          FROM res_service_bookings b
          JOIN res_services s ON s.service_id = b.service_id
          WHERE b.last_order_id = ?
        `,
        [order_id]
      );

      if (services.length) {
        orderDetails.services.push(...services);
      }
    }

    // Fetch courses if applicable
    if (itemTypes.includes(4)) {
      const [courses] = await pool.execute(
        `
          SELECT 
            up.course_id, 
            up.meta,
            rp.title, 
            rp.sale_price, 
            rp.slug,
            m.file_name AS image
          FROM res_ucourses AS up
          INNER JOIN res_courses AS rp ON up.course_id = rp.course_id
          LEFT JOIN res_course_media AS m ON rp.course_id = m.course_id AND m.is_cover = 1
          WHERE up.order_id = ?
        `,
        [order_id]
      );

      if (courses.length) {
        orderDetails.courses.push(...courses);
      }
    }

    // Fetch topups if applicable
    if (itemTypes.includes(5)) {
      const [topups] = await pool.execute(
        `
          SELECT amount, created_at 
          FROM res_uwallet_recharge 
          WHERE order_id = ?
        `,
        [order_id]
      );

      if (topups.length) {
        orderDetails.topups.push(...topups);
      }
    }

    // Return the response
    return res.status(200).json({
      status: "success",
      response: orderDetails,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function confirmOrder(req, res) {
  const {
    order_id,
    user_id,
    notes = "Confirmed Order By Admin",
    amount_paid,
    payment_date,
  } = req.body;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Fetch order details
    const [orderResult] = await connection.execute(
      "SELECT * FROM res_orders WHERE order_id = ? AND user_id = ?",
      [order_id, user_id]
    );

    const orderDetails = orderResult[0];
    if (!orderDetails) {
      return res.status(404).json({
        status: "error",
        message: "Order not found.",
      });
    }

    // Update payment info in res_orders
    await connection.execute(
      `UPDATE res_orders 
       SET order_status = ?, notes = ?, amount_paid = ?, payment_status = ?, payment_method = 3 
       WHERE order_id = ? AND user_id = ?`,
      [7, notes, amount_paid, 2, order_id, user_id]
    );

    // Insert transaction into res_transactions
    await connection.execute(
      `INSERT INTO res_transactions 
       (user_id, order_id, amount, payment_date) 
       VALUES (?, ?, ?, ?)`,
      [user_id, order_id, amount_paid, payment_date]
    );

    // Activate packages associated with the specific order_id
    const [packages] = await connection.execute(
      "SELECT * FROM res_upackages WHERE order_id = ? AND user_id = ?",
      [order_id, user_id]
    );

    for (const pkg of packages) {
      const p = JSON.parse(pkg.package_object);

      const currentDate = new Date();
      const expireDate = new Date(currentDate.getTime() + p.period * 1000);

      // Update only the packages for the specific order_id and user_id
      await connection.execute(
        `UPDATE res_upackages 
         SET is_active = 1, date_expire = ? 
         WHERE package_id = ? AND user_id = ? AND order_id = ?`,
        [expireDate, pkg.package_id, user_id, order_id]
      );
    }

    // Activate related files associated with the specific order_id
    await connection.execute(
      `UPDATE res_ufiles 
       SET is_active = 1, created_at = NOW() 
       WHERE order_id = ? AND user_id = ?`,
      [order_id, user_id]
    );

    // Create invoice for the confirmed order if it doesn't exist
    try {
      await InvoiceService.createInvoiceIfNeeded(order_id, connection);
    } catch (invoiceError) {
      console.error(`Error creating invoice for confirmed order ${order_id}:`, invoiceError.message);
      // Don't fail the order confirmation if invoice creation fails
    }

    await connection.commit();
    return res.status(200).json({
      status: "success",
      message: "Order confirmed and activated successfully.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error confirming order:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to confirm order. Please try again later.",
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Cancel an order and handle related cleanup:
 * - Delete associated packages
 * - Delete associated files
 * - Refund wallet amount if payment was made via wallet
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */

async function cancelOrder(req, res) {
  const { order_id, user_id, notes = "Order cancelled by admin" } = req.body;

  if (!order_id || !user_id) {
    return res.status(400).json({
      status: "error",
      message: "Order ID and User ID are required.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Fetch order details
    const [orderResult] = await connection.execute(
      "SELECT * FROM res_orders WHERE order_id = ? AND user_id = ?",
      [order_id, user_id]
    );

    const orderDetails = orderResult[0];
    if (!orderDetails) {
      return res.status(404).json({
        status: "error",
        message: "Order not found.",
      });
    }

    // Check if order is already cancelled
    if (orderDetails.order_status === 8) {
      return res.status(400).json({
        status: "error",
        message: "Order is already cancelled.",
      });
    }

    // Parse item_types
    let itemTypes = [];
    try {
      itemTypes = JSON.parse(orderDetails.item_types || "[]");
    } catch (error) {
      console.error("Error parsing item_types:", error);
      itemTypes = [];
    }

    // Delete associated packages if applicable
    if (itemTypes.includes(2)) {
      const [packages] = await connection.execute(
        "SELECT * FROM res_upackages WHERE order_id = ? AND user_id = ?",
        [order_id, user_id]
      );

      if (packages.length > 0) {
        // Delete the packages
        await connection.execute(
          "DELETE FROM res_upackages WHERE order_id = ? AND user_id = ?",
          [order_id, user_id]
        );
      }
    }

    // Delete associated files if applicable
    if (itemTypes.includes(1)) {
      const [files] = await connection.execute(
        "SELECT * FROM res_ufiles WHERE order_id = ? AND user_id = ?",
        [order_id, user_id]
      );

      if (files.length > 0) {
        // Delete the files
        await connection.execute(
          "DELETE FROM res_ufiles WHERE order_id = ? AND user_id = ?",
          [order_id, user_id]
        );
      }
    }

    // Handle wallet refund if payment method was wallet (payment_method = 3)
    if (orderDetails.payment_method === 3 && orderDetails.payment_status === 2) {
      // Calculate refund amount in base currency
      const refundAmount = parseFloat(orderDetails.amount_paid) / parseFloat(orderDetails.exchange_rate);
      
      // Get user's current balance
      const [[user]] = await connection.execute(
        "SELECT balance FROM res_users WHERE user_id = ? FOR UPDATE",
        [user_id]
      );

      if (user) {
        const currentBalance = parseFloat(user.balance);
        const newBalance = currentBalance + refundAmount;

        // Update user's wallet balance
        await connection.execute(
          "UPDATE res_users SET balance = ? WHERE user_id = ?",
          [newBalance.toFixed(2), user_id]
        );

        // Log the refund transaction
        await connection.execute(
          `INSERT INTO res_transfers (user_id, order_id, amount, type, notes, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            user_id,
            order_id,
            refundAmount,
            "credit",
            "Order Refund",
            `Refund for cancelled order #${order_id}`
          ]
        );
      }
    }

    // Update order status to cancelled
    await connection.execute(
      `UPDATE res_orders 
       SET order_status = ?, notes = ?, payment_status = ?
       WHERE order_id = ? AND user_id = ?`,
      [8, notes, 4, order_id, user_id] // 8 = Cancelled, 4 = Refunded
    );

    await connection.commit();
    return res.status(200).json({
      status: "success",
      message: "Order cancelled successfully.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error cancelling order:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to cancel order. Please try again later.",
    });
  } finally {
    if (connection) connection.release();
  }
}



/**
 * Get list of all orders which are completed (order_status = 7) and paid (payment_status = 2)
 * This includes file names, packages, and combined orders
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getCompletedPaidOrders(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    
    // Base query to get completed and paid orders
    const baseQuery = `
      SELECT 
        o.order_id,
        o.created_at,
        o.amount_paid,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.currency,
        o.exchange_rate,
        o.item_types,
        u.user_id,
        u.username,
        u.email,
        u.phone,
        u.first_name,
        u.last_name
      FROM res_orders AS o
      LEFT JOIN res_users AS u ON o.user_id = u.user_id
      WHERE o.order_status = ?
      AND o.payment_status = ?
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM res_orders AS o
      WHERE o.order_status = ?
      AND o.payment_status = ?
    `;
    
    // Parameters for both queries (order_status = 7 (Completed), payment_status = 2 (Paid))
    const queryParams = [7, 2];
    
    // Execute count query
    const [[{ total }]] = await pool.execute(countQuery, queryParams);
    
    // Execute main query with pagination
    const [orders] = await pool.execute(
      baseQuery + ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?',
      [...queryParams, limit, offset]
    );
    
    // Process each order to add file and package details
    const resultOrders = await Promise.all(orders.map(async (order) => {
      const processedOrder = {
        order_id: order.order_id,
        created_at: order.created_at,
        amount_paid: order.amount_paid,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        order_status: order.order_status,
        currency: order.currency,
        exchange_rate: order.exchange_rate,
        item_types: JSON.parse(order.item_types || "[]"),
        user_id: order.user_id,
        username: order.username,
        email: order.email,
        phone: order.phone,
        first_name: order.first_name,
        last_name: order.last_name,
        files: [],
        packages: []
      };
      
      // If order contains files (item_type 1)
      if (processedOrder.item_types.includes(1)) {
        const [files] = await pool.execute(`
          SELECT 
            rf.file_id,
            rf.title as file_name,
            rf.slug,
            uf.price
          FROM res_files rf
          JOIN res_ufiles uf ON rf.file_id = uf.file_id
          WHERE uf.order_id = ?
        `, [order.order_id]);
        
        processedOrder.files = files;
      }
      
      // If order contains packages (item_type 2)
      if (processedOrder.item_types.includes(2)) {
        const [packages] = await pool.execute(`
          SELECT 
            up.package_id,
            up.package_title,
            dp.title as package_name,
            dp.price as package_price
          FROM res_upackages up
          LEFT JOIN res_download_packages dp ON up.package_id = dp.package_id
          WHERE up.order_id = ?
        `, [order.order_id]);
        
        processedOrder.packages = packages;
      }
      
      return processedOrder;
    }));
    
    return res.status(200).json({
      status: "success",
      response: {
        data: resultOrders,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getCompletedPaidOrdersStats(_req, res) {
  try {
    const baseCurrency = await getBaseCurrencyInfo();

    const [[summary]] = await pool.execute(
      `SELECT
         COUNT(*) AS totalOrders,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS totalRevenue,
         COUNT(DISTINCT o.user_id) AS uniqueCustomers
       FROM res_orders AS o
       WHERE o.order_status = 7
         AND o.payment_status = 2`,
    );

    const [[todaySummary]] = await pool.execute(
      `SELECT
         COUNT(*) AS todayOrders,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS todayRevenue
       FROM res_orders AS o
       WHERE o.order_status = 7
         AND o.payment_status = 2
         AND DATE(o.created_at) = CURRENT_DATE()`,
    );

    const [[thisWeekSummary]] = await pool.execute(
      `SELECT
         COUNT(*) AS orders,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS revenue
       FROM res_orders AS o
       WHERE o.order_status = 7
         AND o.payment_status = 2
         AND YEARWEEK(o.created_at, 1) = YEARWEEK(CURRENT_DATE(), 1)`,
    );

    const [[last30Summary]] = await pool.execute(
      `SELECT
         COUNT(*) AS orders,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS revenue
       FROM res_orders AS o
       WHERE o.order_status = 7
         AND o.payment_status = 2
         AND o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`,
    );

    const totalOrders = Number(summary?.totalOrders ?? 0);
    const totalRevenue = Number(summary?.totalRevenue ?? 0);
    const uniqueCustomers = Number(summary?.uniqueCustomers ?? 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const todayOrders = Number(todaySummary?.todayOrders ?? 0);
    const todayRevenue = Number(todaySummary?.todayRevenue ?? 0);
    const thisWeekOrders = Number(thisWeekSummary?.orders ?? 0);
    const thisWeekRevenue = Number(thisWeekSummary?.revenue ?? 0);
    const last30Orders = Number(last30Summary?.orders ?? 0);
    const last30Revenue = Number(last30Summary?.revenue ?? 0);

    return res.status(200).json({
      status: "success",
      data: {
        totals: {
          orders: totalOrders,
          revenue: totalRevenue,
          averageOrderValue,
          uniqueCustomers,
        },
        today: {
          orders: todayOrders,
          revenue: todayRevenue,
        },
        ranges: {
          thisWeek: {
            orders: thisWeekOrders,
            revenue: thisWeekRevenue,
          },
          last30Days: {
            orders: last30Orders,
            revenue: last30Revenue,
          },
        },
        currency: baseCurrency,
      },
    });
  } catch (error) {
    console.error("Completed orders stats error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

/**
 * Get list of all orders which have download packages (item type 2)
 * where order status is completed (7) and payment status is paid (2)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getDownloadPackageOrders(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    
    // Base query to get orders with download packages that are completed and paid
    const baseQuery = `
      SELECT 
        o.order_id,
        o.created_at,
        o.amount_paid,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.currency,
        o.exchange_rate,
        o.item_types,
        u.user_id,
        u.username,
        u.email,
        u.phone,
        u.first_name,
        u.last_name,
        up.package_id,
        up.package_title,
        up.bandwidth,
        up.devices,
        up.date_expire,
        dp.title as package_name,
        dp.price as package_price
      FROM res_orders AS o
      INNER JOIN res_upackages AS up ON o.order_id = up.order_id
      LEFT JOIN res_download_packages AS dp ON up.package_id = dp.package_id
      LEFT JOIN res_users AS u ON o.user_id = u.user_id
      WHERE JSON_CONTAINS(o.item_types, '2')
      AND o.order_status = ?
      AND o.payment_status = ?
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM res_orders AS o
      INNER JOIN res_upackages AS up ON o.order_id = up.order_id
      WHERE JSON_CONTAINS(o.item_types, '2')
      AND o.order_status = ?
      AND o.payment_status = ?
    `;
    
    // Parameters for both queries (order_status = 7 (Completed), payment_status = 2 (Paid))
    const queryParams = [7, 2];
    
    // Execute count query
    const [[{ total }]] = await pool.execute(countQuery, queryParams);
    
    // Execute main query with pagination
    const [orders] = await pool.execute(
      baseQuery + ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?',
      [...queryParams, limit, offset]
    );
    
    // Group orders by order_id to handle cases where an order has multiple packages
    const groupedOrders = {};
    orders.forEach(order => {
      const orderId = order.order_id;
      if (!groupedOrders[orderId]) {
        groupedOrders[orderId] = {
          order_id: order.order_id,
          created_at: order.created_at,
          amount_paid: order.amount_paid,
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          order_status: order.order_status,
          currency: order.currency,
          exchange_rate: order.exchange_rate,
          item_types: JSON.parse(order.item_types || "[]"),
          user_id: order.user_id,
          username: order.username,
          email: order.email,
          phone: order.phone,
          first_name: order.first_name,
          last_name: order.last_name,
          packages: []
        };
      }
      
      // Add package details to the packages array
      groupedOrders[orderId].packages.push({
        package_id: order.package_id,
        package_title: order.package_title,
        bandwidth: order.bandwidth,
        devices: order.devices,
        date_expire: order.date_expire,
        package_name: order.package_name,
        package_price: order.package_price
      });
    });
    
    // Convert grouped orders to array
    const resultOrders = Object.values(groupedOrders);
    
    return res.status(200).json({
      status: "success",
      response: {
        data: resultOrders,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getDownloadPackageOrdersStats(_req, res) {
  try {
    const baseCurrency = await getBaseCurrencyInfo();

    const [[totals]] = await pool.execute(
      `SELECT
         COUNT(DISTINCT o.order_id) AS orders,
         COUNT(up.upackage_id) AS packagesSold,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS revenue
       FROM res_orders AS o
       INNER JOIN res_upackages AS up ON o.order_id = up.order_id
       WHERE JSON_CONTAINS(o.item_types, '2')
         AND o.order_status = 7
         AND o.payment_status = 2`,
    );

    const [[today]] = await pool.execute(
      `SELECT
         COUNT(DISTINCT o.order_id) AS orders,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS revenue,
         COUNT(up.upackage_id) AS packagesSold
       FROM res_orders AS o
       INNER JOIN res_upackages AS up ON o.order_id = up.order_id
       WHERE JSON_CONTAINS(o.item_types, '2')
         AND o.order_status = 7
         AND o.payment_status = 2
         AND DATE(o.created_at) = CURRENT_DATE()`,
    );

    const [[thisWeek]] = await pool.execute(
      `SELECT
         COUNT(DISTINCT o.order_id) AS orders,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS revenue,
         COUNT(up.upackage_id) AS packagesSold
       FROM res_orders AS o
       INNER JOIN res_upackages AS up ON o.order_id = up.order_id
       WHERE JSON_CONTAINS(o.item_types, '2')
         AND o.order_status = 7
         AND o.payment_status = 2
         AND YEARWEEK(o.created_at, 1) = YEARWEEK(CURRENT_DATE(), 1)`,
    );

    const [[last30Days]] = await pool.execute(
      `SELECT
         COUNT(DISTINCT o.order_id) AS orders,
         SUM(o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) AS revenue,
         COUNT(up.upackage_id) AS packagesSold
       FROM res_orders AS o
       INNER JOIN res_upackages AS up ON o.order_id = up.order_id
       WHERE JSON_CONTAINS(o.item_types, '2')
         AND o.order_status = 7
         AND o.payment_status = 2
         AND o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`,
    );

    return res.status(200).json({
      status: "success",
      data: {
        totals: {
          orders: Number(totals?.orders ?? 0),
          revenue: Number(totals?.revenue ?? 0),
          packagesSold: Number(totals?.packagesSold ?? 0),
        },
        today: {
          orders: Number(today?.orders ?? 0),
          revenue: Number(today?.revenue ?? 0),
          packagesSold: Number(today?.packagesSold ?? 0),
        },
        ranges: {
          thisWeek: {
            orders: Number(thisWeek?.orders ?? 0),
            revenue: Number(thisWeek?.revenue ?? 0),
            packagesSold: Number(thisWeek?.packagesSold ?? 0),
          },
          last30Days: {
            orders: Number(last30Days?.orders ?? 0),
            revenue: Number(last30Days?.revenue ?? 0),
            packagesSold: Number(last30Days?.packagesSold ?? 0),
          },
        },
        currency: baseCurrency,
      },
    });
  } catch (error) {
    console.error("Download package orders stats error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getDigitalFilesSales(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";

  const paymentStatus = req.query['payment-status'];
  const paymentMethod = req.query['payment-method'];
  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

  // Initialize filters
  const whereClauses = [];
  const queryParams = [];

  // Search across file title, user details
  if (search) {
    whereClauses.push(`(
      rf.title LIKE ? OR 
      u.username LIKE ? OR 
      u.email LIKE ? OR 
      u.phone LIKE ? OR 
      u.first_name LIKE ? OR 
      u.last_name LIKE ? OR
      CONCAT(u.first_name, ' ', u.last_name) LIKE ?
    )`);
    const searchParam = `%${search}%`;
    queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
  }

  if (paymentStatus) {
    whereClauses.push('o.payment_status = ?');
    queryParams.push(paymentStatus);
  }

  if (paymentMethod) {
    whereClauses.push('o.payment_method = ?');
    queryParams.push(paymentMethod);
  } else {
    // Default to showing only payment_method = 3 when no payment method filter is provided
    whereClauses.push('o.payment_method = ?');
    queryParams.push(3); // 3 = specific payment method
  }

  if (startDate) {
    whereClauses.push('DATE(uf.created_at) >= DATE(?)');
    queryParams.push(startDate);
  }

  if (endDate) {
    whereClauses.push('DATE(uf.created_at) <= DATE(?)');
    queryParams.push(endDate);
  }

  const whereSQL = whereClauses.length > 0 ? whereClauses.join(' AND ') : '1=1';

  try {
    // Count query for digital files sales
    const totalQuery = `
      SELECT COUNT(*) as total 
      FROM res_ufiles AS uf
      LEFT JOIN res_files AS rf ON uf.file_id = rf.file_id
      LEFT JOIN res_orders AS o ON uf.order_id = o.order_id
      LEFT JOIN res_users AS u ON uf.user_id = u.user_id
      WHERE ${whereSQL}
    `;
    const [[{ total }]] = await pool.execute(totalQuery, queryParams);

    // Digital files sales query
    const salesQuery = `
      SELECT 
        uf.ufile_id,
        uf.file_id,
        uf.user_id,
        uf.order_id,
        uf.price,
        uf.is_active,
        uf.created_at as purchase_date,
        rf.title as file_title,
        rf.slug as file_slug,
        rf.thumbnail,
        rf.size,
        rf.downloads,
        rf.visits,
        o.payment_status,
        o.payment_method,
        o.order_status,
        o.currency,
        o.exchange_rate,
        u.username,
        u.email,
        u.phone,
        u.first_name,
        u.last_name
      FROM res_ufiles AS uf
      LEFT JOIN res_files AS rf ON uf.file_id = rf.file_id
      LEFT JOIN res_orders AS o ON uf.order_id = o.order_id
      LEFT JOIN res_users AS u ON uf.user_id = u.user_id
      WHERE ${whereSQL}
      ORDER BY uf.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const salesParams = [...queryParams, limit, offset];
    const [sales] = await pool.execute(salesQuery, salesParams);

    return res.status(200).json({
      status: "success",
      response: {
        data: sales,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getDigitalFilesSalesStats(_req, res) {
  try {
    const baseCurrency = await getBaseCurrencyInfo();

    const [[totals]] = await pool.execute(
      `SELECT
         COUNT(*) AS downloads,
         COUNT(DISTINCT uf.order_id) AS orders
        FROM res_ufiles AS uf
        LEFT JOIN res_orders AS o ON uf.order_id = o.order_id
        WHERE o.payment_status = 2 AND o.order_status = 7`,
    );

    const [[today]] = await pool.execute(
      `SELECT
         COUNT(*) AS downloads,
         COUNT(DISTINCT uf.order_id) AS orders
        FROM res_ufiles AS uf
        LEFT JOIN res_orders AS o ON uf.order_id = o.order_id
        WHERE o.payment_status = 2 AND o.order_status = 7
          AND DATE(uf.created_at) = CURRENT_DATE()`,
    );

    const [[thisWeek]] = await pool.execute(
      `SELECT
         COUNT(*) AS downloads,
         COUNT(DISTINCT uf.order_id) AS orders
        FROM res_ufiles AS uf
        LEFT JOIN res_orders AS o ON uf.order_id = o.order_id
        WHERE o.payment_status = 2 AND o.order_status = 7
          AND YEARWEEK(uf.created_at, 1) = YEARWEEK(CURRENT_DATE(), 1)`,
    );

    const [[last30Days]] = await pool.execute(
      `SELECT
         COUNT(*) AS downloads,
         COUNT(DISTINCT uf.order_id) AS orders
        FROM res_ufiles AS uf
        LEFT JOIN res_orders AS o ON uf.order_id = o.order_id
        WHERE o.payment_status = 2 AND o.order_status = 7
          AND uf.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`,
    );

    return res.status(200).json({
      status: "success",
      data: {
        totals: {
          downloads: Number(totals?.downloads ?? 0),
          orders: Number(totals?.orders ?? 0),
        },
        today: {
          downloads: Number(today?.downloads ?? 0),
          orders: Number(today?.orders ?? 0),
        },
        ranges: {
          thisWeek: {
            downloads: Number(thisWeek?.downloads ?? 0),
            orders: Number(thisWeek?.orders ?? 0),
          },
          last30Days: {
            downloads: Number(last30Days?.downloads ?? 0),
            orders: Number(last30Days?.orders ?? 0),
          },
        },
        currency: baseCurrency,
      },
    });
  } catch (error) {
    console.error("Digital files stats error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

module.exports = {
  getAllOrderList,
  getOrderDetails,
  confirmOrder,
  getDigitalFilesSales,
  getDownloadPackageOrders,
  getDownloadPackageOrdersStats,
  getCompletedPaidOrders,
  getCompletedPaidOrdersStats,
  getDigitalFilesSalesStats,
  cancelOrder,
};