const { pool } = require("../../config/database");

/**
 * Get all activation keys for a product
 */
async function getActivationKeys(req, res) {
  const { productId } = req.params;
  const { page = 1, limit = 20, status, search } = req.query;

  try {
    const offset = (page - 1) * limit;
    let whereClause = "WHERE ak.product_id = ?";
    let queryParams = [productId];

    // Add status filter
    if (status) {
      whereClause += " AND ak.status = ?";
      queryParams.push(status);
    }

    // Add search filter
    if (search) {
      whereClause += " AND (ak.activation_key LIKE ? OR ak.description LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_product_activation_keys ak ${whereClause}`,
      queryParams
    );

    // Get activation keys with pagination
    const [keys] = await pool.execute(
      `SELECT 
        ak.key_id,
        ak.product_id,
        ak.activation_key,
        ak.key_type,
        ak.description,
        ak.status,
        ak.order_id,
        ak.user_id,
        ak.used_at,
        ak.expires_at,
        ak.created_at,
        p.product_name,
        u.username,
        u.email,
        o.order_number
      FROM res_product_activation_keys ak
      LEFT JOIN res_products p ON ak.product_id = p.product_id
      LEFT JOIN res_users u ON ak.user_id = u.user_id
      LEFT JOIN res_orders o ON ak.order_id = o.order_id
      ${whereClause}
      ORDER BY ak.created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), offset]
    );

    res.json({
      status: "success",
      data: {
        keys,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(countResult[0].total / limit),
          totalItems: countResult[0].total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error("Error fetching activation keys:", error);
    res.status(500).json({ error: "Failed to fetch activation keys" });
  }
}

/**
 * Add new activation keys (bulk)
 */
async function addActivationKeys(req, res) {
  const { productId } = req.params;
  const { keys, batchName, notes } = req.body;

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: "Activation keys array is required" });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // Create batch record
    const [batchResult] = await connection.execute(
      `INSERT INTO res_activation_key_batches (product_id, batch_name, total_keys, notes) VALUES (?, ?, ?, ?)`,
      [productId, batchName || `Batch ${new Date().toISOString()}`, keys.length, notes]
    );

    const batchId = batchResult.insertId;

    // Insert activation keys
    for (const keyData of keys) {
      await connection.execute(
        `INSERT INTO res_product_activation_keys 
         (product_id, activation_key, key_type, description, expires_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          productId,
          keyData.activation_key,
          keyData.key_type || 'license',
          keyData.description || null,
          keyData.expires_at || null
        ]
      );
    }

    // Update product inventory after adding keys (increases available count)
    const ProductInventoryService = require('../../services/ProductInventoryService');
    await ProductInventoryService.updateProductInventory(productId, connection);

    await connection.commit();

    res.json({
      status: "success",
      message: `${keys.length} activation keys added successfully`,
      batchId
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error adding activation keys:", error);
    res.status(500).json({ error: "Failed to add activation keys" });
  } finally {
    connection.release();
  }
}

/**
 * Update activation key status
 */
async function updateActivationKeyStatus(req, res) {
  const { keyId } = req.params;
  const { status, notes } = req.body;

  if (!['available', 'used', 'expired', 'revoked'].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    await pool.execute(
      `UPDATE res_product_activation_keys SET status = ?, updated_at = NOW() WHERE key_id = ?`,
      [status, keyId]
    );

    // Log the status change
    await pool.execute(
      `INSERT INTO res_activation_key_logs (key_id, action, notes) VALUES (?, ?, ?)`,
      [keyId, status, notes || null]
    );

    // Update product inventory if key status changed (affects available count)
    if (status === 'available' || status === 'used' || status === 'revoked') {
      const [keyInfo] = await pool.execute(
        "SELECT product_id FROM res_product_activation_keys WHERE key_id = ?",
        [keyId]
      );
      if (keyInfo.length > 0) {
        const ProductInventoryService = require('../../services/ProductInventoryService');
        await ProductInventoryService.updateProductInventory(keyInfo[0].product_id);
      }
    }

    res.json({
      status: "success",
      message: "Activation key status updated successfully"
    });
  } catch (error) {
    console.error("Error updating activation key status:", error);
    res.status(500).json({ error: "Failed to update activation key status" });
  }
}

/**
 * Assign activation key to order
 */
async function assignActivationKey(req, res) {
  const { orderId } = req.params;
  const { productId } = req.body;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // Get order details
    const [orderRows] = await connection.execute(
      `SELECT user_id, order_status FROM res_orders WHERE order_id = ?`,
      [orderId]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { user_id, order_status } = orderRows[0];

    // Find available activation key for this product
    const [keyRows] = await connection.execute(
      `SELECT key_id, activation_key FROM res_product_activation_keys 
       WHERE product_id = ? AND status = 'available' 
       ORDER BY created_at ASC LIMIT 1`,
      [productId]
    );

    if (keyRows.length === 0) {
      return res.status(400).json({ error: "No available activation keys for this product" });
    }

    const { key_id, activation_key } = keyRows[0];

    // Update activation key status
    await connection.execute(
      `UPDATE res_product_activation_keys 
       SET status = 'used', order_id = ?, user_id = ?, used_at = NOW() 
       WHERE key_id = ?`,
      [orderId, user_id, key_id]
    );

    // Log the assignment
    await connection.execute(
      `INSERT INTO res_activation_key_logs (key_id, order_id, user_id, action, notes) 
       VALUES (?, ?, ?, 'used', 'Assigned to order')`,
      [key_id, orderId, user_id]
    );

    // Update product inventory after key is assigned (reduces available count)
    const ProductInventoryService = require('../../services/ProductInventoryService');
    await ProductInventoryService.updateProductInventory(productId, connection);

    await connection.commit();

    res.json({
      status: "success",
      message: "Activation key assigned successfully",
      data: {
        key_id,
        activation_key,
        order_id: orderId,
        user_id
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error assigning activation key:", error);
    res.status(500).json({ error: "Failed to assign activation key" });
  } finally {
    connection.release();
  }
}

/**
 * Get activation key statistics
 */
async function getActivationKeyStatistics(req, res) {
  const { productId } = req.params;

  try {
    const [stats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_keys,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_keys,
        SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used_keys,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_keys,
        SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revoked_keys
      FROM res_product_activation_keys 
      WHERE product_id = ?`,
      [productId]
    );

    res.json({
      status: "success",
      data: stats[0]
    });
  } catch (error) {
    console.error("Error fetching activation key statistics:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
}

/**
 * Get activation key batches
 */
async function getActivationKeyBatches(req, res) {
  const { productId } = req.params;

  try {
    const [batches] = await pool.execute(
      `SELECT 
        batch_id,
        batch_name,
        total_keys,
        used_keys,
        notes,
        created_at
      FROM res_activation_key_batches 
      WHERE product_id = ?
      ORDER BY created_at DESC`,
      [productId]
    );

    res.json({
      status: "success",
      data: batches
    });
  } catch (error) {
    console.error("Error fetching activation key batches:", error);
    res.status(500).json({ error: "Failed to fetch batches" });
  }
}

module.exports = {
  getActivationKeys,
  addActivationKeys,
  updateActivationKeyStatus,
  assignActivationKey,
  getActivationKeyStatistics,
  getActivationKeyBatches
};
