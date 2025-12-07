const { pool } = require("../../config/database");
const { clearServiceCache } = require("../../config/smart-cache");

const tryParseJSON = (value, fallback = null) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

// Create a new service
async function createService(req, res) {
  try {
    const {
      service_name,
      slug,
      description,
      short_description,
      features,
      requirements,
      deliverables,
      base_price,
      sale_price,
      currency = 'USD',
      duration,
      delivery_time,
      min_quantity = 1,
      max_quantity,
      is_active = true,
      is_featured = false,
      is_digital = true,
      requires_consultation = false,
      is_customizable = false,
      service_type = 'standard',
      tags,
      meta_title,
      meta_description,
      status = 'active',
      sort_order = 0,
      categories = []
    } = req.body;

    // Validation
    if (!service_name || !base_price) {
      return res.status(400).json({ 
        error: "Service name and base price are required" 
      });
    }

    // Check if slug already exists
    const [existingService] = await pool.execute(
      "SELECT service_id FROM res_services WHERE slug = ?",
      [slug]
    );

    if (existingService.length > 0) {
      return res.status(400).json({ 
        error: "Service with this slug already exists" 
      });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert service
      const [result] = await connection.execute(`
        INSERT INTO res_services (
          service_name, slug, description, short_description, features, requirements,
          deliverables, base_price, sale_price, currency, duration, delivery_time,
          min_quantity, max_quantity, is_active, is_featured, is_digital,
          requires_consultation, is_customizable, service_type, tags,
          meta_title, meta_description, status, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        service_name, slug, description, short_description, 
        features ? JSON.stringify(features) : null,
        requirements, deliverables, base_price, sale_price, currency,
        duration, delivery_time, min_quantity, max_quantity, is_active,
        is_featured, is_digital, requires_consultation, is_customizable,
        service_type, tags ? JSON.stringify(tags) : null,
        meta_title, meta_description, status, sort_order
      ]);

      const serviceId = result.insertId;

      // Add categories if provided
      if (categories && categories.length > 0) {
        for (const categoryId of categories) {
          await connection.execute(
            "INSERT INTO res_service_category_relationship (service_id, category_id) VALUES (?, ?)",
            [serviceId, categoryId]
          );
        }
      }

      await connection.commit();

      // Get the created service
      const [newService] = await pool.execute(
        "SELECT * FROM res_services WHERE service_id = ?",
        [serviceId]
      );
      
      // Clear service cache after creation
      await clearServiceCache();

      res.status(201).json({
        status: "success",
        message: "Service created successfully",
        response: newService[0]
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error creating service:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all services with filtering and pagination
async function getServices(req, res) {
  try {
    const {
      page = 1,
      limit,
      perPage,
      search,
      categoryId,
      status,
      serviceType,
      isActive,
      isFeatured,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const currentPage = Number.parseInt(page, 10) || 1;
    const pageSizeRaw = Number.parseInt(
      (limit || perPage || 20).toString(),
      10,
    );
    const pageSize = Number.isNaN(pageSizeRaw) || pageSizeRaw <= 0 ? 20 : pageSizeRaw;
    const offset = (currentPage - 1) * pageSize;
    const whereConditions = [];
    const queryParams = [];

    // Build WHERE conditions
    if (search) {
      whereConditions.push('(s.service_name LIKE ? OR s.description LIKE ? OR s.slug LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (categoryId) {
      whereConditions.push('scr.category_id = ?');
      queryParams.push(categoryId);
    }

    if (status) {
      whereConditions.push('s.status = ?');
      queryParams.push(status);
    }

    if (serviceType) {
      whereConditions.push('s.service_type = ?');
      queryParams.push(serviceType);
    }

    if (isActive !== undefined) {
      whereConditions.push('s.is_active = ?');
      queryParams.push(isActive === 'true' ? 1 : 0);
    }

    if (isFeatured !== undefined) {
      whereConditions.push('s.is_featured = ?');
      queryParams.push(isFeatured === 'true' ? 1 : 0);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get services
    const [services] = await pool.execute(`
      SELECT DISTINCT
        s.service_id, s.service_name, s.slug, s.description, s.short_description,
        s.base_price, s.sale_price, s.currency, s.duration, s.delivery_time,
        s.min_quantity, s.max_quantity, s.is_active, s.is_featured, s.is_digital,
        s.requires_consultation, s.is_customizable, s.service_type, s.tags,
        s.meta_title, s.meta_description, s.status, s.sort_order,
        s.thumbnail,
        s.created_at, s.updated_at
      FROM res_services s
      LEFT JOIN res_service_category_relationship scr ON s.service_id = scr.service_id
      ${whereClause}
      ORDER BY s.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [...queryParams, pageSize, offset]);

    // Get total count
    const [countResult] = await pool.execute(`
      SELECT COUNT(DISTINCT s.service_id) as total
      FROM res_services s
      LEFT JOIN res_service_category_relationship scr ON s.service_id = scr.service_id
      ${whereClause}
    `, queryParams);

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / pageSize);

    const [statusCountsResult] = await pool.execute(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived
      FROM res_services
    `);

    const statusCounts = statusCountsResult[0] || {};

    res.status(200).json({
      status: "success",
      response: {
        data: services,
        totalCount: total,
        statusCounts: {
          active: statusCounts.active || 0,
          draft: statusCounts.draft || 0,
          archived: statusCounts.archived || 0,
        },
        pagination: {
          current_page: currentPage,
          total_pages: totalPages,
          total_items: total,
          items_per_page: pageSize,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get service by ID
async function getServiceById(req, res) {
  try {
    const { id } = req.params;

    // Get service details
    const [services] = await pool.execute(
      "SELECT * FROM res_services WHERE service_id = ?",
      [id]
    );

    if (services.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

const service = services[0];
const parsedFeatures = tryParseJSON(service.features, []);
const parsedTags = tryParseJSON(service.tags, []);
const parsedFulfillment = tryParseJSON(service.fulfillment_options, []);
const parsedSupport = tryParseJSON(service.support_channels, []);

    // Get categories
    const [categories] = await pool.execute(`
      SELECT c.category_id, c.category_name, c.slug
      FROM res_service_categories c
      JOIN res_service_category_relationship scr ON c.category_id = scr.category_id
      WHERE scr.service_id = ?
    `, [id]);

    // Get media
    const [media] = await pool.execute(`
      SELECT * FROM res_service_media
      WHERE service_id = ? AND is_active = 1
      ORDER BY sort_order ASC, created_at ASC
    `, [id]);

    // Get bookings count
    const [bookingsCount] = await pool.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN booking_status = 'pending' THEN 1 END) as pending_bookings
      FROM res_service_bookings
      WHERE service_id = ?
    `, [id]);

    res.status(200).json({
      status: "success",
      response: {
        service: {
          ...service,
          features: parsedFeatures,
          tags: parsedTags,
          fulfillment_options: parsedFulfillment,
          support_channels: parsedSupport,
        },
        categories,
        media,
        bookings: bookingsCount[0]
      }
    });
  } catch (error) {
    console.error("Error fetching service:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update service
async function updateService(req, res) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if service exists
    const [existingService] = await pool.execute(
      "SELECT service_id FROM res_services WHERE service_id = ?",
      [id]
    );

    if (existingService.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    // Check slug uniqueness if slug is being updated
    if (updateData.slug) {
      const [slugCheck] = await pool.execute(
        "SELECT service_id FROM res_services WHERE slug = ? AND service_id != ?",
        [updateData.slug, id]
      );

      if (slugCheck.length > 0) {
        return res.status(400).json({ 
          error: "Service with this slug already exists" 
        });
      }
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];

      Object.keys(updateData).forEach(key => {
        if (key !== 'categories' && updateData[key] !== undefined) {
          if (
            key === 'features' ||
            key === 'tags' ||
            key === 'fulfillment_options' ||
            key === 'support_channels'
          ) {
            updateFields.push(`${key} = ?`);
            updateValues.push(
              updateData[key] ? JSON.stringify(updateData[key]) : null,
            );
          } else {
            updateFields.push(`${key} = ?`);
            updateValues.push(updateData[key]);
          }
        }
      });

      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        updateValues.push(id);

        await connection.execute(`
          UPDATE res_services 
          SET ${updateFields.join(', ')}
          WHERE service_id = ?
        `, updateValues);
      }

      // Update categories if provided
      if (updateData.categories !== undefined) {
        // Remove existing categories
        await connection.execute(
          "DELETE FROM res_service_category_relationship WHERE service_id = ?",
          [id]
        );

        // Add new categories
        if (updateData.categories.length > 0) {
          for (const categoryId of updateData.categories) {
            await connection.execute(
              "INSERT INTO res_service_category_relationship (service_id, category_id) VALUES (?, ?)",
              [id, categoryId]
            );
          }
        }
      }

      await connection.commit();

      // Get updated service
      const [updatedService] = await pool.execute(
        "SELECT * FROM res_services WHERE service_id = ?",
        [id]
      );
      
      // Clear service cache after update
      await clearServiceCache(id);

      res.status(200).json({
        status: "success",
        message: "Service updated successfully",
        response: updatedService[0]
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Delete service
async function deleteService(req, res) {
  try {
    const { id } = req.params;

    // Check if service exists
    const [existingService] = await pool.execute(
      "SELECT service_id FROM res_services WHERE service_id = ?",
      [id]
    );

    if (existingService.length === 0) {
      return res.status(404).json({ error: "Service not found" });
    }

    // Check if service has bookings
    const [bookings] = await pool.execute(
      "SELECT COUNT(*) as count FROM res_service_bookings WHERE service_id = ?",
      [id]
    );

    if (bookings[0].count > 0) {
      return res.status(400).json({ 
        error: "Cannot delete service with existing bookings. Please archive it instead." 
      });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Delete related data
      await connection.execute(
        "DELETE FROM res_service_category_relationship WHERE service_id = ?",
        [id]
      );

      await connection.execute(
        "DELETE FROM res_service_media WHERE service_id = ?",
        [id]
      );

      // Delete service
      await connection.execute(
        "DELETE FROM res_services WHERE service_id = ?",
        [id]
      );

      await connection.commit();
      
      // Clear service cache after deletion
      await clearServiceCache(id);

      res.status(200).json({
        status: "success",
        message: "Service deleted successfully",
        response: null
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Service Categories Management

// Create service category
async function createServiceCategory(req, res) {
  try {
    const {
      category_name,
      slug,
      description,
      icon,
      color,
      sort_order = 0,
      is_active = true
    } = req.body;

    // Validation
    if (!category_name || !slug) {
      return res.status(400).json({ 
        error: "Category name and slug are required" 
      });
    }

    // Check if slug already exists
    const [existingCategory] = await pool.execute(
      "SELECT category_id FROM res_service_categories WHERE slug = ?",
      [slug]
    );

    if (existingCategory.length > 0) {
      return res.status(400).json({ 
        error: "Category with this slug already exists" 
      });
    }

    const [result] = await pool.execute(`
      INSERT INTO res_service_categories (
        category_name, slug, description, icon, color, sort_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [category_name, slug, description, icon, color, sort_order, is_active]);

    const [newCategory] = await pool.execute(
      "SELECT * FROM res_service_categories WHERE category_id = ?",
      [result.insertId]
    );

    res.status(201).json({
      status: "success",
      message: "Service category created successfully",
      response: newCategory[0]
    });
  } catch (error) {
    console.error("Error creating service category:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get service categories
async function getServiceCategories(req, res) {
  try {
    const { is_active, sortBy = 'sort_order', sortOrder = 'ASC' } = req.query;

    let whereClause = '';
    let queryParams = [];

    if (is_active !== undefined) {
      whereClause = 'WHERE is_active = ?';
      queryParams.push(is_active === 'true' ? 1 : 0);
    }

    const [categories] = await pool.execute(`
      SELECT 
        c.*,
        COUNT(s.service_id) as service_count
      FROM res_service_categories c
      LEFT JOIN res_service_category_relationship scr ON c.category_id = scr.category_id
      LEFT JOIN res_services s ON scr.service_id = s.service_id AND s.is_active = 1
      ${whereClause}
      GROUP BY c.category_id
      ORDER BY c.${sortBy} ${sortOrder}
    `, queryParams);

    res.status(200).json({
      status: "success",
      response: categories
    });
  } catch (error) {
    console.error("Error fetching service categories:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Service Bookings Management

// Create service booking
async function createServiceBooking(req, res) {
  try {
    const {
      service_id,
      user_id,
      customer_name,
      customer_email,
      customer_phone,
      customer_message,
      service_requirements,
      total_price,
      currency = 'USD',
      preferred_date,
      notes
    } = req.body;

    // Validation
    if (!service_id || !customer_name || !customer_email || !total_price) {
      return res.status(400).json({ 
        error: "Service ID, customer name, email, and total price are required" 
      });
    }

    // Check if service exists
    const [service] = await pool.execute(
      "SELECT * FROM res_services WHERE service_id = ? AND is_active = 1",
      [service_id]
    );

    if (service.length === 0) {
      return res.status(404).json({ error: "Service not found or inactive" });
    }

    const [result] = await pool.execute(`
      INSERT INTO res_service_bookings (
        service_id, user_id, customer_name, customer_email, customer_phone,
        customer_message, service_requirements, total_price, currency,
        preferred_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      service_id, user_id, customer_name, customer_email, customer_phone,
      customer_message, service_requirements, total_price, currency,
      preferred_date, notes
    ]);

    const [newBooking] = await pool.execute(`
      SELECT 
        b.*,
        s.service_name, s.slug
      FROM res_service_bookings b
      JOIN res_services s ON b.service_id = s.service_id
      WHERE b.booking_id = ?
    `, [result.insertId]);

    res.status(201).json({
      status: "success",
      message: "Service booking created successfully",
      response: newBooking[0]
    });
  } catch (error) {
    console.error("Error creating service booking:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get service bookings
async function getServiceBookings(req, res) {
  try {
    const {
      page = 1,
      limit,
      perPage,
      serviceId,
      bookingStatus,
      paymentStatus,
      customerEmail,
      startDate,
      endDate,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const pageSize = parseInt(limit || perPage || 20);
    const offset = (page - 1) * pageSize;
    const whereConditions = [];
    const queryParams = [];

    if (serviceId) {
      whereConditions.push('b.service_id = ?');
      queryParams.push(serviceId);
    }

    if (bookingStatus) {
      whereConditions.push('b.booking_status = ?');
      queryParams.push(bookingStatus);
    }

    if (paymentStatus) {
      whereConditions.push('b.payment_status = ?');
      queryParams.push(paymentStatus);
    }

    if (customerEmail) {
      whereConditions.push('b.customer_email LIKE ?');
      queryParams.push(`%${customerEmail}%`);
    }

    if (startDate) {
      whereConditions.push('b.created_at >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push('b.created_at <= ?');
      queryParams.push(endDate);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const [bookings] = await pool.execute(`
      SELECT 
        b.*,
        /* Derive a consistent booking_status reflecting completion rules */
        CASE
          WHEN b.booking_status = 'completed' OR b.completed_date IS NOT NULL OR b.payment_status = 'paid'
            THEN 'completed'
          ELSE b.booking_status
        END AS booking_status,
        s.service_name, s.slug
      FROM res_service_bookings b
      JOIN res_services s ON b.service_id = s.service_id
      ${whereClause}
      ORDER BY b.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `, [...queryParams, pageSize, parseInt(offset)]);

    // Get total count
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM res_service_bookings b
      JOIN res_services s ON b.service_id = s.service_id
      ${whereClause}
    `, queryParams);

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / pageSize);

    const [bookingStatsResult] = await pool.execute(`
      SELECT 
        SUM(CASE WHEN (booking_status = 'completed' OR completed_date IS NOT NULL OR payment_status = 'paid') THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN booking_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN booking_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(total_price) as totalRevenue
      FROM res_service_bookings
    `);

    const bookingStats = bookingStatsResult[0] || {};

    res.status(200).json({
      status: "success",
      response: {
        data: bookings,
        totalCount: total,
        statusCounts: {
          pending: bookingStats.pending || 0,
          confirmed: bookingStats.confirmed || 0,
          completed: bookingStats.completed || 0,
          cancelled: bookingStats.cancelled || 0,
        },
        totalRevenue: Number(bookingStats.totalRevenue || 0),
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: total,
          items_per_page: pageSize,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    console.error("Error fetching service bookings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update service booking status
async function updateServiceBookingStatus(req, res) {
  try {
    const { id } = req.params;
    const { booking_status, payment_status, scheduled_date, completed_date, notes } = req.body;

    // Check if booking exists
    const [existingBooking] = await pool.execute(
      "SELECT booking_id FROM res_service_bookings WHERE booking_id = ?",
      [id]
    );

    if (existingBooking.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const updateFields = [];
    const updateValues = [];

    if (booking_status !== undefined) {
      updateFields.push('booking_status = ?');
      updateValues.push(booking_status);
    }

    if (payment_status !== undefined) {
      updateFields.push('payment_status = ?');
      updateValues.push(payment_status);
    }

    if (scheduled_date !== undefined) {
      updateFields.push('scheduled_date = ?');
      updateValues.push(scheduled_date);
    }

    if (completed_date !== undefined) {
      updateFields.push('completed_date = ?');
      updateValues.push(completed_date);
    }

    if (notes !== undefined) {
      updateFields.push('notes = ?');
      updateValues.push(notes);
    }

    if (updateFields.length > 0) {
      updateFields.push('updated_at = NOW()');
      updateValues.push(id);

      await pool.execute(`
        UPDATE res_service_bookings 
        SET ${updateFields.join(', ')}
        WHERE booking_id = ?
      `, updateValues);
    }

    // Get updated booking
    const [updatedBooking] = await pool.execute(`
      SELECT 
        b.*,
        s.service_name, s.slug
      FROM res_service_bookings b
      JOIN res_services s ON b.service_id = s.service_id
      WHERE b.booking_id = ?
    `, [id]);

    // Emit socket event to notify user about status change
    try {
      const io = req.app.get('io');
      if (io && updatedBooking?.[0]?.booking_id) {
        io.to(`booking:${updatedBooking[0].booking_id}`).emit('booking:update', {
          booking_id: updatedBooking[0].booking_id,
          booking_status: updatedBooking[0].booking_status,
          payment_status: updatedBooking[0].payment_status,
          updated_at: updatedBooking[0].updated_at,
        });
      }
    } catch (emitErr) {
      // Non-blocking
    }

    res.status(200).json({
      status: "success",
      message: "Booking status updated successfully",
      response: updatedBooking[0]
    });
  } catch (error) {
    console.error("Error updating booking status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  // Service CRUD
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
  
  // Service Categories
  createServiceCategory,
  getServiceCategories,
  
  // Service Bookings
  createServiceBooking,
  getServiceBookings,
  updateServiceBookingStatus
};
