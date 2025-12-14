const { pool } = require('../config/database');
const { sendEmail } = require('../email-service/email-service');
const ProductInventoryService = require('./ProductInventoryService');
const { ErrorLogger } = require('../logger');

/**
 * Digital Product Delivery Service
 * Handles:
 * - Automatic activation key assignment
 * - Email delivery with activation keys
 * - Download tracking with limits and expiry
 * - Delivery instructions
 */
class DigitalProductDeliveryService {
  /**
   * Process digital product delivery for an order
   * @param {number} orderId - Order ID
   * @param {number} userId - User ID
   * @param {Object} connection - Database connection (optional, for transactions)
   * @returns {Promise<{assignedKeys: Array, emailsSent: number, errors: Array}>}
   */
  static async processDigitalProductDelivery(orderId, userId, connection = null) {
    const db = connection || pool;
    const shouldRelease = !connection;

    const result = {
      assignedKeys: [],
      emailsSent: 0,
      errors: [],
    };

    try {
      // Get order details
      const [orderRows] = await db.execute(
        `SELECT order_id, user_id, order_status, payment_status, created_at 
         FROM res_orders WHERE order_id = ?`,
        [orderId]
      );

      if (orderRows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const order = orderRows[0];

      // Get user details
      const [userRows] = await db.execute(
        `SELECT user_id, username, email, first_name, last_name 
         FROM res_users WHERE user_id = ?`,
        [userId]
      );

      if (userRows.length === 0) {
        throw new Error(`User ${userId} not found`);
      }

      const user = userRows[0];

      // Get order items (digital products only - item_type = 3)
      // Use res_uproducts table which stores user products for orders
      // Include products that are digital downloads OR require activation keys
      // EXCLUDE products that require manual processing
      const [orderItems] = await db.execute(
        `SELECT 
          up.product_id,
          up.quantity,
          rp.product_id,
          rp.product_name,
          rp.requires_activation_key,
          rp.requires_manual_processing,
          rp.digital_file_url,
          rp.digital_delivery_time,
          rp.delivery_instructions,
          rp.download_limit,
          rp.download_expiry_days,
          rp.is_digital_download,
          rp.sale_price as price
         FROM res_uproducts up
         INNER JOIN res_products rp ON up.product_id = rp.product_id
         WHERE up.order_id = ? AND up.user_id = ? 
         AND (rp.is_digital_download = 1 OR rp.requires_activation_key = 1)
         AND (rp.requires_manual_processing = 0 OR rp.requires_manual_processing IS NULL)`,
        [orderId, userId]
      );

      if (orderItems.length === 0) {
        // No digital products in this order
        return result;
      }

      // Process each digital product
      for (const item of orderItems) {
        try {
          // Process quantity times (if user bought multiple)
          const quantity = item.quantity || 1;
          for (let qty = 0; qty < quantity; qty++) {
            const deliveryResult = await this.processSingleProductDelivery(
              orderId,
              userId,
              item,
              user,
              order,
              db
            );

            if (deliveryResult.activationKey) {
              result.assignedKeys.push(deliveryResult.activationKey);
            }

            if (deliveryResult.emailSent) {
              result.emailsSent++;
            }

            if (deliveryResult.error) {
              result.errors.push({
                product_id: item.product_id,
                product_name: item.product_name,
                error: deliveryResult.error,
              });
            }
          }
        } catch (itemError) {
          result.errors.push({
            product_id: item.product_id,
            product_name: item.product_name,
            error: itemError.message,
          });
          console.error(`Error processing product ${item.product_id}:`, itemError);
        }
      }

      return result;
    } catch (error) {
      console.error('Error in processDigitalProductDelivery:', error);
      throw error;
    } finally {
      if (shouldRelease && connection) {
        connection.release();
      }
    }
  }

  /**
   * Process delivery for a single digital product
   * @private
   */
  static async processSingleProductDelivery(orderId, userId, item, user, order, connection) {
    const result = {
      activationKey: null,
      emailSent: false,
      error: null,
    };

    try {
      // Skip products that require manual processing
      if (item.requires_manual_processing === 1 || item.requires_manual_processing === true) {
        // Product requires manual processing - skip automatic delivery
        return result;
      }

      // Check if product requires activation key
      if (item.requires_activation_key === 1 || item.requires_activation_key === true) {
        // Assign activation key automatically
        const keyResult = await this.assignActivationKey(
          orderId,
          userId,
          item.product_id,
          connection
        );

        if (keyResult.success && keyResult.activationKey) {
          result.activationKey = keyResult.activationKey;

          // Send email with activation key (don't fail if email fails)
          try {
            await this.sendActivationKeyEmail(
              user,
              order,
              item,
              keyResult.activationKey,
              connection
            );
            result.emailSent = true;
          } catch (emailError) {
            console.warn('Email sending failed, but key was assigned:', emailError.message);
            // Continue even if email fails
          }
        } else {
          result.error = keyResult.error || 'Failed to assign activation key';
        }
      } else if (item.digital_file_url) {
        // Product has digital file URL - send download email
        try {
          await this.sendDigitalFileEmail(user, order, item, connection);
          result.emailSent = true;
        } catch (emailError) {
          console.warn('Email sending failed:', emailError.message);
        }
      } else {
        // General digital product - send confirmation email
        try {
          await this.sendDigitalProductConfirmationEmail(user, order, item, connection);
          result.emailSent = true;
        } catch (emailError) {
          console.warn('Email sending failed:', emailError.message);
        }
      }

      // Create download record for tracking
      await this.createDownloadRecord(orderId, userId, item, connection);
    } catch (error) {
      result.error = error.message;
      throw error;
    }

    return result;
  }

  /**
   * Assign activation key to order
   * @private
   */
  static async assignActivationKey(orderId, userId, productId, connection) {
    try {
      // Find available activation key
      const [keyRows] = await connection.execute(
        `SELECT key_id, activation_key 
         FROM res_product_activation_keys 
         WHERE product_id = ? AND status = 'available' 
         ORDER BY created_at ASC 
         LIMIT 1 FOR UPDATE`,
        [productId]
      );

      if (keyRows.length === 0) {
        return {
          success: false,
          error: 'No available activation keys for this product',
        };
      }

      const { key_id, activation_key } = keyRows[0];

      // Update key status to 'used'
      await connection.execute(
        `UPDATE res_product_activation_keys 
         SET status = 'used', order_id = ?, user_id = ?, used_at = NOW() 
         WHERE key_id = ?`,
        [orderId, userId, key_id]
      );

      // Log the assignment
      await connection.execute(
        `INSERT INTO res_activation_key_logs (key_id, order_id, user_id, action, notes) 
         VALUES (?, ?, ?, 'used', 'Automatically assigned on order completion')`,
        [key_id, orderId, userId]
      );

      // Update product inventory
      await ProductInventoryService.updateProductInventory(productId, connection);

      return {
        success: true,
        activationKey: activation_key,
        keyId: key_id,
      };
    } catch (error) {
      console.error('Error assigning activation key:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email with activation key
   * @private
   */
  static async sendActivationKeyEmail(user, order, product, activationKey, connection) {
    try {
      const emailSubject = `Your ${product.product_name} Activation Key - Order #${order.order_id}`;
      
      // Build email data
      const emailData = {
        userName: user.first_name || user.username,
        orderNumber: order.order_id,
        productName: product.product_name,
        activationKey: activationKey,
        deliveryTime: product.digital_delivery_time || 'Immediate',
        deliveryInstructions: product.delivery_instructions || 
          'Your activation key has been assigned to your order. Please use it to activate your product.',
        orderDate: new Date(order.created_at).toLocaleDateString(),
        downloadUrl: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/account/orders/${order.order_id}`,
      };

      // Send email
      await sendEmail(user.email, emailSubject, 'activation-key-delivery', emailData);

      return true;
    } catch (error) {
      console.error('Error sending activation key email:', error);
      await ErrorLogger.logError({
        errorType: 'email',
        errorLevel: 'error',
        errorMessage: `Failed to send activation key email: ${error.message}`,
        errorDetails: error,
        userId: user.user_id,
        orderId: order.order_id,
        endpoint: 'DigitalProductDeliveryService.sendActivationKeyEmail',
      });
      throw error;
    }
  }

  /**
   * Send email with digital file download link
   * @private
   */
  static async sendDigitalFileEmail(user, order, product, connection) {
    try {
      const emailSubject = `Your ${product.product_name} Download - Order #${order.order_id}`;
      
      const emailData = {
        userName: user.first_name || user.username,
        orderNumber: order.order_id,
        productName: product.product_name,
        downloadUrl: product.digital_file_url,
        deliveryTime: product.digital_delivery_time || 'Immediate',
        deliveryInstructions: product.delivery_instructions || 
          'You can download your digital product using the link below.',
        downloadLimit: product.download_limit || 'Unlimited',
        downloadExpiryDays: product.download_expiry_days || 'Never',
        orderDate: new Date(order.created_at).toLocaleDateString(),
        orderUrl: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/account/orders/${order.order_id}`,
      };

      await sendEmail(user.email, emailSubject, 'digital-file-delivery', emailData);

      return true;
    } catch (error) {
      console.error('Error sending digital file email:', error);
      await ErrorLogger.logError({
        errorType: 'email',
        errorLevel: 'error',
        errorMessage: `Failed to send digital file email: ${error.message}`,
        errorDetails: error,
        userId: user.user_id,
        orderId: order.order_id,
        endpoint: 'DigitalProductDeliveryService.sendDigitalFileEmail',
      });
      throw error;
    }
  }

  /**
   * Send confirmation email for general digital product
   * @private
   */
  static async sendDigitalProductConfirmationEmail(user, order, product, connection) {
    try {
      const emailSubject = `Your ${product.product_name} Order Confirmation - Order #${order.order_id}`;
      
      const emailData = {
        userName: user.first_name || user.username,
        orderNumber: order.order_id,
        productName: product.product_name,
        deliveryTime: product.digital_delivery_time || 'Immediate',
        deliveryInstructions: product.delivery_instructions || 
          'Your digital product order has been confirmed. Access your product from your account.',
        orderDate: new Date(order.created_at).toLocaleDateString(),
        orderUrl: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/account/orders/${order.order_id}`,
      };

      await sendEmail(user.email, emailSubject, 'digital-product-confirmation', emailData);

      return true;
    } catch (error) {
      console.error('Error sending digital product confirmation email:', error);
      await ErrorLogger.logError({
        errorType: 'email',
        errorLevel: 'error',
        errorMessage: `Failed to send digital product confirmation email: ${error.message}`,
        errorDetails: error,
        userId: user.user_id,
        orderId: order.order_id,
        endpoint: 'DigitalProductDeliveryService.sendDigitalProductConfirmationEmail',
      });
      throw error;
    }
  }

  /**
   * Create download record for tracking
   * @private
   */
  static async createDownloadRecord(orderId, userId, product, connection) {
    try {
      // Check if download record already exists
      const [existing] = await connection.execute(
        `SELECT download_id FROM res_product_downloads 
         WHERE order_id = ? AND user_id = ? AND product_id = ?`,
        [orderId, userId, product.product_id]
      );

      if (existing.length > 0) {
        // Record already exists
        return existing[0].download_id;
      }

      // Calculate expiry date if download_expiry_days is set
      let expiresAt = null;
      if (product.download_expiry_days && product.download_expiry_days > 0) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + product.download_expiry_days);
        expiresAt = expiryDate;
      }

      // Create download record
      const [result] = await connection.execute(
        `INSERT INTO res_product_downloads 
         (order_id, user_id, product_id, download_count, download_limit, expires_at, created_at) 
         VALUES (?, ?, ?, 0, ?, ?, NOW())`,
        [
          orderId,
          userId,
          product.product_id,
          product.download_limit || null,
          expiresAt,
        ]
      );

      return result.insertId;
    } catch (error) {
      // If table doesn't exist, log but don't fail
      if (error.message.includes("doesn't exist")) {
        console.warn('res_product_downloads table does not exist. Skipping download record creation.');
        return null;
      }
      console.error('Error creating download record:', error);
      throw error;
    }
  }

  /**
   * Validate download access
   * @param {number} userId - User ID
   * @param {number} productId - Product ID
   * @param {number} orderId - Order ID (optional)
   * @returns {Promise<{allowed: boolean, reason?: string, downloadCount?: number, downloadLimit?: number, expiresAt?: Date}>}
   */
  static async validateDownloadAccess(userId, productId, orderId = null) {
    try {
      // Get download record (if table exists)
      let download = null;
      try {
        let query = `SELECT * FROM res_product_downloads 
                     WHERE user_id = ? AND product_id = ?`;
        let params = [userId, productId];

        if (orderId) {
          query += ` AND order_id = ?`;
          params.push(orderId);
        }

        const [downloads] = await pool.execute(query, params);
        if (downloads.length > 0) {
          download = downloads[0];
        }
      } catch (error) {
        // Table doesn't exist - skip download record check
        if (error.message.includes("doesn't exist")) {
          console.warn('res_product_downloads table does not exist. Skipping download record check.');
        } else {
          throw error;
        }
      }

      // If no download record exists, check if user has access via order
      if (!download) {
        if (orderId) {
          // Check if user owns the order and product is in the order
          const [orderProducts] = await pool.execute(
            `SELECT up.* FROM res_uproducts up
             JOIN res_orders o ON up.order_id = o.order_id
             WHERE up.order_id = ? AND up.product_id = ? AND o.user_id = ? AND o.order_status = 7`,
            [orderId, productId, userId]
          );

          if (orderProducts.length > 0) {
            // User has valid order - check product-level limits
            const [products] = await pool.execute(
              `SELECT download_limit, download_expiry_days FROM res_products WHERE product_id = ?`,
              [productId]
            );
            
            const product = products.length > 0 ? products[0] : null;
            const downloadLimit = product?.download_limit || null;
            const downloadExpiryDays = product?.download_expiry_days || null;
            
            // Calculate expiry date if exists
            let expiresAt = null;
            if (orderId && downloadExpiryDays && downloadExpiryDays > 0) {
              const [orders] = await pool.execute(
                `SELECT created_at FROM res_orders WHERE order_id = ?`,
                [orderId]
              );
              if (orders.length > 0) {
                const orderDate = new Date(orders[0].created_at);
                orderDate.setDate(orderDate.getDate() + downloadExpiryDays);
                expiresAt = orderDate;
                
                // Check if expired
                if (expiresAt < new Date()) {
                  return { allowed: false, reason: 'Download link has expired' };
                }
              }
            }
            
            // User has valid order - allow download
            return { 
              allowed: true,
              downloadCount: 0,
              downloadLimit: downloadLimit,
              expiresAt: expiresAt
            };
          }
        }

        return { allowed: false, reason: 'No download access found' };
      }

      // Check expiry
      if (download.expires_at) {
        const expiresAt = new Date(download.expires_at);
        if (expiresAt < new Date()) {
          return { allowed: false, reason: 'Download link has expired' };
        }
      }

      // Check download limit
      if (download.download_limit && download.download_limit > 0) {
        if (download.download_count >= download.download_limit) {
          return {
            allowed: false,
            reason: 'Download limit reached',
            downloadCount: download.download_count,
            downloadLimit: download.download_limit,
          };
        }
      }

      return {
        allowed: true,
        downloadCount: download.download_count,
        downloadLimit: download.download_limit,
        expiresAt: download.expires_at ? new Date(download.expires_at) : null,
      };
    } catch (error) {
      console.error('Error validating download access:', error);
      return { allowed: false, reason: 'Error validating access' };
    }
  }

  /**
   * Increment download count
   * @param {number} userId - User ID
   * @param {number} productId - Product ID
   * @param {number} orderId - Order ID (optional)
   */
  static async incrementDownloadCount(userId, productId, orderId = null) {
    try {
      let query = `UPDATE res_product_downloads 
                   SET download_count = download_count + 1, last_downloaded_at = NOW() 
                   WHERE user_id = ? AND product_id = ?`;
      let params = [userId, productId];

      if (orderId) {
        query += ` AND order_id = ?`;
        params.push(orderId);
      }

      await pool.execute(query, params);
    } catch (error) {
      // If table doesn't exist, log but don't fail
      if (error.message.includes("doesn't exist")) {
        console.warn('res_product_downloads table does not exist. Skipping download count increment.');
        return;
      }
      console.error('Error incrementing download count:', error);
      throw error;
    }
  }
}

module.exports = DigitalProductDeliveryService;
