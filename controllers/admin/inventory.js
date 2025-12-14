const { pool } = require("../../config/database");

// Get products with stock status breakdown - SIMPLIFIED VERSION
async function getProductsWithStockStatus(req, res) {
  try {
    const { search, product_type } = req.query;

    let whereConditions = [];
    let queryParams = [];

    // Only show active products (status = 2)
    whereConditions.push('p.status = 2');

    // Filter by product type if specified
    if (product_type === 'digital') {
      whereConditions.push('(p.product_type = ? OR p.is_digital_download = 1)');
      queryParams.push('digital');
    } else if (product_type === 'physical') {
      whereConditions.push('(p.product_type = ? AND (p.is_digital_download = 0 OR p.is_digital_download IS NULL))');
      queryParams.push('physical');
    }

    if (search) {
      whereConditions.push('(p.product_name LIKE ? OR p.sku LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // SIMPLE QUERY: Get products with their stock
    // For products with activation keys, count available keys
    // For other products, use stock_quantity from res_products
    const [productsRaw] = await pool.execute(`
      SELECT 
        p.product_id,
        p.product_name,
        p.sku,
        p.product_type,
        p.is_digital_download,
        p.requires_activation_key,
        COALESCE(
          CASE 
            WHEN p.requires_activation_key = 1 THEN (
              SELECT COUNT(*) 
              FROM res_product_activation_keys pak 
              WHERE pak.product_id = p.product_id 
              AND pak.status = 'available'
            )
            ELSE p.stock_quantity
          END, 
          0
        ) as total_stock,
        COALESCE(SUM(CASE WHEN il.action_type = 'sale' THEN ABS(il.quantity_change) ELSE 0 END), 0) as used_stock
      FROM res_products p
      LEFT JOIN res_inventory_logs il ON p.product_id = il.product_id
      ${whereClause}
      GROUP BY p.product_id, p.product_name, p.sku, p.product_type, p.is_digital_download, p.requires_activation_key, p.stock_quantity
      ORDER BY p.product_name ASC
      LIMIT 500
    `, queryParams);

    // Simple mapping
    const products = productsRaw.map(product => {
      const productTypeStr = String(product.product_type || '').toLowerCase();
      const isDigital = productTypeStr === 'digital' || 
                       product.product_type === 2 || 
                       product.is_digital_download === 1;
      
      return {
        product_id: Number(product.product_id),
        product_name: product.product_name || 'Unnamed Product',
        sku: product.sku || String(product.product_id),
        product_type: isDigital ? 'digital' : 'physical',
        total_stock: Number(product.total_stock) || 0,
        used_stock: Number(product.used_stock) || 0,
        available_stock: Math.max(0, (Number(product.total_stock) || 0) - (Number(product.used_stock) || 0))
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        products_with_status: products
      }
    });
  } catch (error) {
    console.error("Error fetching products with stock status:", error);
    res.status(500).json({ 
      error: "Internal Server Error"
    });
  }
}

// Placeholder functions for other routes (to be implemented if needed)
async function getInventoryOverview(req, res) {
  try {
    const { supplierId, categoryId, lowStockThreshold = 10 } = req.query;

    let whereConditions = [];
    let queryParams = [];

    if (supplierId) {
      whereConditions.push('p.supplier_id = ?');
      queryParams.push(Number(supplierId));
    }

    if (categoryId) {
      whereConditions.push('p.category_id = ?');
      queryParams.push(Number(categoryId));
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get statistics - optimized using LEFT JOIN instead of correlated subqueries
    const [statsRows] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT p.product_id) as total_products,
        COUNT(DISTINCT CASE WHEN p.status = 1 THEN p.product_id END) as active_products,
        COUNT(DISTINCT CASE WHEN 
          (p.requires_activation_key = 1 AND COALESCE(key_counts.key_count, 0) > 0)
          OR (p.requires_activation_key != 1 AND COALESCE(p.stock_quantity, 0) > 0)
        THEN p.product_id END) as in_stock_products,
        COUNT(DISTINCT CASE WHEN 
          (p.requires_activation_key != 1 AND COALESCE(p.stock_quantity, 0) > 0 AND p.stock_quantity <= ?)
          OR (p.requires_activation_key = 1 AND COALESCE(key_counts.key_count, 0) > 0 AND key_counts.key_count <= ?)
        THEN p.product_id END) as low_stock_products,
        COUNT(DISTINCT CASE WHEN 
          (p.requires_activation_key != 1 AND COALESCE(p.stock_quantity, 0) = 0)
          OR (p.requires_activation_key = 1 AND COALESCE(key_counts.key_count, 0) = 0)
        THEN p.product_id END) as out_of_stock_products,
        COALESCE(SUM(
          CASE 
            WHEN p.requires_activation_key = 1 THEN COALESCE(key_counts.key_count, 0)
            ELSE COALESCE(p.stock_quantity, 0)
          END
        ), 0) as total_stock,
        COALESCE(SUM(
          CASE 
            WHEN p.requires_activation_key = 1 THEN COALESCE(key_counts.key_count, 0) * COALESCE(p.sale_price, 0)
            ELSE COALESCE(p.stock_quantity, 0) * COALESCE(p.sale_price, 0)
          END
        ), 0) as total_inventory_value,
        COALESCE(MIN(
          CASE 
            WHEN p.requires_activation_key = 1 THEN COALESCE(key_counts.key_count, 0)
            ELSE COALESCE(p.stock_quantity, 0)
          END
        ), 0) as min_stock,
        COALESCE(MAX(
          CASE 
            WHEN p.requires_activation_key = 1 THEN COALESCE(key_counts.key_count, 0)
            ELSE COALESCE(p.stock_quantity, 0)
          END
        ), 0) as max_stock
      FROM res_products p
      LEFT JOIN (
        SELECT product_id, COUNT(*) as key_count
        FROM res_product_activation_keys
        WHERE status = 'available'
        GROUP BY product_id
      ) key_counts ON p.product_id = key_counts.product_id AND p.requires_activation_key = 1
      ${whereClause}
    `, [...queryParams, Number(lowStockThreshold), Number(lowStockThreshold)]);

    const stats = statsRows[0] || {};
    const totalProducts = Number(stats.total_products) || 0;
    const totalStock = Number(stats.total_stock) || 0;

    const statistics = {
      total_products: totalProducts,
      active_products: Number(stats.active_products) || 0,
      in_stock_products: Number(stats.in_stock_products) || 0,
      low_stock_products: Number(stats.low_stock_products) || 0,
      out_of_stock_products: Number(stats.out_of_stock_products) || 0,
      total_stock: totalStock,
      total_inventory_value: (Number(stats.total_inventory_value) || 0).toFixed(2),
      avg_stock_per_product: totalProducts > 0 ? Math.round(totalStock / totalProducts) : 0,
      min_stock: Number(stats.min_stock) || 0,
      max_stock: Number(stats.max_stock) || 0,
    };

    // Get low stock products - optimized using LEFT JOIN instead of correlated subquery
    const [lowStockProducts] = await pool.execute(`
      SELECT 
        p.product_id,
        p.product_name,
        p.sku,
        p.supplier_id,
        s.supplier_name as supplier,
        p.stock_quantity,
        p.sale_price,
        p.status,
        p.created_at,
        p.requires_activation_key,
        CASE 
          WHEN p.requires_activation_key = 1 THEN COALESCE(key_counts.key_count, 0)
          ELSE COALESCE(p.stock_quantity, 0)
        END as current_stock
      FROM res_products p
      LEFT JOIN res_suppliers s ON p.supplier_id = s.supplier_id
      LEFT JOIN (
        SELECT product_id, COUNT(*) as key_count
        FROM res_product_activation_keys
        WHERE status = 'available'
        GROUP BY product_id
      ) key_counts ON p.product_id = key_counts.product_id AND p.requires_activation_key = 1
      ${whereClause}
      HAVING current_stock > 0 AND current_stock <= ?
      ORDER BY current_stock ASC
      LIMIT 20
    `, [...queryParams, Number(lowStockThreshold)]);

    // Get out of stock products - optimized using LEFT JOIN instead of correlated subquery
    const [outOfStockProducts] = await pool.execute(`
      SELECT 
        p.product_id,
        p.product_name,
        p.sku,
        p.supplier_id,
        s.supplier_name as supplier,
        p.stock_quantity,
        p.sale_price,
        p.status,
        p.created_at,
        p.requires_activation_key,
        CASE 
          WHEN p.requires_activation_key = 1 THEN COALESCE(key_counts.key_count, 0)
          ELSE COALESCE(p.stock_quantity, 0)
        END as current_stock
      FROM res_products p
      LEFT JOIN res_suppliers s ON p.supplier_id = s.supplier_id
      LEFT JOIN (
        SELECT product_id, COUNT(*) as key_count
        FROM res_product_activation_keys
        WHERE status = 'available'
        GROUP BY product_id
      ) key_counts ON p.product_id = key_counts.product_id AND p.requires_activation_key = 1
      ${whereClause}
      HAVING current_stock = 0
      ORDER BY p.product_name ASC
      LIMIT 20
    `, queryParams);

    // Get recent movements (last 20) - include both inventory logs and activation key assignments
    // For movements, we need to join products and apply filters differently
    let movementWhereConditions = [];
    let movementQueryParams = [];
    
    if (supplierId) {
      movementWhereConditions.push('p.supplier_id = ?');
      movementQueryParams.push(Number(supplierId));
    }

    if (categoryId) {
      movementWhereConditions.push('p.category_id = ?');
      movementQueryParams.push(Number(categoryId));
    }

    const movementWhereClause = movementWhereConditions.length > 0 
      ? `WHERE ${movementWhereConditions.join(' AND ')}` 
      : '';

    // Get inventory logs (physical products)
    const [inventoryLogs] = await pool.execute(`
      SELECT 
        il.log_id,
        il.product_id,
        il.action_type,
        il.quantity_change,
        il.previous_stock,
        il.new_stock,
        il.reference_number,
        il.notes,
        il.performed_by,
        il.created_at,
        p.product_name,
        p.sku,
        'inventory_log' as movement_type
      FROM res_inventory_logs il
      INNER JOIN res_products p ON il.product_id = p.product_id
      ${movementWhereClause}
      ORDER BY il.created_at DESC
      LIMIT 20
    `, movementQueryParams);

    // Get activation key assignments (digital products)
    // Build WHERE clause for key assignments separately
    let keyAssignWhereConditions = [];
    let keyAssignQueryParams = [];
    
    if (supplierId) {
      keyAssignWhereConditions.push('p.supplier_id = ?');
      keyAssignQueryParams.push(Number(supplierId));
    }

    if (categoryId) {
      keyAssignWhereConditions.push('p.category_id = ?');
      keyAssignQueryParams.push(Number(categoryId));
    }

    const keyAssignWhereClause = keyAssignWhereConditions.length > 0 
      ? `WHERE ${keyAssignWhereConditions.join(' AND ')}` 
      : '';

    // Optimized: Removed DISTINCT (deduplication handled in JS)
    const [keyAssignments] = await pool.execute(`
      SELECT 
        akl.log_id,
        akl.order_id,
        akl.user_id,
        akl.created_at,
        pak.product_id,
        pak.activation_key,
        p.product_name,
        p.sku,
        u.username,
        'key_assignment' as movement_type
      FROM res_activation_key_logs akl
      LEFT JOIN res_product_activation_keys pak ON akl.key_id = pak.key_id
      LEFT JOIN res_products p ON pak.product_id = p.product_id
      LEFT JOIN res_users u ON akl.user_id = u.user_id
      ${keyAssignWhereClause}
      ORDER BY akl.created_at DESC
      LIMIT 20
    `, keyAssignQueryParams);

    // Format the response
    const lowStock = lowStockProducts.map(product => ({
      product_id: Number(product.product_id),
      product_name: product.product_name || 'Unnamed Product',
      sku: product.sku || String(product.product_id),
      supplier: product.supplier || 'N/A',
      stock_quantity: Number(product.current_stock),
      sale_price: Number(product.sale_price) || 0,
      status: Number(product.status) || 0,
      created_at: product.created_at,
    }));

    const outOfStock = outOfStockProducts.map(product => ({
      product_id: Number(product.product_id),
      product_name: product.product_name || 'Unnamed Product',
      sku: product.sku || String(product.product_id),
      supplier: product.supplier || 'N/A',
      stock_quantity: 0,
      sale_price: Number(product.sale_price) || 0,
      status: Number(product.status) || 0,
      created_at: product.created_at,
    }));

    // Combine and format movements
    const movements = [];
    const seenKeyAssignmentLogs = new Set(); // Track seen log_ids to prevent duplicates
    // Track order_id + product_id combinations - keep only the most recent entry per combination
    const orderProductMap = new Map(); // key: "orderId_productId", value: movement object

    // Format inventory logs
    inventoryLogs.forEach(log => {
      movements.push({
        log_id: Number(log.log_id),
        product_id: Number(log.product_id),
        product_name: log.product_name || 'Unknown Product',
        sku: log.sku || 'N/A',
        action_type: log.action_type,
        quantity_change: Number(log.quantity_change),
        previous_stock: Number(log.previous_stock) || 0,
        new_stock: Number(log.new_stock) || 0,
        reference_number: log.reference_number,
        notes: log.notes,
        performed_by: log.performed_by,
        created_at: log.created_at,
      });
    });

    // Format activation key assignments with deduplication
    keyAssignments.forEach(log => {
      // Skip if we've already processed this exact log entry
      if (seenKeyAssignmentLogs.has(log.log_id)) {
        return;
      }
      seenKeyAssignmentLogs.add(log.log_id);
      
      const productId = log.product_id ? Number(log.product_id) : null;
      const orderId = log.order_id ? Number(log.order_id) : null;
      
      if (orderId && productId) {
        const orderProductKey = `${orderId}_${productId}`;
        const existingEntry = orderProductMap.get(orderProductKey);
        
        // Keep only the most recent entry per order+product combination
        if (!existingEntry || new Date(log.created_at) > new Date(existingEntry.created_at)) {
          orderProductMap.set(orderProductKey, {
            log_id: Number(log.log_id),
            product_id: productId,
            product_name: log.product_name || 'Unknown Product',
            sku: log.sku || 'N/A',
            action_type: 'sale',
            quantity_change: -1,
            previous_stock: null,
            new_stock: null,
            reference_number: String(orderId),
            notes: 'Activation key assigned',
            performed_by: log.username || 'System',
            created_at: log.created_at,
          });
        }
      } else {
        // No order_id or product_id, add as-is
        movements.push({
          log_id: Number(log.log_id),
          product_id: productId,
          product_name: log.product_name || 'Unknown Product',
          sku: log.sku || 'N/A',
          action_type: 'sale',
          quantity_change: -1,
          previous_stock: null,
          new_stock: null,
          reference_number: orderId ? String(orderId) : null,
          notes: 'Activation key assigned',
          performed_by: log.username || 'System',
          created_at: log.created_at,
        });
      }
    });
    
    // Add deduplicated key assignments to movements
    orderProductMap.forEach(movement => {
      movements.push(movement);
    });

    // Sort by created_at descending and limit to 20 most recent
    movements.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const recentMovements = movements.slice(0, 20);

    res.status(200).json({
      status: "success",
      data: {
        statistics,
        low_stock_products: lowStock,
        out_of_stock_products: outOfStock,
        recent_movements: recentMovements,
      }
    });
  } catch (error) {
    console.error("Error fetching inventory overview:", error);
    res.status(500).json({ 
      status: "error",
      error: "Internal Server Error",
      message: error.message
    });
  }
}

async function getInventoryReports(req, res) {
  res.status(200).json({ status: "success", data: {} });
}

async function getInventoryAlerts(req, res) {
  res.status(200).json({ status: "success", data: [] });
}

async function getProductInventory(req, res) {
  res.status(200).json({ status: "success", data: {} });
}

async function adjustInventory(req, res) {
  res.status(200).json({ status: "success", message: "Inventory adjusted" });
}

async function bulkAdjustInventory(req, res) {
  res.status(200).json({ status: "success", message: "Bulk adjustment completed" });
}

async function updateStockStatus(req, res) {
  res.status(200).json({ status: "success", message: "Stock status updated" });
}

// Get detailed stock movements (activation keys assigned + physical products ordered)
async function getStockMovements(req, res) {
  try {
    const { product_id, product_type, limit = 100 } = req.query;

    // Filter by product if specified (will be handled separately for each query)
    // Filter by product type if specified
    // For key assignments: check both p (from key) and p2 (from order) since keys might be deleted
    // For inventory logs: check p (from inventory log)
    let keyWhereConditions = [];
    let keyQueryParams = [];
    let invWhereConditions = [];
    let invQueryParams = [];

    if (product_type === 'digital') {
      keyWhereConditions.push('(p.product_type = ? OR p.is_digital_download = 1 OR p2.product_type = ? OR p2.is_digital_download = 1)');
      keyQueryParams.push('digital', 'digital');
      invWhereConditions.push('(p.product_type = ? OR p.is_digital_download = 1)');
      invQueryParams.push('digital');
    } else if (product_type === 'physical') {
      keyWhereConditions.push('((p.product_type = ? AND (p.is_digital_download = 0 OR p.is_digital_download IS NULL)) OR (p2.product_type = ? AND (p2.is_digital_download = 0 OR p2.is_digital_download IS NULL)))');
      keyQueryParams.push('physical', 'physical');
      invWhereConditions.push('(p.product_type = ? AND (p.is_digital_download = 0 OR p.is_digital_download IS NULL))');
      invQueryParams.push('physical');
    }

    // Add product_id filter to both if specified
    if (product_id) {
      keyWhereConditions.push('(p.product_id = ? OR p2.product_id = ?)');
      keyQueryParams.push(Number(product_id), Number(product_id));
      invWhereConditions.push('p.product_id = ?');
      invQueryParams.push(Number(product_id));
    }

    const keyWhereClause = keyWhereConditions.length > 0 
      ? `WHERE ${keyWhereConditions.join(' AND ')}` 
      : '';
    const invWhereClause = invWhereConditions.length > 0 
      ? `WHERE ${invWhereConditions.join(' AND ')}` 
      : '';

    // Get activation key assignments (for digital products with keys)
    // Optimized: Removed DISTINCT (deduplication handled in JS), optimized JOINs
    // Use LEFT JOIN for keys/products since they might be deleted, but we still want to show the log
    const [keyAssignments] = await pool.execute(`
      SELECT 
        akl.log_id,
        akl.key_id,
        akl.order_id,
        akl.user_id,
        akl.action,
        akl.notes,
        akl.created_at,
        pak.product_id,
        pak.activation_key,
        p.product_name,
        p.sku,
        p.product_type,
        p.is_digital_download,
        up.product_id as order_product_id,
        p2.product_name as order_product_name,
        p2.sku as order_sku,
        p2.product_type as order_product_type,
        p2.is_digital_download as order_is_digital_download,
        u.username,
        u.email
      FROM res_activation_key_logs akl
      LEFT JOIN res_product_activation_keys pak ON akl.key_id = pak.key_id
      LEFT JOIN res_products p ON pak.product_id = p.product_id
      LEFT JOIN res_users u ON akl.user_id = u.user_id
      LEFT JOIN res_uproducts up ON akl.order_id = up.order_id 
        AND (pak.product_id IS NULL OR up.product_id = pak.product_id)
      LEFT JOIN res_products p2 ON up.product_id = p2.product_id
      ${keyWhereClause}
      ORDER BY akl.created_at DESC
      LIMIT ?
    `, [...keyQueryParams, Number(limit)]);

    // Get activation key additions (keys that were added to products)
    // Build WHERE clause for key additions (similar to assignments but check p.product_id directly)
    let keyAddWhereConditions = ['pak.status = ?'];
    let keyAddQueryParams = ['available'];

    if (product_type === 'digital') {
      keyAddWhereConditions.push('(p.product_type = ? OR p.is_digital_download = 1)');
      keyAddQueryParams.push('digital');
    } else if (product_type === 'physical') {
      keyAddWhereConditions.push('(p.product_type = ? AND (p.is_digital_download = 0 OR p.is_digital_download IS NULL))');
      keyAddQueryParams.push('physical');
    }

    if (product_id) {
      keyAddWhereConditions.push('pak.product_id = ?');
      keyAddQueryParams.push(Number(product_id));
    }

    const keyAddWhereClause = `WHERE ${keyAddWhereConditions.join(' AND ')}`;

    const [keyAdditions] = await pool.execute(`
      SELECT 
        pak.key_id,
        pak.product_id,
        pak.activation_key,
        pak.status,
        pak.created_at,
        p.product_name,
        p.sku,
        p.product_type,
        p.is_digital_download
      FROM res_product_activation_keys pak
      INNER JOIN res_products p ON pak.product_id = p.product_id
      ${keyAddWhereClause}
      ORDER BY pak.created_at DESC
      LIMIT ?
    `, [...keyAddQueryParams, Number(limit)]);

    // Get inventory logs (for physical products)
    // Optimized: Match reference_number as order_id using more efficient casting
    const [inventoryLogs] = await pool.execute(`
      SELECT 
        il.log_id,
        il.product_id,
        il.action_type,
        il.quantity_change,
        il.previous_stock,
        il.new_stock,
        il.reference_number,
        il.notes,
        il.performed_by,
        il.created_at,
        p.product_name,
        p.sku,
        p.product_type,
        p.is_digital_download,
        o.order_id as order_order_id,
        u.user_id,
        u.username,
        u.email
      FROM res_inventory_logs il
      INNER JOIN res_products p ON il.product_id = p.product_id
      LEFT JOIN res_orders o ON (
        il.reference_number = CAST(o.order_id AS CHAR)
        OR (il.reference_number REGEXP '^[0-9]+$' AND CAST(il.reference_number AS UNSIGNED) = o.order_id)
      )
      LEFT JOIN res_users u ON o.user_id = u.user_id
      ${invWhereClause}
      ORDER BY il.created_at DESC
      LIMIT ?
    `, [...invQueryParams, Number(limit)]);

    // Combine and format movements
    const movements = [];
    const seenKeyAssignmentLogs = new Set(); // Track seen log_ids to prevent duplicates
    // Track order_id + product_id combinations - keep only the most recent entry per combination
    const orderProductMap = new Map(); // key: "orderId_productId", value: movement object

    // Collect all unique product IDs that need to be fetched (products with missing names)
    const missingProductIds = new Set();
    keyAssignments.forEach(log => {
      const productId = log.product_id || log.order_product_id;
      if (productId && (!log.product_name && !log.order_product_name)) {
        missingProductIds.add(productId);
      }
    });
    
    // Also check key additions for missing product names
    keyAdditions.forEach(key => {
      if (key.product_id && !key.product_name) {
        missingProductIds.add(key.product_id);
      }
    });
    
    // Also check inventory logs for missing product names
    inventoryLogs.forEach(log => {
      if (log.product_id && !log.product_name) {
        missingProductIds.add(log.product_id);
      }
    });

    // Fetch missing product information in batch
    const productInfoMap = new Map();
    if (missingProductIds.size > 0) {
      try {
        const placeholders = Array(missingProductIds.size).fill('?').join(',');
        const [productRows] = await pool.execute(
          `SELECT product_id, product_name, sku, product_type, is_digital_download FROM res_products WHERE product_id IN (${placeholders})`,
          Array.from(missingProductIds)
        );
        productRows.forEach(product => {
          productInfoMap.set(product.product_id, product);
        });
      } catch (error) {
        console.error('Error fetching missing products:', error);
      }
    }

    // First pass: collect all key assignments and keep only the most recent per order+product
    keyAssignments.forEach(log => {
      // Skip if we've already processed this exact log entry
      if (seenKeyAssignmentLogs.has(log.log_id)) {
        return;
      }
      seenKeyAssignmentLogs.add(log.log_id);
      
      // Use product info from key if available, otherwise from order
      const productId = log.product_id || log.order_product_id;
      const orderId = log.order_id ? Number(log.order_id) : null;
      
      if (orderId && productId) {
        const orderProductKey = `${orderId}_${productId}`;
        const existingEntry = orderProductMap.get(orderProductKey);
        
        if (!existingEntry || new Date(log.created_at) > new Date(existingEntry.created_at)) {
          // This is the first entry or this entry is more recent, keep it
          // Try to get product name from log, order, or fetched product info
          let productName = log.product_name || log.order_product_name;
          let sku = log.sku || log.order_sku;
          let productType = log.product_type || log.order_product_type;
          let isDigitalDownload = log.is_digital_download || log.order_is_digital_download;
          
          // If still missing, try to get from fetched product info
          if (!productName && productId) {
            const fetchedProduct = productInfoMap.get(Number(productId));
            if (fetchedProduct) {
              productName = fetchedProduct.product_name;
              sku = sku || fetchedProduct.sku;
              productType = productType || fetchedProduct.product_type;
              isDigitalDownload = isDigitalDownload || fetchedProduct.is_digital_download;
            }
          }
          
          // Final fallback - show product ID if name is still missing
          productName = productName || `Product #${productId}`;
          sku = sku || `SKU-${productId}`;
          
          // Determine product type from database - use product from key first, then from order, then fetched
          const actualProductType = productType || 'digital';
          const isDigital = actualProductType === 'digital' || isDigitalDownload === 1;
          
          orderProductMap.set(orderProductKey, {
            movement_id: `key_${log.log_id}`,
            movement_type: isDigital ? 'activation_key_assigned' : 'inventory_log',
            product_id: Number(productId),
            product_name: productName,
            sku: sku,
            product_type: isDigital ? 'digital' : 'physical',
            quantity_change: -1,
            action_type: 'sale',
            order_id: orderId,
            order_number: `#${orderId}`,
            user_id: log.user_id ? Number(log.user_id) : null,
            username: log.username,
            user_email: log.email,
            activation_key: isDigital ? (log.activation_key || null) : null,
            notes: log.notes || (isDigital ? 'Activation key assigned' : 'Product sold'),
            performed_by: log.username || 'System',
            created_at: log.created_at,
          });
        }
      } else {
        // No order_id or product_id, add as-is (shouldn't happen but handle gracefully)
        // Try to get product info from log or fetched product info
        let productName = log.product_name || log.order_product_name;
        let sku = log.sku || log.order_sku;
        let productType = log.product_type || log.order_product_type;
        let isDigitalDownload = log.is_digital_download || log.order_is_digital_download;
        
        // If still missing and we have productId, try fetched product info
        if (!productName && productId) {
          const fetchedProduct = productInfoMap.get(Number(productId));
          if (fetchedProduct) {
            productName = fetchedProduct.product_name;
            sku = sku || fetchedProduct.sku;
            productType = productType || fetchedProduct.product_type;
            isDigitalDownload = isDigitalDownload || fetchedProduct.is_digital_download;
          }
        }
        
        // Final fallback - show product ID if name is still missing
        productName = productName || (productId ? `Product #${productId}` : 'Unknown Product');
        sku = sku || (productId ? `SKU-${productId}` : 'N/A');
        
        // Determine product type from database
        const actualProductType = productType || 'digital';
        const isDigital = actualProductType === 'digital' || isDigitalDownload === 1;
        
        movements.push({
          movement_id: `key_${log.log_id}`,
          movement_type: isDigital ? 'activation_key_assigned' : 'inventory_log',
          product_id: productId ? Number(productId) : null,
          product_name: productName,
          sku: sku,
          product_type: isDigital ? 'digital' : 'physical',
          quantity_change: -1,
          action_type: 'sale',
          order_id: orderId,
          order_number: orderId ? `#${orderId}` : null,
          user_id: log.user_id ? Number(log.user_id) : null,
          username: log.username,
          user_email: log.email,
          activation_key: isDigital ? (log.activation_key || null) : null,
          notes: log.notes || (isDigital ? 'Activation key assigned' : 'Product sold'),
          performed_by: log.username || 'System',
          created_at: log.created_at,
        });
      }
    });
    
    // Add deduplicated key assignments to movements
    orderProductMap.forEach(movement => {
      movements.push(movement);
    });

    // Format activation key additions
    // Deduplicate by key_id to avoid showing the same key multiple times
    const seenKeyIds = new Set();
    keyAdditions.forEach(key => {
      if (!seenKeyIds.has(key.key_id)) {
        seenKeyIds.add(key.key_id);
        // Determine product type from database - activation keys should only be for digital products
        // but use actual product type to be safe
        const isDigital = key.product_type === 'digital' || key.is_digital_download === 1;
        
        // Try to get product name from key or fetched product info
        let productName = key.product_name;
        let sku = key.sku;
        
        // If missing, try fetched product info
        if (!productName && key.product_id) {
          const fetchedProduct = productInfoMap.get(Number(key.product_id));
          if (fetchedProduct) {
            productName = fetchedProduct.product_name;
            sku = sku || fetchedProduct.sku;
          }
        }
        
        // Final fallback - show product ID if name is still missing
        productName = productName || (key.product_id ? `Product #${key.product_id}` : 'Unknown Product');
        sku = sku || (key.product_id ? `SKU-${key.product_id}` : 'N/A');
        
        movements.push({
          movement_id: `key_add_${key.key_id}`,
          movement_type: isDigital ? 'activation_key_added' : 'inventory_log',
          product_id: Number(key.product_id),
          product_name: productName,
          sku: sku,
          product_type: isDigital ? 'digital' : 'physical',
          quantity_change: 1, // Key was added (increases stock)
          action_type: 'adjustment',
          order_id: null,
          order_number: null,
          user_id: null,
          username: null,
          user_email: null,
          activation_key: isDigital ? key.activation_key : null,
          notes: isDigital ? 'Activation key added to inventory' : 'Stock adjusted',
          performed_by: 'Admin',
          created_at: key.created_at,
        });
      }
    });

    // Format inventory logs
    inventoryLogs.forEach(log => {
      // Try to get product name from log or fetched product info
      let productName = log.product_name;
      let sku = log.sku;
      
      // If missing, try fetched product info
      if (!productName && log.product_id) {
        const fetchedProduct = productInfoMap.get(Number(log.product_id));
        if (fetchedProduct) {
          productName = fetchedProduct.product_name;
          sku = sku || fetchedProduct.sku;
        }
      }
      
      // Final fallback - show product ID if name is still missing
      productName = productName || (log.product_id ? `Product #${log.product_id}` : 'Unknown Product');
      sku = sku || (log.product_id ? `SKU-${log.product_id}` : 'N/A');
      
      movements.push({
        movement_id: `inv_${log.log_id}`,
        movement_type: 'inventory_log',
        product_id: Number(log.product_id),
        product_name: productName,
        sku: sku,
        product_type: (log.product_type === 'digital' || log.is_digital_download === 1) ? 'digital' : 'physical',
        quantity_change: Number(log.quantity_change),
        action_type: log.action_type,
        previous_stock: Number(log.previous_stock),
        new_stock: Number(log.new_stock),
        order_id: log.order_order_id ? Number(log.order_order_id) : null,
        order_number: log.order_order_id ? `#${log.order_order_id}` : null, // Use order_id as order_number
        user_id: log.user_id ? Number(log.user_id) : null,
        username: log.username,
        user_email: log.email,
        reference_number: log.reference_number,
        notes: log.notes,
        performed_by: log.performed_by,
        created_at: log.created_at,
      });
    });

    // Sort by created_at descending
    movements.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.status(200).json({
      status: "success",
      data: {
        movements: movements.slice(0, Number(limit)),
        total: movements.length,
        key_assignments: keyAssignments.length,
        key_additions: keyAdditions.length,
        inventory_logs: inventoryLogs.length,
      }
    });
  } catch (error) {
    console.error("Error fetching stock movements:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      message: error.message
    });
  }
}

module.exports = {
  getInventoryOverview,
  getInventoryReports,
  getInventoryAlerts,
  getProductInventory,
  adjustInventory,
  bulkAdjustInventory,
  getProductsWithStockStatus,
  updateStockStatus,
  getStockMovements,
};
