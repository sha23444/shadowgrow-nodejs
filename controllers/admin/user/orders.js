const { pool } = require("../../../config/database");

const SAFE_EXCHANGE_RATE_EXPRESSION = `CASE WHEN o.exchange_rate IS NULL OR o.exchange_rate = 0 THEN 1 ELSE o.exchange_rate END`;

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
      symbol: symbolRow ? symbolRow.option_value : '$',
    };
  } catch (error) {
    console.error('Error fetching base currency info:', error);
    return {
      code: 'USD',
      symbol: '$',
    };
  }
}

async function getAllOrderList(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Current page, default to 1
  const limit = parseInt(req.query.limit, 10) || 10; // Items per page, default to 20
  const offset = (page - 1) * limit; // Calculate offset for pagination
  const search = req.query.search || ""; // Search term, default to empty string
  const user_id = req.query.user_id;

  // Check if user_id is provided
  if (!user_id) {
    return res.status(400).json({
      status: "error",
      message: "user_id is required",
    });
  }

  try {
    const baseCurrency = await getBaseCurrencyInfo();

    // Base query for total count of orders
    let totalQuery = `
      SELECT COUNT(*) as total 
      FROM res_orders AS o 
      WHERE o.order_id LIKE ? 
    `;
    let totalParams = [`%${search}%`];

    // Add condition for user_id
    totalQuery += ` AND o.user_id = ?`;
    totalParams.push(user_id);

    // Fetch total count of orders for pagination
    const [[{ total }]] = await pool.execute(totalQuery, totalParams);

    // Base query for fetching orders and user details
    let ordersQuery = `
      SELECT 
        o.*, 
        u.user_id, 
        u.username, 
        u.email, 
        u.phone, 
        u.first_name,
        u.last_name,
        o.amount_due / ${SAFE_EXCHANGE_RATE_EXPRESSION} AS amount_due_converted,
        o.amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION} AS amount_paid_converted,
        ${SAFE_EXCHANGE_RATE_EXPRESSION} AS normalized_exchange_rate
      FROM res_orders AS o
      LEFT JOIN res_users AS u ON o.user_id = u.user_id
      WHERE o.order_id LIKE ?
    `;
    let ordersParams = [`%${search}%`];

    // Add condition for user_id
    ordersQuery += ` AND o.user_id = ?`;
    ordersParams.push(user_id);

    ordersQuery += `
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;
    ordersParams.push(limit, offset);

    // Fetch paginated orders
    const [orders] = await pool.execute(ordersQuery, ordersParams);

    // Map and initialize grouped orders with user details
    const groupedOrders = orders.map(order => {
      const safeRate = Number(order.normalized_exchange_rate || 1) || 1;
      const originalExchangeRate = Number(order.exchange_rate || 0) || null;
      const amountDueConverted =
        order.amount_due_converted != null
          ? Number(order.amount_due_converted)
          : Number(order.amount_due || 0) / safeRate;
      const amountPaidConverted =
        order.amount_paid_converted != null
          ? Number(order.amount_paid_converted)
          : Number(order.amount_paid || 0) / safeRate;

      return {
      order_id: order.order_id,
      created_at: order.created_at,
        amount_due: Number.isFinite(amountDueConverted) ? amountDueConverted : 0,
        amount_paid: Number.isFinite(amountPaidConverted) ? amountPaidConverted : 0,
        amount_due_original: Number(order.amount_due || 0),
        amount_paid_original: Number(order.amount_paid || 0),
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      order_status: order.order_status,
        currency: baseCurrency.code,
        original_currency: order.currency,
        exchange_rate: safeRate,
        original_exchange_rate: originalExchangeRate,
      item_types: JSON.parse(order.item_types || "[]"), // Parse item_type JSON
      user_id: order.user_id,
      username: order.username,
      email: order.email,
      first_name: order.first_name,
      last_name: order.last_name,
      phone: order.phone,
      products: [],
      files: [],
      topups: [],
      };
    });

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
              WHERE order_id = ?
            `,
            [order_id]
          );

          if (topups.length) {
            const safeRate = Number(order.exchange_rate || 1) || 1;
            topups.forEach(topup => {
              const originalAmount = Number(topup.amount ?? 0);
              const converted = originalAmount / safeRate;
              order.topups.push({
                ...topup,
                amount: Number.isFinite(originalAmount) ? originalAmount : Number(topup.amount ?? 0),
                amount_converted: Number.isFinite(converted) ? converted : originalAmount,
                currency: baseCurrency.code,
              });
            });
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
              WHERE up.order_id = ?
            `,
            [order_id]
          );

          if (products.length) {
            order.products.push(...products);
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
      currency: baseCurrency,
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

    // Initialize details
    const orderDetails = {
      ...order,
      products: [],
      topups: [],
      files: [],
      packages: [],
      courses: [],
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

module.exports = {
  getAllOrderList,
  getOrderDetails,
};
