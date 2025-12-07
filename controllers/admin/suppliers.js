const { pool } = require("../../config/database");

// Create a new supplier
async function createSupplier(req, res) {
  try {
    const {
      supplier_name,
      contact_person,
      email,
      phone,
      mobile,
      website,
      address,
      city,
      state,
      country,
      postal_code,
      tax_id,
      gst_number,
      credit_limit = 0,
      payment_terms_days = 30,
      notes,
      status
    } = req.body;

    // Set default status to 'active' if not provided or empty
    const supplierStatus = status && status.trim() !== '' ? status : 'active';

    // Validation
    if (!supplier_name || supplier_name.trim() === '') {
      return res.status(400).json({ 
        error: "Supplier name is required and cannot be empty" 
      });
    }

    // Validate email format if provided
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ 
          error: "Please provide a valid email address" 
        });
      }
    }

    // Validate status (default to 'active' if not provided)
    const validStatuses = ['active', 'inactive', 'suspended'];
    if (!validStatuses.includes(supplierStatus)) {
      return res.status(400).json({ 
        error: "Status must be one of: active, inactive, or suspended" 
      });
    }

    // Validate numeric fields
    if (credit_limit !== undefined && (isNaN(credit_limit) || credit_limit < 0)) {
      return res.status(400).json({ 
        error: "Credit limit must be a positive number" 
      });
    }

    if (payment_terms_days !== undefined && (isNaN(payment_terms_days) || payment_terms_days < 0)) {
      return res.status(400).json({ 
        error: "Payment terms days must be a positive number" 
      });
    }

    // Check if supplier name already exists
    const [existingSupplier] = await pool.execute(
      "SELECT supplier_id FROM res_suppliers WHERE supplier_name = ?",
      [supplier_name.trim()]
    );
    if (existingSupplier.length > 0) {
      return res.status(409).json({ 
        error: "A supplier with this name already exists" 
      });
    }

    // Check if email already exists
    if (email && email.trim() !== '') {
      const [existingEmail] = await pool.execute(
        "SELECT supplier_id FROM res_suppliers WHERE email = ?",
        [email.trim()]
      );
      if (existingEmail.length > 0) {
        return res.status(409).json({ 
          error: "A supplier with this email already exists" 
        });
      }
    }

    // Insert supplier
    const [result] = await pool.execute(
      `INSERT INTO res_suppliers (
        supplier_name, contact_person, email, phone, mobile, website,
        address, city, state, country, postal_code, tax_id, gst_number,
        credit_limit, payment_terms_days, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        supplier_name.trim(), 
        contact_person ? contact_person.trim() : null, 
        email ? email.trim() : null, 
        phone ? phone.trim() : null, 
        mobile ? mobile.trim() : null, 
        website ? website.trim() : null,
        address ? address.trim() : null, 
        city ? city.trim() : null, 
        state ? state.trim() : null, 
        country ? country.trim() : null, 
        postal_code ? postal_code.trim() : null, 
        tax_id ? tax_id.trim() : null, 
        gst_number ? gst_number.trim() : null,
        credit_limit, 
        payment_terms_days, 
        notes ? notes.trim() : null, 
        supplierStatus
      ]
    );

    // Get the created supplier
    const [supplier] = await pool.execute(
      "SELECT * FROM res_suppliers WHERE supplier_id = ?",
      [result.insertId]
    );

    res.status(201).json({
      status: "success",
      message: "Supplier created successfully",
      data: supplier[0]
    });
  } catch (error) {
    console.error("Error creating supplier:", error);
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('email')) {
        return res.status(409).json({ 
          error: "A supplier with this email already exists" 
        });
      } else if (error.message.includes('supplier_name')) {
        return res.status(409).json({ 
          error: "A supplier with this name already exists" 
        });
      } else {
        return res.status(409).json({ 
          error: "Duplicate entry found. Please check your data." 
        });
      }
    }
    
    if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ 
        error: "One or more fields exceed the maximum allowed length" 
      });
    }
    
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ 
        error: "Required fields cannot be null" 
      });
    }
    
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE') {
      return res.status(400).json({ 
        error: "Invalid data format provided" 
      });
    }
    
    // Generic error for other cases
    res.status(500).json({ 
      error: "Failed to create supplier. Please try again." 
    });
  }
}

// Get all suppliers with pagination and filtering
async function getSuppliers(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.perPage, 10) || parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build WHERE conditions
    const whereConditions = [];
    const queryParams = [];

    // Search filtering
    if (search) {
      whereConditions.push(`(
        supplier_name LIKE ? OR 
        contact_person LIKE ? OR 
        email LIKE ? OR 
        phone LIKE ? OR 
        mobile LIKE ? OR
        city LIKE ? OR
        state LIKE ? OR
        country LIKE ?
      )`);
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Status filtering
    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    // Build query
    let baseQuery = `
      SELECT 
        supplier_id, supplier_name, contact_person, email, phone, mobile,
        website, address, city, state, country, postal_code, tax_id,
        gst_number, credit_limit, payment_terms_days, notes, status,
        created_at, updated_at
      FROM res_suppliers
    `;

    if (whereConditions.length > 0) {
      baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add sorting and pagination
    baseQuery += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    // Execute main query
    const [suppliers] = await pool.execute(baseQuery, queryParams);

    // Get total count
    let countQuery = `SELECT COUNT(*) AS total FROM res_suppliers`;
    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const [[{ total }]] = await pool.execute(countQuery, countParams);

    // Get status counts
    let statusCountQuery = `SELECT 
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
      COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_count,
      COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_count,
      COUNT(*) as total_all
    FROM res_suppliers`;
    
    let statusCountParams = [];
    
    if (search) {
      const searchCondition = `(
        supplier_name LIKE ? OR 
        contact_person LIKE ? OR 
        email LIKE ? OR 
        phone LIKE ? OR 
        mobile LIKE ? OR
        city LIKE ? OR
        state LIKE ? OR
        country LIKE ?
      )`;
      statusCountQuery += ` WHERE ${searchCondition}`;
      const searchPattern = `%${search}%`;
      statusCountParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    const [[statusCounts]] = await pool.execute(statusCountQuery, statusCountParams);

    res.status(200).json({
      status: "success",
      response: {
        data: suppliers,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        statusCounts: {
          active: parseInt(statusCounts.active_count) || 0,
          inactive: parseInt(statusCounts.inactive_count) || 0,
          suspended: parseInt(statusCounts.suspended_count) || 0,
          total: parseInt(statusCounts.total_all) || 0
        }
      }
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get supplier by ID
async function getSupplierById(req, res) {
  try {
    const { id } = req.params;

    const [suppliers] = await pool.execute(
      "SELECT * FROM res_suppliers WHERE supplier_id = ?",
      [id]
    );

    if (suppliers.length === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Get products supplied by this supplier
    const [products] = await pool.execute(
      `SELECT 
        product_id, product_name, sku, sale_price, original_price, 
        stock_quantity, status, created_at
      FROM res_products 
      WHERE supplier = ?`,
      [suppliers[0].supplier_name]
    );

    res.status(200).json({
      status: "success",
      data: {
        ...suppliers[0],
        products: products
      }
    });
  } catch (error) {
    console.error("Error fetching supplier:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update supplier
async function updateSupplier(req, res) {
  try {
    const { id } = req.params;
    const {
      supplier_name,
      contact_person,
      email,
      phone,
      mobile,
      website,
      address,
      city,
      state,
      country,
      postal_code,
      tax_id,
      gst_number,
      credit_limit,
      payment_terms_days,
      notes,
      status
    } = req.body;

    // Validate supplier ID
    if (!id || isNaN(id)) {
      return res.status(400).json({ 
        error: "Invalid supplier ID provided" 
      });
    }

    // Check if supplier exists
    const [existingSupplier] = await pool.execute(
      "SELECT supplier_id FROM res_suppliers WHERE supplier_id = ?",
      [id]
    );

    if (existingSupplier.length === 0) {
      return res.status(404).json({ 
        error: "Supplier not found" 
      });
    }

    // Validate email format if provided
    if (email && email.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ 
          error: "Please provide a valid email address" 
        });
      }
    }

    // Validate status if provided
    if (status !== undefined) {
      const validStatuses = ['active', 'inactive', 'suspended'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: "Status must be one of: active, inactive, or suspended" 
        });
      }
    }

    // Validate numeric fields
    if (credit_limit !== undefined && (isNaN(credit_limit) || credit_limit < 0)) {
      return res.status(400).json({ 
        error: "Credit limit must be a positive number" 
      });
    }

    if (payment_terms_days !== undefined && (isNaN(payment_terms_days) || payment_terms_days < 0)) {
      return res.status(400).json({ 
        error: "Payment terms days must be a positive number" 
      });
    }

    // Check if supplier name already exists (excluding current supplier)
    if (supplier_name !== undefined && supplier_name.trim() !== '') {
      const [existingSupplierName] = await pool.execute(
        "SELECT supplier_id FROM res_suppliers WHERE supplier_name = ? AND supplier_id != ?",
        [supplier_name.trim(), id]
      );
      if (existingSupplierName.length > 0) {
        return res.status(409).json({ 
          error: "A supplier with this name already exists" 
        });
      }
    }

    // Check if email already exists (excluding current supplier)
    if (email && email.trim() !== '') {
      const [existingEmail] = await pool.execute(
        "SELECT supplier_id FROM res_suppliers WHERE email = ? AND supplier_id != ?",
        [email.trim(), id]
      );
      if (existingEmail.length > 0) {
        return res.status(409).json({ 
          error: "A supplier with this email already exists" 
        });
      }
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];

    if (supplier_name !== undefined) {
      updateFields.push('supplier_name = ?');
      updateValues.push(supplier_name ? supplier_name.trim() : null);
    }
    if (contact_person !== undefined) {
      updateFields.push('contact_person = ?');
      updateValues.push(contact_person ? contact_person.trim() : null);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email ? email.trim() : null);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone ? phone.trim() : null);
    }
    if (mobile !== undefined) {
      updateFields.push('mobile = ?');
      updateValues.push(mobile ? mobile.trim() : null);
    }
    if (website !== undefined) {
      updateFields.push('website = ?');
      updateValues.push(website ? website.trim() : null);
    }
    if (address !== undefined) {
      updateFields.push('address = ?');
      updateValues.push(address ? address.trim() : null);
    }
    if (city !== undefined) {
      updateFields.push('city = ?');
      updateValues.push(city ? city.trim() : null);
    }
    if (state !== undefined) {
      updateFields.push('state = ?');
      updateValues.push(state ? state.trim() : null);
    }
    if (country !== undefined) {
      updateFields.push('country = ?');
      updateValues.push(country ? country.trim() : null);
    }
    if (postal_code !== undefined) {
      updateFields.push('postal_code = ?');
      updateValues.push(postal_code ? postal_code.trim() : null);
    }
    if (tax_id !== undefined) {
      updateFields.push('tax_id = ?');
      updateValues.push(tax_id ? tax_id.trim() : null);
    }
    if (gst_number !== undefined) {
      updateFields.push('gst_number = ?');
      updateValues.push(gst_number ? gst_number.trim() : null);
    }
    if (credit_limit !== undefined) {
      updateFields.push('credit_limit = ?');
      updateValues.push(credit_limit);
    }
    if (payment_terms_days !== undefined) {
      updateFields.push('payment_terms_days = ?');
      updateValues.push(payment_terms_days);
    }
    if (notes !== undefined) {
      updateFields.push('notes = ?');
      updateValues.push(notes ? notes.trim() : null);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await pool.execute(
      `UPDATE res_suppliers SET ${updateFields.join(', ')} WHERE supplier_id = ?`,
      updateValues
    );

    // Get updated supplier
    const [supplier] = await pool.execute(
      "SELECT * FROM res_suppliers WHERE supplier_id = ?",
      [id]
    );

    res.status(200).json({
      status: "success",
      message: "Supplier updated successfully",
      data: supplier[0]
    });
  } catch (error) {
    console.error("Error updating supplier:", error);
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('email')) {
        return res.status(409).json({ 
          error: "A supplier with this email already exists" 
        });
      } else if (error.message.includes('supplier_name')) {
        return res.status(409).json({ 
          error: "A supplier with this name already exists" 
        });
      } else {
        return res.status(409).json({ 
          error: "Duplicate entry found. Please check your data." 
        });
      }
    }
    
    if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ 
        error: "One or more fields exceed the maximum allowed length" 
      });
    }
    
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ 
        error: "Required fields cannot be null" 
      });
    }
    
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE') {
      return res.status(400).json({ 
        error: "Invalid data format provided" 
      });
    }
    
    // Generic error for other cases
    res.status(500).json({ 
      error: "Failed to update supplier. Please try again." 
    });
  }
}

// Delete supplier
async function deleteSupplier(req, res) {
  try {
    const { id } = req.params;

    // Check if supplier exists
    const [existingSupplier] = await pool.execute(
      "SELECT supplier_name FROM res_suppliers WHERE supplier_id = ?",
      [id]
    );

    if (existingSupplier.length === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    // Check if supplier has products
    const [products] = await pool.execute(
      "SELECT COUNT(*) as count FROM res_products WHERE supplier = ?",
      [existingSupplier[0].supplier_name]
    );

    if (products[0].count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete supplier. ${products[0].count} products are associated with this supplier.` 
      });
    }

    await pool.execute(
      "DELETE FROM res_suppliers WHERE supplier_id = ?",
      [id]
    );

    res.status(200).json({
      status: "success",
      message: "Supplier deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get supplier reports
async function getSupplierReports(req, res) {
  try {
    const { reportType = 'all', supplierId, startDate, endDate } = req.query;

    let reportData = {};

    switch (reportType) {
      case 'all':
        // Get all suppliers with comprehensive data
        const [suppliersReport] = await pool.execute(`
          SELECT 
            s.supplier_id,
            s.supplier_name,
            s.contact_person,
            s.email,
            s.phone,
            s.city,
            s.state,
            s.country,
            s.status,
            s.credit_limit,
            s.payment_terms_days,
            s.created_at,
            COUNT(DISTINCT p.product_id) as total_products,
            COUNT(DISTINCT CASE WHEN p.status = 1 THEN p.product_id END) as active_products,
            COUNT(DISTINCT CASE WHEN p.status = 0 THEN p.product_id END) as draft_products,
            COUNT(DISTINCT CASE WHEN p.status = 2 THEN p.product_id END) as archived_products,
            COALESCE(SUM(p.stock_quantity), 0) as total_stock,
            COALESCE(AVG(p.sale_price), 0) as avg_product_price,
            COALESCE(MIN(p.sale_price), 0) as min_product_price,
            COALESCE(MAX(p.sale_price), 0) as max_product_price,
            COALESCE(SUM(p.stock_quantity * p.sale_price), 0) as inventory_value,
            COUNT(DISTINCT o.order_id) as total_orders,
            COALESCE(SUM(oi.quantity * oi.price), 0) as total_sales_value
          FROM res_suppliers s
          LEFT JOIN res_products p ON s.supplier_name = p.supplier
          LEFT JOIN res_orders o ON 1=1  -- Join with all orders for now
          LEFT JOIN res_order_items oi ON o.order_id = oi.order_id AND oi.product_id = p.product_id
          GROUP BY s.supplier_id, s.supplier_name, s.contact_person, s.email, s.phone, 
                   s.city, s.state, s.country, s.status, s.credit_limit, s.payment_terms_days, s.created_at
          ORDER BY s.supplier_name ASC
        `);

        // Get summary statistics
        const [summaryStats] = await pool.execute(`
          SELECT 
            COUNT(*) as total_suppliers,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_suppliers,
            COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_suppliers,
            COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_suppliers,
            SUM(credit_limit) as total_credit_limit,
            AVG(credit_limit) as avg_credit_limit
          FROM res_suppliers
        `);

        // Get total products and sales across all suppliers
        const [globalStats] = await pool.execute(`
          SELECT 
            COUNT(DISTINCT p.product_id) as total_products_all_suppliers,
            COUNT(DISTINCT o.order_id) as total_orders_all,
            COALESCE(SUM(oi.quantity * oi.price), 0) as total_sales_value_all
          FROM res_products p
          LEFT JOIN res_order_items oi ON p.product_id = oi.product_id
          LEFT JOIN res_orders o ON oi.order_id = o.order_id
        `);

        reportData = {
          suppliers: suppliersReport,
          summary: summaryStats[0],
          globalStats: globalStats[0]
        };
        break;

      case 'overview':
        // Get overview statistics
        const [overviewStats] = await pool.execute(`
          SELECT 
            COUNT(*) as total_suppliers,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_suppliers,
            COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_suppliers,
            COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_suppliers,
            AVG(credit_limit) as avg_credit_limit,
            SUM(credit_limit) as total_credit_limit
          FROM res_suppliers
        `);

        // Get top suppliers by product count
        const [topSuppliers] = await pool.execute(`
          SELECT 
            s.supplier_name,
            s.supplier_id,
            COUNT(p.product_id) as product_count,
            SUM(p.stock_quantity) as total_stock,
            AVG(p.sale_price) as avg_price
          FROM res_suppliers s
          LEFT JOIN res_products p ON s.supplier_name = p.supplier
          GROUP BY s.supplier_id, s.supplier_name
          ORDER BY product_count DESC
          LIMIT 10
        `);

        reportData = {
          overview: overviewStats[0],
          topSuppliers: topSuppliers
        };
        break;

      case 'products':
        // Get products by supplier
        const [productsBySupplier] = await pool.execute(`
          SELECT 
            s.supplier_name,
            s.supplier_id,
            COUNT(p.product_id) as total_products,
            COUNT(CASE WHEN p.status = 1 THEN 1 END) as active_products,
            COUNT(CASE WHEN p.status = 0 THEN 1 END) as draft_products,
            COUNT(CASE WHEN p.status = 2 THEN 1 END) as archived_products,
            SUM(p.stock_quantity) as total_stock,
            AVG(p.sale_price) as avg_price,
            MIN(p.sale_price) as min_price,
            MAX(p.sale_price) as max_price
          FROM res_suppliers s
          LEFT JOIN res_products p ON s.supplier_name = p.supplier
          GROUP BY s.supplier_id, s.supplier_name
          ORDER BY total_products DESC
        `);

        reportData = {
          productsBySupplier: productsBySupplier
        };
        break;

      case 'financial':
        // Get financial summary by supplier
        const [financialSummary] = await pool.execute(`
          SELECT 
            s.supplier_name,
            s.supplier_id,
            s.credit_limit,
            s.payment_terms_days,
            COUNT(p.product_id) as product_count,
            SUM(p.stock_quantity * p.sale_price) as inventory_value,
            AVG(p.sale_price) as avg_product_price
          FROM res_suppliers s
          LEFT JOIN res_products p ON s.supplier_name = p.supplier
          GROUP BY s.supplier_id, s.supplier_name, s.credit_limit, s.payment_terms_days
          ORDER BY inventory_value DESC
        `);

        reportData = {
          financialSummary: financialSummary
        };
        break;

      case 'detailed':
        // Get detailed supplier information
        if (!supplierId) {
          return res.status(400).json({ error: "Supplier ID is required for detailed report" });
        }

        const [supplierDetails] = await pool.execute(`
          SELECT * FROM res_suppliers WHERE supplier_id = ?
        `, [supplierId]);

        if (supplierDetails.length === 0) {
          return res.status(404).json({ error: "Supplier not found" });
        }

        const [supplierProducts] = await pool.execute(`
          SELECT 
            product_id, product_name, sku, sale_price, original_price,
            stock_quantity, status, created_at, updated_at
          FROM res_products 
          WHERE supplier = ?
          ORDER BY created_at DESC
        `, [supplierDetails[0].supplier_name]);

        const [supplierStats] = await pool.execute(`
          SELECT 
            COUNT(*) as total_products,
            COUNT(CASE WHEN status = 1 THEN 1 END) as active_products,
            COUNT(CASE WHEN status = 0 THEN 1 END) as draft_products,
            COUNT(CASE WHEN status = 2 THEN 1 END) as archived_products,
            SUM(stock_quantity) as total_stock,
            AVG(sale_price) as avg_price,
            MIN(sale_price) as min_price,
            MAX(sale_price) as max_price,
            SUM(stock_quantity * sale_price) as inventory_value
          FROM res_products 
          WHERE supplier = ?
        `, [supplierDetails[0].supplier_name]);

        reportData = {
          supplier: supplierDetails[0],
          products: supplierProducts,
          statistics: supplierStats[0]
        };
        break;

      default:
        return res.status(400).json({ error: "Invalid report type" });
    }

    res.status(200).json({
      status: "success",
      reportType: reportType,
      data: reportData
    });
  } catch (error) {
    console.error("Error generating supplier reports:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get individual supplier report
async function getIndividualSupplierReport(req, res) {
  try {
    const { id } = req.params;

    // Get supplier basic information
    const [suppliers] = await pool.execute(
      "SELECT * FROM res_suppliers WHERE supplier_id = ?",
      [id]
    );

    if (suppliers.length === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const supplier = suppliers[0];

    // Get products from this supplier
    const [products] = await pool.execute(`
      SELECT 
        product_id, product_name, sku, slug, original_price, sale_price,
        stock_quantity, status, is_featured, rating, reviews_count,
        created_at, updated_at
      FROM res_products 
      WHERE supplier = ?
      ORDER BY created_at DESC
    `, [supplier.supplier_name]);

    // Get product statistics
    const [productStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN status = 1 THEN 1 END) as active_products,
        COUNT(CASE WHEN status = 0 THEN 1 END) as draft_products,
        COUNT(CASE WHEN status = 2 THEN 1 END) as archived_products,
        COUNT(CASE WHEN is_featured = 1 THEN 1 END) as featured_products,
        SUM(stock_quantity) as total_stock,
        AVG(sale_price) as avg_price,
        MIN(sale_price) as min_price,
        MAX(sale_price) as max_price,
        SUM(stock_quantity * sale_price) as inventory_value,
        AVG(rating) as avg_rating,
        SUM(reviews_count) as total_reviews
      FROM res_products 
      WHERE supplier = ?
    `, [supplier.supplier_name]);

    // Get category distribution
    const [categoryStats] = await pool.execute(`
      SELECT 
        c.category_name,
        COUNT(p.product_id) as product_count,
        SUM(p.stock_quantity) as total_stock,
        AVG(p.sale_price) as avg_price
      FROM res_products p
      JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      JOIN res_product_categories c ON pcr.category_id = c.category_id
      WHERE p.supplier = ?
      GROUP BY c.category_id, c.category_name
      ORDER BY product_count DESC
    `, [supplier.supplier_name]);

    // Get price range analysis
    const [priceRanges] = await pool.execute(`
      SELECT 
        CASE 
          WHEN sale_price < 25 THEN 'Under $25'
          WHEN sale_price BETWEEN 25 AND 50 THEN '$25 - $50'
          WHEN sale_price BETWEEN 50 AND 100 THEN '$50 - $100'
          WHEN sale_price BETWEEN 100 AND 200 THEN '$100 - $200'
          ELSE 'Over $200'
        END as price_range,
        COUNT(*) as product_count,
        SUM(stock_quantity) as total_stock
      FROM res_products 
      WHERE supplier = ?
      GROUP BY price_range
      ORDER BY MIN(sale_price)
    `, [supplier.supplier_name]);

    // Get recent products (last 30 days)
    const [recentProducts] = await pool.execute(`
      SELECT 
        product_id, product_name, sku, sale_price, stock_quantity, status
      FROM res_products 
      WHERE supplier = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ORDER BY created_at DESC
      LIMIT 5
    `, [supplier.supplier_name]);

    // Get top performing products (by rating)
    const [topProducts] = await pool.execute(`
      SELECT 
        product_id, product_name, sku, sale_price, rating, reviews_count, stock_quantity
      FROM res_products 
      WHERE supplier = ? AND rating >= 4.0
      ORDER BY rating DESC, reviews_count DESC
      LIMIT 5
    `, [supplier.supplier_name]);

    // Get low stock products
    const [lowStockProducts] = await pool.execute(`
      SELECT 
        product_id, product_name, sku, sale_price, stock_quantity
      FROM res_products 
      WHERE supplier = ? AND stock_quantity <= 10
      ORDER BY stock_quantity ASC
    `, [supplier.supplier_name]);

    // Get media count for products
    const [mediaStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_media_files,
        COUNT(CASE WHEN is_cover = 1 THEN 1 END) as cover_images,
        COUNT(CASE WHEN type = 'image' THEN 1 END) as images,
        COUNT(CASE WHEN type = 'video' THEN 1 END) as videos
      FROM res_product_media pm
      JOIN res_products p ON pm.product_id = p.product_id
      WHERE p.supplier = ?
    `, [supplier.supplier_name]);

    // Calculate performance metrics
    const stats = productStats[0];
    const performanceMetrics = {
      product_diversity_score: categoryStats.length, // Number of categories
      avg_product_rating: parseFloat(stats.avg_rating || 0).toFixed(2),
      inventory_turnover_estimate: stats.total_stock > 0 ? (stats.inventory_value / stats.total_stock).toFixed(2) : 0,
      price_range_diversity: priceRanges.length,
      stock_health_score: stats.total_products > 0 ? ((stats.total_products - lowStockProducts.length) / stats.total_products * 100).toFixed(1) : 100
    };

    res.status(200).json({
      status: "success",
      data: {
        supplier: {
          supplier_id: supplier.supplier_id,
          supplier_name: supplier.supplier_name,
          contact_person: supplier.contact_person,
          email: supplier.email,
          phone: supplier.phone,
          mobile: supplier.mobile,
          website: supplier.website,
          address: supplier.address,
          city: supplier.city,
          state: supplier.state,
          country: supplier.country,
          postal_code: supplier.postal_code,
          tax_id: supplier.tax_id,
          gst_number: supplier.gst_number,
          credit_limit: supplier.credit_limit,
          payment_terms_days: supplier.payment_terms_days,
          notes: supplier.notes,
          status: supplier.status,
          created_at: supplier.created_at,
          updated_at: supplier.updated_at
        },
        statistics: {
          ...stats,
          performance_metrics: performanceMetrics
        },
        category_distribution: categoryStats,
        price_range_analysis: priceRanges,
        recent_products: recentProducts,
        top_performing_products: topProducts,
        low_stock_products: lowStockProducts,
        media_statistics: mediaStats[0],
        all_products: products
      }
    });
  } catch (error) {
    console.error("Error generating individual supplier report:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get supplier statistics for dashboard
async function getSupplierStats(req, res) {
  try {
    // Get basic statistics
    const [basicStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_suppliers,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_suppliers,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_suppliers,
        COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_suppliers
      FROM res_suppliers
    `);

    // Get suppliers with products
    const [suppliersWithProducts] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT s.supplier_id) as suppliers_with_products,
        COUNT(p.product_id) as total_products_from_suppliers
      FROM res_suppliers s
      INNER JOIN res_products p ON s.supplier_name = p.supplier
    `);

    // Get recent suppliers (last 30 days)
    const [recentSuppliers] = await pool.execute(`
      SELECT COUNT(*) as recent_suppliers
      FROM res_suppliers 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    res.status(200).json({
      status: "success",
      data: {
        ...basicStats[0],
        ...suppliersWithProducts[0],
        ...recentSuppliers[0]
      }
    });
  } catch (error) {
    console.error("Error fetching supplier stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Search suppliers for dropdown with recent suppliers and A-Z sorting
async function searchSuppliersForDropdown(req, res) {
  try {
    const search = req.query.search || '';
    const limit = parseInt(req.query.limit, 10) || 50;

    let suppliers = [];

    if (search.trim()) {
      // Search suppliers by name, contact person, email, or city
      const [searchResults] = await pool.execute(`
        SELECT 
          supplier_id,
          supplier_name,
          contact_person,
          email,
          phone,
          mobile,
          city,
          state,
          country,
          status,
          created_at
        FROM res_suppliers 
        WHERE (
          supplier_name LIKE ? OR 
          contact_person LIKE ? OR 
          email LIKE ? OR 
          city LIKE ? OR
          state LIKE ? OR
          country LIKE ?
        ) AND status = 'active'
        ORDER BY supplier_name ASC
        LIMIT ?
      `, [
        `%${search}%`, `%${search}%`, `%${search}%`, 
        `%${search}%`, `%${search}%`, `%${search}%`, 
        limit
      ]);
      
      suppliers = searchResults;
    } else {
      // Get recent 20 suppliers first, then fill with A-Z sorted suppliers
      const [recentSuppliers] = await pool.execute(`
        SELECT 
          supplier_id,
          supplier_name,
          contact_person,
          email,
          phone,
          mobile,
          city,
          state,
          country,
          status,
          created_at
        FROM res_suppliers 
        WHERE status = 'active'
        ORDER BY created_at DESC
        LIMIT 20
      `);

      // Get additional suppliers sorted A-Z to fill the limit
      const remainingLimit = limit - recentSuppliers.length;
      let additionalSuppliers = [];
      
      if (remainingLimit > 0) {
        const recentSupplierIds = recentSuppliers.map(s => s.supplier_id);
        const placeholders = recentSupplierIds.map(() => '?').join(',');
        
        const [additionalResults] = await pool.execute(`
          SELECT 
            supplier_id,
            supplier_name,
            contact_person,
            email,
            phone,
            mobile,
            city,
            state,
            country,
            status,
            created_at
          FROM res_suppliers 
          WHERE status = 'active' 
          AND supplier_id NOT IN (${placeholders})
          ORDER BY supplier_name ASC
          LIMIT ?
        `, [...recentSupplierIds, remainingLimit]);
        
        additionalSuppliers = additionalResults;
      }

      // Combine recent suppliers with additional suppliers
      suppliers = [...recentSuppliers, ...additionalSuppliers];
    }

    // Format response for dropdown
    const dropdownData = suppliers.map(supplier => ({
      value: supplier.supplier_id,
      label: supplier.supplier_name,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      contact_person: supplier.contact_person,
      email: supplier.email,
      phone: supplier.phone,
      mobile: supplier.mobile,
      city: supplier.city,
      state: supplier.state,
      country: supplier.country,
      status: supplier.status,
      created_at: supplier.created_at
    }));

    res.status(200).json({
      status: "success",
      data: {
        suppliers: dropdownData,
        total: dropdownData.length,
        search_term: search,
        recent_count: search.trim() ? 0 : Math.min(20, dropdownData.length)
      }
    });
  } catch (error) {
    console.error("Error searching suppliers for dropdown:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  getSupplierReports,
  getIndividualSupplierReport,
  getSupplierStats,
  searchSuppliersForDropdown
};
