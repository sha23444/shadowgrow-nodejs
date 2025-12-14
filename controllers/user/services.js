const { pool } = require('../../config/database');
const ServiceCheckoutManager = require('../../services/ServiceCheckoutManager');

const parseJSON = (value, fallback) => {
  if (!value) return fallback || null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback || null;
  }
};

const normalizeService = (row) => ({
  ...row,
  // Map base_price to original_price for consistency with product price calculation
  original_price: row.base_price || row.original_price || '0',
  features: parseJSON(row.features, []),
  tags: parseJSON(row.tags, []),
  fulfillment_options: parseJSON(row.fulfillment_options, []),
  support_channels: parseJSON(row.support_channels, []),
});

const attachRelations = (services, categoriesMap, mediaMap) => {
  return services.map((service) => ({
    ...service,
    categories: categoriesMap[service.service_id] || [],
    media: mediaMap[service.service_id] || [],
  }));
};

const fetchRelations = async (serviceIds) => {
  if (serviceIds.length === 0) {
    return { categoriesMap: {}, mediaMap: {} };
  }

  const placeholders = serviceIds.map(() => '?').join(',');

  const [categoryRows] = await pool.query(
    `
      SELECT scr.service_id, c.category_id, c.category_name, c.slug
      FROM res_service_category_relationship scr
      JOIN res_service_categories c ON c.category_id = scr.category_id
      WHERE scr.service_id IN (${placeholders}) AND c.is_active = 1
      ORDER BY c.sort_order ASC, c.category_name ASC
    `,
    serviceIds
  );

  const [mediaRows] = await pool.query(
    `
      SELECT media_id, service_id, file_name, file_path, file_type, mime_type, alt_text, caption, is_cover, sort_order
      FROM res_service_media
      WHERE service_id IN (${placeholders}) AND is_active = 1
      ORDER BY sort_order ASC, created_at ASC
    `,
    serviceIds
  );

  const categoriesMap = categoryRows.reduce((acc, row) => {
    acc[row.service_id] = acc[row.service_id] || [];
    acc[row.service_id].push({
      category_id: row.category_id,
      category_name: row.category_name,
      service_id: row.service_id,
      slug: row.slug,
    });
    return acc;
  }, {});

  const mediaMap = mediaRows.reduce((acc, row) => {
    acc[row.service_id] = acc[row.service_id] || [];
    acc[row.service_id].push(row);
    return acc;
  }, {});

  return { categoriesMap, mediaMap };
};

async function getServices(req, res) {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      category,
      deliveryType,
      sort = 'latest',
      featured,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    const whereConditions = ['s.is_active = 1', "s.status = 'active'"];
    const queryParams = [];

    if (search) {
      whereConditions.push('(s.service_name LIKE ? OR s.description LIKE ? OR s.short_description LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category) {
      if (!Number.isNaN(Number(category))) {
        whereConditions.push('scr.category_id = ?');
        queryParams.push(Number(category));
      } else {
        whereConditions.push('c.slug = ?');
        queryParams.push(category);
      }
    }

    if (deliveryType) {
      whereConditions.push('s.fulfillment_options LIKE ?');
      queryParams.push(`%"type":"${deliveryType}"%`);
    }

    if (featured === 'true') {
      whereConditions.push('s.is_featured = 1');
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    let orderBy = 's.is_featured DESC, s.created_at DESC';
    if (sort === 'price_asc') orderBy = 'COALESCE(s.sale_price, s.base_price) ASC';
    if (sort === 'price_desc') orderBy = 'COALESCE(s.sale_price, s.base_price) DESC';
    if (sort === 'oldest') orderBy = 's.created_at ASC';

    const [serviceRows] = await pool.execute(
      `
        SELECT DISTINCT s.*
        FROM res_services s
        LEFT JOIN res_service_category_relationship scr ON s.service_id = scr.service_id
        LEFT JOIN res_service_categories c ON c.category_id = scr.category_id
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [...queryParams, Number(limit), offset]
    );

    const [countRows] = await pool.execute(
      `
        SELECT COUNT(DISTINCT s.service_id) as total
        FROM res_services s
        LEFT JOIN res_service_category_relationship scr ON s.service_id = scr.service_id
        LEFT JOIN res_service_categories c ON c.category_id = scr.category_id
        ${whereClause}
      `,
      queryParams
    );

    const total = countRows[0]?.total || 0;
    const totalPages = Math.ceil(total / Number(limit));

    const transformed = serviceRows.map(normalizeService);
    const serviceIds = transformed.map((service) => service.service_id);
    const { categoriesMap, mediaMap } = await fetchRelations(serviceIds);
    const services = attachRelations(transformed, categoriesMap, mediaMap);

    res.json({
      status: 'success',
      response: {
        data: services,
        pagination: {
          current_page: Number(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: Number(limit),
          has_next: Number(page) < totalPages,
          has_prev: Number(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching services list:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load services' });
  }
}

async function getServiceCategories(req, res) {
  try {
    const [rows] = await pool.execute(
      `
        SELECT category_id, category_name, slug, description, icon, color, sort_order
        FROM res_service_categories
        WHERE is_active = 1
        ORDER BY sort_order ASC, category_name ASC
      `
    );

    res.json({
      status: 'success',
      response: { data: rows },
    });
  } catch (error) {
    console.error('Error fetching service categories:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load service categories' });
  }
}

async function getServiceBySlug(req, res) {
  try {
    const { slug } = req.params;
    const [rows] = await pool.execute(
      `
        SELECT * FROM res_services
        WHERE slug = ? AND is_active = 1 AND status = 'active'
        LIMIT 1
      `,
      [slug]
    );

    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Service not found' });
    }

    const service = normalizeService(rows[0]);
    const { categoriesMap, mediaMap } = await fetchRelations([service.service_id]);
    service.categories = categoriesMap[service.service_id] || [];
    service.media = mediaMap[service.service_id] || [];

    res.json({
      status: 'success',
      response: { data: service },
    });
  } catch (error) {
    console.error('Error fetching service detail:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load service' });
  }
}

async function createServiceBooking(req, res) {
  try {
    const { serviceId } = req.params;
    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_message,
      fulfillment_type,
      preferred_date,
      requirements,
    } = req.body;

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required to book a service.',
      });
    }

    if (!customer_name || !customer_email) {
      return res.status(400).json({
        status: 'error',
        message: 'Customer name and email are required.',
      });
    }

    const numericServiceId = Number(serviceId);
    if (Number.isNaN(numericServiceId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid service reference' });
    }

    const [services] = await pool.execute(
      `
        SELECT service_id, service_name, sale_price, base_price, currency, fulfillment_options
        FROM res_services
        WHERE service_id = ? AND is_active = 1 AND status = 'active'
        LIMIT 1
      `,
      [numericServiceId]
    );

    if (!services.length) {
      return res.status(404).json({ status: 'error', message: 'Service not found' });
    }

    const service = services[0];
    const serviceFulfillment = parseJSON(service.fulfillment_options, []);
    let resolvedFulfillmentType = fulfillment_type || null;
    if (!resolvedFulfillmentType && serviceFulfillment.length === 1) {
      resolvedFulfillmentType = serviceFulfillment[0].type;
    }

    if (resolvedFulfillmentType) {
      const supported = serviceFulfillment.some((option) => option.type === resolvedFulfillmentType);
      if (!supported) {
        return res.status(400).json({
          status: 'error',
          message: 'Selected fulfillment type is not available for this service.',
        });
      }
    }

    const price = Number(service.sale_price || service.base_price || 0);
    if (!price) {
      return res.status(400).json({
        status: 'error',
        message: 'Service price is not configured. Please contact support.',
      });
    }

    const userId = req.user?.id || null;
    const preferredDateValue = preferred_date ? new Date(preferred_date) : null;
    const preferredDateParam = preferredDateValue && !Number.isNaN(preferredDateValue.getTime())
      ? preferredDateValue
      : null;

    const [result] = await pool.execute(
      `
        INSERT INTO res_service_bookings
        (service_id, user_id, customer_name, customer_email, customer_phone, customer_message,
         service_requirements, total_price, currency, booking_status, payment_status,
        preferred_date, created_at, updated_at, fulfillment_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, NOW(), NOW(), ?)
      `,
      [
        numericServiceId,
        userId,
        customer_name,
        customer_email,
        customer_phone || null,
        customer_message || null,
        requirements || null,
        price,
        service.currency || 'USD',
        preferredDateParam,
        resolvedFulfillmentType,
      ]
    );

    // Emit socket events
    try {
      const io = req.app.get('io');
      if (io && result?.insertId) {
        // Room for this booking
        io.to(`booking:${result.insertId}`).emit('booking:update', {
          booking_id: result.insertId,
          booking_status: 'pending',
          payment_status: 'pending',
          created_at: new Date().toISOString(),
        });
        // Generic notification
        io.emit('notification', {
          type: 'success',
          title: 'Booking created',
          message: `Your booking #${result.insertId} has been created and is pending confirmation.`,
        });
      }
    } catch {}

    res.status(201).json({
      status: 'success',
      message: 'Your request has been submitted. Our team will contact you shortly.',
      data: {
        booking_id: result.insertId,
        booking_status: 'pending',
      },
    });
  } catch (error) {
    console.error('Error creating service booking:', error);
    res.status(500).json({ status: 'error', message: 'Failed to submit service booking' });
  }
}

async function getServiceBookingById(req, res) {
  try {
    const { bookingId } = req.params;
    const numericId = Number(bookingId);

    if (!req.user || !req.user.id) {
      return res.status(401).json({ status: 'error', message: 'Authentication required.' });
    }

    if (Number.isNaN(numericId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid booking reference.' });
    }

    const [rows] = await pool.execute(
      `
        SELECT 
          b.*,
          /* Normalize status for users: only show completed if actually completed */
          CASE
            WHEN b.booking_status = 'completed' OR b.completed_date IS NOT NULL
              THEN 'completed'
            ELSE b.booking_status
          END AS booking_status,
          s.service_name, s.slug, s.service_type, s.currency
        FROM res_service_bookings b
        JOIN res_services s ON s.service_id = b.service_id
        WHERE b.booking_id = ? AND b.user_id = ?
      `,
      [numericId, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Booking not found.' });
    }

    res.json({ status: 'success', data: rows[0] });
  } catch (error) {
    console.error('Error fetching booking detail:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load booking.' });
  }
}

async function updateServiceBookingPayment(req, res) {
  try {
    const { bookingId } = req.params;
    const numericId = Number(bookingId);

    if (!req.user || !req.user.id) {
      return res.status(401).json({ status: 'error', message: 'Authentication required.' });
    }

    if (Number.isNaN(numericId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid booking reference.' });
    }

    const [bookings] = await pool.execute(
      `
        SELECT booking_id, payment_status, booking_status
        FROM res_service_bookings
        WHERE booking_id = ? AND user_id = ?
      `,
      [numericId, req.user.id]
    );

    if (!bookings.length) {
      return res.status(404).json({ status: 'error', message: 'Booking not found.' });
    }

    await pool.execute(
      `
        UPDATE res_service_bookings
        SET payment_status = 'paid', booking_status = 'confirmed', updated_at = NOW()
        WHERE booking_id = ?
      `,
      [numericId]
    );

    // Emit socket update for this booking
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`booking:${numericId}`).emit('booking:update', {
          booking_id: numericId,
          booking_status: 'confirmed',
          payment_status: 'paid',
          updated_at: new Date().toISOString(),
        });
      }
    } catch {}

    res.json({
      status: 'success',
      message: 'Payment confirmed. Your service is now scheduled.',
    });
  } catch (error) {
    console.error('Error updating booking payment:', error);
    res.status(500).json({ status: 'error', message: 'Failed to confirm payment.' });
  }
}

async function updateServiceBookingStatus(req, res) {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;
    const numericId = Number(bookingId);

    if (!req.user || !req.user.id) {
      return res.status(401).json({ status: 'error', message: 'Authentication required.' });
    }

    if (!status || !['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid status value.' });
    }

    if (Number.isNaN(numericId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid booking reference.' });
    }

    const [bookings] = await pool.execute(
      `
        SELECT booking_id FROM res_service_bookings
        WHERE booking_id = ? AND user_id = ?
      `,
      [numericId, req.user.id]
    );

    if (!bookings.length) {
      return res.status(404).json({ status: 'error', message: 'Booking not found.' });
    }

    const completedDate =
      status === 'completed' ? new Date() : null;

    await pool.execute(
      `
        UPDATE res_service_bookings
        SET booking_status = ?, completed_date = ?, updated_at = NOW()
        WHERE booking_id = ?
      `,
      [status, completedDate, numericId]
    );

    // Emit socket update for this booking
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`booking:${numericId}`).emit('booking:update', {
          booking_id: numericId,
          booking_status: status,
          updated_at: new Date().toISOString(),
        });
      }
    } catch {}

    res.json({
      status: 'success',
      message: `Booking status updated to ${status}.`,
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update status.' });
  }
}

async function prepareServiceCheckout(req, res) {
  try {
    const { bookingId } = req.params;
    const numericId = Number(bookingId);

    if (Number.isNaN(numericId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid booking reference.' });
    }

    const result = await ServiceCheckoutManager.prepareCheckout({
      bookingId: numericId,
      userId: req.user.id,
    });

    res.json({ status: 'success', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to prepare checkout.';
    console.error('Error preparing service checkout:', error);
    res.status(400).json({ status: 'error', message });
  }
}

async function markBookingPaymentByOrder(req, res) {
  try {
    const { orderId } = req.params;
    const numericOrderId = Number(orderId);

    if (Number.isNaN(numericOrderId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid order reference.' });
    }

    const bookingId = await ServiceCheckoutManager.markPaymentByOrder(numericOrderId, req.user.id);

    if (!bookingId) {
      return res.status(404).json({ status: 'error', message: 'No booking found for this order.' });
    }

    // Emit socket update for this booking
    try {
      const io = req.app.get('io');
      if (io && bookingId) {
        io.to(`booking:${bookingId}`).emit('booking:update', {
          booking_id: bookingId,
          payment_status: 'paid',
          booking_status: 'confirmed', // Keep as 'confirmed' - admin will manually set to 'completed'
          updated_at: new Date().toISOString(),
        });
      }
    } catch {}

    res.json({
      status: 'success',
      message: 'Payment confirmed for your booking.',
      data: { booking_id: bookingId },
    });
  } catch (error) {
    console.error('Error marking booking payment by order:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update booking payment.' });
  }
}

// List current user's service bookings
async function listMyServiceBookings(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ status: 'error', message: 'Authentication required.' });
    }
    const { page = 1, limit = 20 } = req.query;
    const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (Number(page) - 1) * pageSize;

    const [rows] = await pool.execute(
      `
        SELECT 
          b.booking_id,
          b.service_id,
          s.service_name,
          s.slug,
          b.total_price,
          b.currency,
          b.payment_status,
          CASE
            WHEN b.booking_status = 'completed' OR b.completed_date IS NOT NULL
              THEN 'completed'
            ELSE b.booking_status
          END AS booking_status,
          b.preferred_date,
          b.created_at
        FROM res_service_bookings b
        JOIN res_services s ON s.service_id = b.service_id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [req.user.id, pageSize, offset]
    );

    const [countRows] = await pool.execute(
      `
        SELECT COUNT(*) as total
        FROM res_service_bookings
        WHERE user_id = ?
      `,
      [req.user.id]
    );
    const total = countRows?.[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    res.json({
      status: 'success',
      data: rows,
      pagination: {
        page: Number(page),
        limit: pageSize,
        total,
        total_pages: totalPages,
        has_next: Number(page) < totalPages,
        has_prev: Number(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error listing user service bookings:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load bookings.' });
  }
}

module.exports = {
  getServices,
  getServiceCategories,
  getServiceBySlug,
  createServiceBooking,
  getServiceBookingById,
  updateServiceBookingPayment,
  updateServiceBookingStatus,
  prepareServiceCheckout,
  markBookingPaymentByOrder,
  listMyServiceBookings,
};

