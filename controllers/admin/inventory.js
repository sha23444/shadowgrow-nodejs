const { pool } = require("../../config/database");

// Get inventory overview
async function getInventoryOverview(req, res) {
  try {
    const { supplierId, categoryId, lowStockThreshold = 10 } = req.query;

    // Build WHERE conditions
    const whereConditions = [];
    const queryParams = [];

    if (supplierId) {
      whereConditions.push('p.supplier = (SELECT supplier_name FROM res_suppliers WHERE supplier_id = ?)');
      queryParams.push(supplierId);
    }

    if (categoryId) {
      whereConditions.push('pcr.category_id = ?');
      queryParams.push(categoryId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get inventory statistics
    const [inventoryStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN p.status = 1 THEN 1 END) as active_products,
        COUNT(CASE WHEN p.stock_quantity > ? THEN 1 END) as in_stock_products,
        COUNT(CASE WHEN p.stock_quantity <= ? AND p.stock_quantity > 0 THEN 1 END) as low_stock_products,
        COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END) as out_of_stock_products,
        SUM(p.stock_quantity) as total_stock,
        SUM(p.stock_quantity * p.sale_price) as total_inventory_value,
        AVG(p.stock_quantity) as avg_stock_per_product,
        MIN(p.stock_quantity) as min_stock,
        MAX(p.stock_quantity) as max_stock
      FROM res_products p
      LEFT JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      ${whereClause}
    `, [...queryParams, lowStockThreshold, lowStockThreshold]);

    // Get low stock products
    const [lowStockProducts] = await pool.execute(`
      SELECT 
        p.product_id, p.product_name, p.sku, p.supplier, p.stock_quantity, 
        p.sale_price, p.status, p.created_at
      FROM res_products p
      LEFT JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      WHERE p.stock_quantity <= ? AND p.status = 1
      ${whereConditions.length > 0 ? `AND ${whereConditions.join(' AND ')}` : ''}
      ORDER BY p.stock_quantity ASC
      LIMIT 20
    `, [lowStockThreshold, ...queryParams]);

    // Get out of stock products
    const [outOfStockProducts] = await pool.execute(`
      SELECT 
        p.product_id, p.product_name, p.sku, p.supplier, p.stock_quantity, 
        p.sale_price, p.status, p.created_at
      FROM res_products p
      LEFT JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      WHERE p.stock_quantity = 0 AND p.status = 1
      ${whereConditions.length > 0 ? `AND ${whereConditions.join(' AND ')}` : ''}
      ORDER BY p.created_at DESC
      LIMIT 20
    `, queryParams);

    // Get recent inventory movements
    const [recentMovements] = await pool.execute(`
      SELECT 
        il.log_id, il.product_id, p.product_name, p.sku, il.action_type,
        il.quantity_change, il.previous_stock, il.new_stock, il.notes,
        il.performed_by, il.created_at
      FROM res_inventory_logs il
      JOIN res_products p ON il.product_id = p.product_id
      ORDER BY il.created_at DESC
      LIMIT 20
    `);

    res.status(200).json({
      status: "success",
      data: {
        statistics: inventoryStats[0],
        low_stock_products: lowStockProducts,
        out_of_stock_products: outOfStockProducts,
        recent_movements: recentMovements
      }
    });
  } catch (error) {
    console.error("Error fetching inventory overview:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get product inventory details
async function getProductInventory(req, res) {
  try {
    const { id } = req.params;

    // Get product details
    const [products] = await pool.execute(
      "SELECT * FROM res_products WHERE product_id = ?",
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = products[0];

    // Get inventory history
    const [inventoryHistory] = await pool.execute(`
      SELECT 
        log_id, action_type, quantity_change, previous_stock, new_stock,
        unit_cost, reference_number, notes, performed_by, created_at
      FROM res_inventory_logs
      WHERE product_id = ?
      ORDER BY created_at DESC
    `, [id]);

    // Get inventory statistics
    const [inventoryStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_movements,
        SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END) as total_additions,
        SUM(CASE WHEN quantity_change < 0 THEN ABS(quantity_change) ELSE 0 END) as total_reductions,
        AVG(CASE WHEN quantity_change > 0 THEN quantity_change ELSE NULL END) as avg_addition,
        AVG(CASE WHEN quantity_change < 0 THEN ABS(quantity_change) ELSE NULL END) as avg_reduction
      FROM res_inventory_logs
      WHERE product_id = ?
    `, [id]);

    res.status(200).json({
      status: "success",
      data: {
        product: {
          product_id: product.product_id,
          product_name: product.product_name,
          sku: product.sku,
          supplier: product.supplier,
          current_stock: product.stock_quantity,
          sale_price: product.sale_price,
          status: product.status
        },
        inventory_history: inventoryHistory,
        statistics: inventoryStats[0]
      }
    });
  } catch (error) {
    console.error("Error fetching product inventory:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Adjust product inventory
async function adjustInventory(req, res) {
  try {
    const { id } = req.params;
    const { 
      action_type, 
      quantity_change, 
      unit_cost, 
      reference_number, 
      notes, 
      performed_by 
    } = req.body;

    // Validation
    if (!action_type || quantity_change === undefined) {
      return res.status(400).json({ 
        error: "Action type and quantity change are required" 
      });
    }

    const validActions = ['adjustment', 'sale', 'return', 'damage', 'transfer'];
    if (!validActions.includes(action_type)) {
      return res.status(400).json({ 
        error: "Invalid action type. Must be one of: " + validActions.join(', ') 
      });
    }

    // Get current product
    const [products] = await pool.execute(
      "SELECT * FROM res_products WHERE product_id = ?",
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = products[0];
    const previousStock = product.stock_quantity;
    const newStock = previousStock + quantity_change;

    // Prevent negative stock
    if (newStock < 0) {
      return res.status(400).json({ 
        error: `Insufficient stock. Current stock: ${previousStock}, Requested reduction: ${Math.abs(quantity_change)}` 
      });
    }

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update product stock
      await connection.execute(
        "UPDATE res_products SET stock_quantity = ? WHERE product_id = ?",
        [newStock, id]
      );

      // Log inventory movement
      await connection.execute(`
        INSERT INTO res_inventory_logs (
          product_id, action_type, quantity_change, previous_stock, new_stock,
          unit_cost, reference_number, notes, performed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, action_type, quantity_change, previousStock, newStock,
        unit_cost || null, reference_number || null, notes || null, performed_by || null
      ]);

      await connection.commit();

      // Get updated product
      const [updatedProduct] = await pool.execute(
        "SELECT * FROM res_products WHERE product_id = ?",
        [id]
      );

      res.status(200).json({
        status: "success",
        message: "Inventory adjusted successfully",
        data: {
          product: updatedProduct[0],
          adjustment: {
            action_type,
            quantity_change,
            previous_stock: previousStock,
            new_stock: newStock,
            unit_cost,
            reference_number,
            notes,
            performed_by
          }
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error adjusting inventory:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Bulk inventory adjustment
async function bulkAdjustInventory(req, res) {
  try {
    const { adjustments, performed_by } = req.body;

    if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json({ 
        error: "Adjustments array is required" 
      });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const results = [];
      const errors = [];

      for (const adjustment of adjustments) {
        const { 
          product_id, 
          action_type, 
          quantity_change, 
          unit_cost, 
          reference_number, 
          notes 
        } = adjustment;

        try {
          // Get current product
          const [products] = await connection.execute(
            "SELECT * FROM res_products WHERE product_id = ?",
            [product_id]
          );

          if (products.length === 0) {
            errors.push({ product_id, error: "Product not found" });
            continue;
          }

          const product = products[0];
          const previousStock = product.stock_quantity;
          const newStock = previousStock + quantity_change;

          if (newStock < 0) {
            errors.push({ 
              product_id, 
              error: `Insufficient stock. Current: ${previousStock}, Requested: ${Math.abs(quantity_change)}` 
            });
            continue;
          }

          // Update product stock
          await connection.execute(
            "UPDATE res_products SET stock_quantity = ? WHERE product_id = ?",
            [newStock, product_id]
          );

          // Log inventory movement
          await connection.execute(`
            INSERT INTO res_inventory_logs (
              product_id, action_type, quantity_change, previous_stock, new_stock,
              unit_cost, reference_number, notes, performed_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            product_id, action_type, quantity_change, previousStock, newStock,
            unit_cost || null, reference_number || null, notes || null, performed_by || null
          ]);

          results.push({
            product_id,
            product_name: product.product_name,
            sku: product.sku,
            previous_stock: previousStock,
            new_stock: newStock,
            quantity_change
          });
        } catch (error) {
          errors.push({ product_id, error: error.message });
        }
      }

      await connection.commit();

      res.status(200).json({
        status: "success",
        message: `Bulk adjustment completed. ${results.length} successful, ${errors.length} failed`,
        data: {
          successful: results,
          failed: errors
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error in bulk inventory adjustment:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get inventory reports
async function getInventoryReports(req, res) {
  try {
    const { 
      reportType = 'summary', 
      supplierId, 
      categoryId, 
      startDate, 
      endDate,
      actionType 
    } = req.query;

    let reportData = {};

    switch (reportType) {
      case 'summary':
        // Get inventory summary report
        const [summaryStats] = await pool.execute(`
          SELECT 
            COUNT(*) as total_products,
            COUNT(CASE WHEN status = 1 THEN 1 END) as active_products,
            COUNT(CASE WHEN stock_quantity > 0 THEN 1 END) as in_stock_products,
            COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_products,
            SUM(stock_quantity) as total_stock,
            SUM(stock_quantity * sale_price) as total_inventory_value,
            AVG(stock_quantity) as avg_stock_per_product
          FROM res_products
        `);

        const [supplierStats] = await pool.execute(`
          SELECT 
            s.supplier_name,
            COUNT(p.product_id) as product_count,
            SUM(p.stock_quantity) as total_stock,
            SUM(p.stock_quantity * p.sale_price) as inventory_value
          FROM res_suppliers s
          LEFT JOIN res_products p ON s.supplier_name = p.supplier
          GROUP BY s.supplier_id, s.supplier_name
          ORDER BY inventory_value DESC
        `);

        reportData = {
          summary: summaryStats[0],
          by_supplier: supplierStats
        };
        break;

      case 'movements':
        // Get inventory movements report
        let movementsQuery = `
          SELECT 
            il.log_id, il.product_id, p.product_name, p.sku, p.supplier,
            il.action_type, il.quantity_change, il.previous_stock, il.new_stock,
            il.unit_cost, il.reference_number, il.notes, il.performed_by, il.created_at
          FROM res_inventory_logs il
          JOIN res_products p ON il.product_id = p.product_id
        `;

        const movementsParams = [];
        const movementsConditions = [];

        if (supplierId) {
          movementsConditions.push('p.supplier = (SELECT supplier_name FROM res_suppliers WHERE supplier_id = ?)');
          movementsParams.push(supplierId);
        }

        if (actionType) {
          movementsConditions.push('il.action_type = ?');
          movementsParams.push(actionType);
        }

        if (startDate) {
          movementsConditions.push('il.created_at >= ?');
          movementsParams.push(startDate);
        }

        if (endDate) {
          movementsConditions.push('il.created_at <= ?');
          movementsParams.push(endDate);
        }

        if (movementsConditions.length > 0) {
          movementsQuery += ` WHERE ${movementsConditions.join(' AND ')}`;
        }

        movementsQuery += ` ORDER BY il.created_at DESC LIMIT 100`;

        const [movements] = await pool.execute(movementsQuery, movementsParams);

        reportData = {
          movements: movements
        };
        break;

      case 'low_stock':
        // Get low stock report
        const [lowStockReport] = await pool.execute(`
          SELECT 
            p.product_id, p.product_name, p.sku, p.supplier, p.stock_quantity,
            p.sale_price, p.status, p.created_at
          FROM res_products p
          WHERE p.stock_quantity <= 10 AND p.status = 1
          ORDER BY p.stock_quantity ASC
        `);

        reportData = {
          low_stock_products: lowStockReport
        };
        break;

      case 'value_analysis':
        // Get inventory value analysis
        const [valueAnalysis] = await pool.execute(`
          SELECT 
            CASE 
              WHEN (stock_quantity * sale_price) < 1000 THEN 'Under $1,000'
              WHEN (stock_quantity * sale_price) BETWEEN 1000 AND 5000 THEN '$1,000 - $5,000'
              WHEN (stock_quantity * sale_price) BETWEEN 5000 AND 10000 THEN '$5,000 - $10,000'
              WHEN (stock_quantity * sale_price) BETWEEN 10000 AND 50000 THEN '$10,000 - $50,000'
              ELSE 'Over $50,000'
            END as value_range,
            COUNT(*) as product_count,
            SUM(stock_quantity) as total_stock,
            SUM(stock_quantity * sale_price) as total_value
          FROM res_products
          WHERE status = 1
          GROUP BY value_range
          ORDER BY MIN(stock_quantity * sale_price)
        `);

        reportData = {
          value_analysis: valueAnalysis
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
    console.error("Error generating inventory reports:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get inventory alerts
async function getInventoryAlerts(req, res) {
  try {
    const { threshold = 10 } = req.query;

    // Get low stock alerts
    const [lowStockAlerts] = await pool.execute(`
      SELECT 
        p.product_id, p.product_name, p.sku, p.supplier, p.stock_quantity,
        p.sale_price, p.status, 'low_stock' as alert_type,
        CONCAT('Stock is low: ', p.stock_quantity, ' units remaining') as message
      FROM res_products p
      WHERE p.stock_quantity <= ? AND p.stock_quantity > 0 AND p.status = 1
      ORDER BY p.stock_quantity ASC
    `, [threshold]);

    // Get out of stock alerts
    const [outOfStockAlerts] = await pool.execute(`
      SELECT 
        p.product_id, p.product_name, p.sku, p.supplier, p.stock_quantity,
        p.sale_price, p.status, 'out_of_stock' as alert_type,
        'Product is out of stock' as message
      FROM res_products p
      WHERE p.stock_quantity = 0 AND p.status = 1
      ORDER BY p.created_at DESC
    `);

    // Get high value products with low stock
    const [highValueLowStock] = await pool.execute(`
      SELECT 
        p.product_id, p.product_name, p.sku, p.supplier, p.stock_quantity,
        p.sale_price, p.status, 'high_value_low_stock' as alert_type,
        CONCAT('High value product with low stock: $', (p.stock_quantity * p.sale_price), ' inventory value') as message
      FROM res_products p
      WHERE p.stock_quantity <= ? AND p.stock_quantity > 0 AND p.status = 1 
        AND (p.stock_quantity * p.sale_price) > 1000
      ORDER BY (p.stock_quantity * p.sale_price) DESC
    `, [threshold]);

    const allAlerts = [
      ...lowStockAlerts,
      ...outOfStockAlerts,
      ...highValueLowStock
    ];

    res.status(200).json({
      status: "success",
      data: {
        alerts: allAlerts,
        summary: {
          low_stock_count: lowStockAlerts.length,
          out_of_stock_count: outOfStockAlerts.length,
          high_value_low_stock_count: highValueLowStock.length,
          total_alerts: allAlerts.length
        }
      }
    });
  } catch (error) {
    console.error("Error fetching inventory alerts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  getInventoryOverview,
  getProductInventory,
  adjustInventory,
  bulkAdjustInventory,
  getInventoryReports,
  getInventoryAlerts
};
