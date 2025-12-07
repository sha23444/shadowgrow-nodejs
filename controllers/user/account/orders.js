const { pool } = require("../../../config/database");

async function getAllOrderList(req, res) {
  const { id } = req.user; // User ID from the request
  const page = parseInt(req.query.page, 10) || 1; // Current page, default to 1
  const limit = parseInt(req.query.limit, 10) || 10; // Items per page, default to 20
  const offset = (page - 1) * limit; // Calculate offset for pagination
  const search = req.query.search || ""; // Search term, default to empty string
  const status = req.query.status || ""; // Status filter, default to empty string

  try {
    // Build the WHERE clause for filtering
    let whereClause = "WHERE o.user_id = ? AND (o.order_id LIKE ?) AND o.order_status != ?";
    let queryParams = [id, `%${search}%`, 7]; // Exclude completed orders (status = 7)

    if (status) {
      whereClause += " AND o.order_status = ?";
      queryParams.push(status);
    }

    // Fetch total count of orders for pagination
    const [[{ total }]] = await pool.execute(
      `
        SELECT COUNT(*) as total
        FROM res_orders AS o
        ${whereClause}
      `,
      queryParams
    );

    // Fetch statistics
    const [[{ totalOrders }]] = await pool.execute(
      `
        SELECT COUNT(*) as totalOrders
        FROM res_orders AS o
        WHERE o.user_id = ?
      `,
      [id]
    );

    const [[{ completedOrders }]] = await pool.execute(
      `
        SELECT COUNT(*) as completedOrders
        FROM res_orders AS o
        WHERE o.user_id = ? AND o.order_status = 7
      `,
      [id]
    );

    const [[{ pendingOrders }]] = await pool.execute(
      `
        SELECT COUNT(*) as pendingOrders
        FROM res_orders AS o
        WHERE o.user_id = ? AND o.order_status = 1
      `,
      [id]
    );

    const [[{ totalSpent }]] = await pool.execute(
      `
        SELECT COALESCE(SUM(o.amount_paid / o.exchange_rate), 0) as totalSpent
        FROM res_orders AS o
        WHERE o.user_id = ? AND o.order_status = 7 AND o.payment_status = 2
      `,
      [id]
    );

    // Fetch paginated orders
    const [orders] = await pool.execute(
      `
        SELECT *
        FROM res_orders AS o
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...queryParams, limit, offset]
    );

    // Map and initialize grouped orders
    const groupedOrders = orders.map((order) => ({
      ...order,
      item_types: JSON.parse(order.item_types || "[]"), // Parse item_type JSON
      products: [],
      files: [],
      topups: [],
      packages: [],
      courses: [],
      services: [],
    }));

    // Process each order based on `item_types`
    await Promise.all(
      groupedOrders.map(async (order) => {
        const { order_id, item_types } = order;

        // Fetch topups if applicable
        if (item_types.includes(5)) {
          const [topups] = await pool.execute(
            `
              SELECT amount, created_at 
              FROM res_uwallet_recharge 
              WHERE order_id = ? AND user_id = ?
            `,
            [order_id, id]
          );

          if (topups.length) {
            order.topups.push(...topups);
          }
        }

        // Fetch digital products if applicable
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
              WHERE up.order_id = ? AND up.user_id = ?
            `,
            [order_id, id]
          );

          if (products.length) {
            order.products.push(...products);
          }
        }

        // Fetch files if applicable
        if (item_types.includes(1)) {
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
              WHERE uf.order_id = ? AND uf.user_id = ?
            `,
            [order_id, id]
          );

          if (files.length) {
            order.files.push(...files);
          }
        }

        // Fetch courses if applicable

        if (item_types.includes(4)) {
          const [courses] = await pool.execute(
            `
              SELECT 
                up.course_id, 
                rp.title, 
                rp.sale_price, 
                rp.slug,
                m.file_name AS image
              FROM res_ucourses AS up
              INNER JOIN res_courses AS rp ON up.course_id = rp.course_id
              LEFT JOIN res_course_media AS m ON rp.course_id = m.course_id AND m.is_cover = 1
              WHERE up.order_id = ? AND up.user_id = ?
            `,
            [order_id, id]
          );

          if (courses.length) {
            order.courses.push(...courses);
          }
        }

        // fetch download package

        if (item_types.includes(2)) {
          const [packages] = await pool.execute(
            `SELECT * FROM res_upackages WHERE user_id = ? AND order_id = ?`,
            [id, order_id]
          );

          if (packages.length) {
            order.packages.push(...packages);
          }
        }

        if (item_types.includes(7)) {
          const [services] = await pool.execute(
            `
              SELECT 
                b.booking_id,
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
              WHERE b.last_order_id = ? AND b.user_id = ?
            `,
            [order_id, id]
          );

          if (services.length) {
            order.services.push(...services);
          }
        }
      })
    );

    // Construct the paginated response
    const result = {
      data: groupedOrders,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      statistics: {
        totalOrders,
        completedOrders,
        pendingOrders,
        totalSpent: parseFloat(totalSpent) || 0,
      },
    };

    // Return the response
    return res.status(200).json({
      status: "success",
      response: result,
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
  const { id } = req.user; // User ID from the request
  const { order_id } = req.params; // Order ID from the request parameters

  try {
    // Fetch order details
    const [[order]] = await pool.execute(
      `
        SELECT 
          *
        FROM res_orders AS o
        WHERE o.user_id = ? AND o.order_id = ?
      `,
      [id, order_id]
    );

    if (!order) {
      return res.status(404).json({
        status: "error",
        message: "Order not found",
      });
    }

    // Parse item_types
    order.item_types = JSON.parse(order.item_types || "[]");

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

    // Initialize details
    const orderDetails = {
      ...order,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      products: [],
      topups: [],
      files: [],
      packages: [],
      courses: [],
      services: [],
    };

    // Fetch topups if applicable
    if (order.item_types.includes(5)) {
      const [topups] = await pool.execute(
        `
          SELECT amount, created_at 
          FROM res_uwallet_recharge 
          WHERE order_id = ? AND user_id = ?
        `,
        [order_id, id]
      );

      if (topups.length) {
        orderDetails.topups.push(...topups);
      }
    }

    // Fetch products if applicable
    if (order.item_types.includes(3)) {
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
          WHERE up.order_id = ? AND up.user_id = ?
        `,
        [order_id, id]
      );

      if (products.length) {
        orderDetails.products.push(...products);
      }
    }

    // Fetch courses if applicable

    if (order.item_types.includes(4)) {
      const [courses] = await pool.execute(
        `
          SELECT 
            up.course_id, 
            rp.title, 
            rp.sale_price, 
            rp.slug,
            m.file_name AS image
          FROM res_ucourses AS up
          INNER JOIN res_courses AS rp ON up.course_id = rp.course_id
          LEFT JOIN res_course_media AS m ON rp.course_id = m.course_id AND m.is_cover = 1
          WHERE up.order_id = ? AND up.user_id = ?
        `,
        [order_id, id]
      );

      if (courses.length) {
        orderDetails.courses.push(...courses);
      }
    }

    // Fetch files if applicable
    if (order.item_types.includes(1)) {
      const [files] = await pool.execute(
        `
          SELECT 
            rf.file_id,
            rf.folder_id,
            rf.title,
            rf.thumbnail,
            rf.size,
            rf.slug,
            uf.ufile_id,
            uf.user_id,
            uf.price,
            uf.order_id
          FROM res_files rf
          JOIN res_ufiles uf ON rf.file_id = uf.file_id
          WHERE uf.order_id = ? AND uf.user_id = ?
        `,
        [order_id, id]
      );

      if (files.length) {
        // Check each file's download status
        for (const file of files) {
          const [[download]] = await pool.execute(
            `
              SELECT hash_token, expired_at 
              FROM res_udownloads 
              WHERE file_id = ? AND order_id = ? AND user_id = ?
            `,
            [file.file_id, order_id, id]
          );

          // Determine file state
          if (download) {
            const now = new Date();
            const expiredAt = download.expired_at
              ? new Date(download.expired_at)
              : null;
            file.isExpired = expiredAt && expiredAt <= now; // Check if expired
            file.canDownload = !file.isExpired; // Allow download if not expired
          } else {
            file.canDownload = true; // Default to allow download if no entry exists
          }

          orderDetails.files.push(file);
        }
      }
    }

    // fetch download package

    if (order.item_types.includes(2)) {
      const [packages] = await pool.execute(
        `SELECT * FROM res_upackages WHERE user_id = ? AND order_id = ?`,
        [id, order_id]
      );

      if (packages.length) {
        orderDetails.packages.push(...packages);
      }
    }

    if (order.item_types.includes(7)) {
      const [services] = await pool.execute(
        `
          SELECT 
            b.booking_id,
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
          WHERE b.last_order_id = ? AND b.user_id = ?
        `,
        [order_id, id]
      );

      if (services.length) {
        orderDetails.services.push(...services);
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

/**
 * Cancel an order by user and handle related cleanup:
 * - Delete associated packages
 * - Delete associated files
 * - Refund wallet amount if payment was made via wallet
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function cancelOrder(req, res) {
  const { order_id, user_id, notes= "Order Cancelled by Admin" } = req.body; 

  if (!order_id) {
    return res.status(400).json({
      status: "error",
      message: "Order ID is required.",
    });
  }
  if (!user_id) {
    return res.status(400).json({
      status: "error",
      message: "User ID is required.",
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

    // Check if order can be cancelled (only pending orders can be cancelled by users)
    if (orderDetails.order_status !== 1) {
      return res.status(400).json({
        status: "error",
        message: "Only pending orders can be cancelled.",
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

module.exports = {
  getAllOrderList,
  getOrderDetails,
  cancelOrder, // Add the new function to exports
};
  