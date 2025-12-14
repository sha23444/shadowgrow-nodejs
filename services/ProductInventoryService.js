const { pool } = require('../config/database');

/**
 * Product Inventory Service
 * Manages inventory for digital products based on:
 * - Activation keys count (for products requiring activation keys)
 * - Digital file URLs (unlimited stock)
 * - Regular stock_quantity (for other digital products)
 */
class ProductInventoryService {
  /**
   * Update inventory for a specific digital product
   * @param {number} productId - Product ID
   * @param {Object} connection - Database connection (optional, for transactions)
   * @returns {Promise<{stock_quantity: number, track_inventory: number}>}
   */
  static async updateProductInventory(productId, connection = null) {
    const db = connection || pool;
    const shouldRelease = !connection;

    try {
      // Get product details
      const [products] = await db.execute(
        `SELECT 
          product_id,
          is_digital_download,
          product_type,
          requires_activation_key,
          digital_file_url,
          stock_quantity,
          track_inventory
         FROM res_products 
         WHERE product_id = ?`,
        [productId]
      );

      if (products.length === 0) {
        throw new Error(`Product ${productId} not found`);
      }

      const product = products[0];
      const isDigital = product.is_digital_download === 1 || product.product_type === 'digital';

      if (!isDigital) {
        // Not a digital product, return current values
        return {
          stock_quantity: product.stock_quantity,
          track_inventory: product.track_inventory,
        };
      }

      let newStockQuantity = null;
      let newTrackInventory = 0;

      // Check if product requires activation keys
      if (product.requires_activation_key === 1 || product.requires_activation_key === true) {
        // Count available activation keys
        const [keyCount] = await db.execute(
          `SELECT COUNT(*) as available_keys 
           FROM res_product_activation_keys 
           WHERE product_id = ? AND status = 'available'`,
          [productId]
        );

        const availableKeys = keyCount[0]?.available_keys || 0;
        newStockQuantity = availableKeys;
        newTrackInventory = 1; // Track inventory based on available keys
      }
      // Check if product has digital file URL (unlimited downloads)
      else if (product.digital_file_url && product.digital_file_url.trim() !== '') {
        // Unlimited stock for file-based digital products
        newStockQuantity = 999999;
        newTrackInventory = 0; // Don't track inventory for file downloads
      }
      // Digital product without activation keys or file URL (unlimited)
      else {
        // Unlimited stock for general digital products
        newStockQuantity = 999999;
        newTrackInventory = 0;
      }

      // Update product inventory
      await db.execute(
        `UPDATE res_products 
         SET stock_quantity = ?, 
             track_inventory = ?
         WHERE product_id = ?`,
        [newStockQuantity, newTrackInventory, productId]
      );

      return {
        stock_quantity: newStockQuantity,
        track_inventory: newTrackInventory,
      };
    } catch (error) {
      console.error(`Error updating inventory for product ${productId}:`, error);
      throw error;
    } finally {
      if (shouldRelease && connection) {
        connection.release();
      }
    }
  }

  /**
   * Update inventory for all digital products
   * @param {Object} connection - Database connection (optional, for transactions)
   * @returns {Promise<{updated: number, activationKeyProducts: number, fileUrlProducts: number, unlimitedProducts: number}>}
   */
  static async updateAllDigitalProductsInventory(connection = null) {
    const db = connection || pool;
    const shouldRelease = !connection;

    try {
      // Get all digital products
      const [digitalProducts] = await db.execute(
        `SELECT 
          product_id, 
          product_name, 
          is_digital_download, 
          product_type,
          requires_activation_key,
          digital_file_url
         FROM res_products 
         WHERE is_digital_download = 1 OR product_type = 'digital'`
      );

      let updatedCount = 0;
      let activationKeyProducts = 0;
      let fileUrlProducts = 0;
      let unlimitedProducts = 0;

      for (const product of digitalProducts) {
        const result = await this.updateProductInventory(product.product_id, db);

        updatedCount++;

        if (product.requires_activation_key === 1 || product.requires_activation_key === true) {
          activationKeyProducts++;
        } else if (product.digital_file_url && product.digital_file_url.trim() !== '') {
          fileUrlProducts++;
        } else {
          unlimitedProducts++;
        }
      }

      return {
        updated: updatedCount,
        activationKeyProducts,
        fileUrlProducts,
        unlimitedProducts,
      };
    } catch (error) {
      console.error('Error updating all digital products inventory:', error);
      throw error;
    } finally {
      if (shouldRelease && connection) {
        connection.release();
      }
    }
  }

  /**
   * Get current inventory status for a product
   * @param {number} productId - Product ID
   * @returns {Promise<{stock_quantity: number, track_inventory: number, available_keys?: number, has_file_url: boolean}>}
   */
  static async getProductInventoryStatus(productId) {
    try {
      const [products] = await pool.execute(
        `SELECT 
          stock_quantity,
          track_inventory,
          requires_activation_key,
          digital_file_url
         FROM res_products 
         WHERE product_id = ?`,
        [productId]
      );

      if (products.length === 0) {
        throw new Error(`Product ${productId} not found`);
      }

      const product = products[0];
      const result = {
        stock_quantity: product.stock_quantity,
        track_inventory: product.track_inventory,
        has_file_url: !!(product.digital_file_url && product.digital_file_url.trim() !== ''),
      };

      // If product uses activation keys, get count
      if (product.requires_activation_key === 1 || product.requires_activation_key === true) {
        const [keyCount] = await pool.execute(
          `SELECT COUNT(*) as available_keys 
           FROM res_product_activation_keys 
           WHERE product_id = ? AND status = 'available'`,
          [productId]
        );
        result.available_keys = keyCount[0]?.available_keys || 0;
      }

      return result;
    } catch (error) {
      console.error(`Error getting inventory status for product ${productId}:`, error);
      throw error;
    }
  }
}

module.exports = ProductInventoryService;
