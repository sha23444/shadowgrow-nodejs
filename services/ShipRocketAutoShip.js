const { pool } = require('../config/database');
const ShipRocketService = require('./ShipRocketService');
const { ErrorLogger } = require('../logger');

/**
 * Automatic Ship Rocket Shipment Service
 * Handles automatic shipment creation for physical products
 */
class ShipRocketAutoShip {
  /**
   * Check if auto-shipment is enabled
   */
  async isAutoShipmentEnabled() {
    try {
      const [rows] = await pool.execute(
        "SELECT option_value FROM res_options WHERE option_name = 'shiprocket_auto_shipment'"
      );
      return rows.length > 0 && rows[0].option_value === '1';
    } catch (error) {
      console.error('Error checking auto-shipment setting:', error);
      return false;
    }
  }

  /**
   * Get pickup location configuration
   */
  async getPickupLocation() {
    try {
      const [rows] = await pool.execute(
        "SELECT option_name, option_value FROM res_options WHERE option_name IN ('shiprocket_pickup_pincode', 'shiprocket_pickup_address', 'shiprocket_pickup_city', 'shiprocket_pickup_state', 'shiprocket_pickup_name', 'shiprocket_pickup_phone', 'shiprocket_pickup_email')"
      );

      const config = {};
      rows.forEach(row => {
        const key = row.option_name.replace('shiprocket_', '');
        config[key] = row.option_value;
      });

      return config;
    } catch (error) {
      console.error('Error getting pickup location:', error);
      return null;
    }
  }

  /**
   * Get user's default shipping address
   */
  async getUserShippingAddress(userId) {
    try {
      const [addresses] = await pool.execute(
        `SELECT rua.*, 
         (SELECT s.name FROM states s WHERE s.iso2 = rua.state_code COLLATE utf8mb4_general_ci LIMIT 1) AS state_name,
         (SELECT c.name FROM countries c WHERE c.iso2 = rua.country_code COLLATE utf8mb4_general_ci LIMIT 1) AS country_name
         FROM res_user_addresses rua
         WHERE rua.user_id = ? AND rua.is_default = 1
         ORDER BY rua.address_id DESC
         LIMIT 1`,
        [userId]
      );

      if (addresses.length === 0) {
        // Try to get any address if no default
        const [allAddresses] = await pool.execute(
          `SELECT rua.*, 
           (SELECT s.name FROM states s WHERE s.iso2 = rua.state_code COLLATE utf8mb4_general_ci LIMIT 1) AS state_name,
           (SELECT c.name FROM countries c WHERE c.iso2 = rua.country_code COLLATE utf8mb4_general_ci LIMIT 1) AS country_name
           FROM res_user_addresses rua
           WHERE rua.user_id = ?
           ORDER BY rua.address_id DESC
           LIMIT 1`,
          [userId]
        );
        return allAddresses.length > 0 ? allAddresses[0] : null;
      }

      return addresses[0];
    } catch (error) {
      console.error('Error getting user shipping address:', error);
      return null;
    }
  }

  /**
   * Automatically create shipment for an order with physical products
   * @param {number} orderId - Order ID
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} Shipment result or null if not applicable
   */
  async createShipmentForOrder(orderId, userId) {
    try {
      // Check if auto-shipment is enabled
      const isEnabled = await this.isAutoShipmentEnabled();
      if (!isEnabled) {
        return null; // Auto-shipment disabled, skip
      }

      // Check if order already has a shipment
      const [existingOrders] = await pool.execute(
        "SELECT shiprocket_order_id FROM res_orders WHERE order_id = ?",
        [orderId]
      );

      if (existingOrders.length > 0 && existingOrders[0].shiprocket_order_id) {
        return null; // Shipment already exists
      }

      // Fetch order details
      const [orders] = await pool.execute(
        "SELECT * FROM res_orders WHERE order_id = ?",
        [orderId]
      );

      if (orders.length === 0) {
        return null; // Order not found
      }

      const order = orders[0];

      // Check if order has physical products (item_type = 6)
      let itemTypes;
      try {
        itemTypes = JSON.parse(order.item_types || '[]');
      } catch (error) {
        return null; // Invalid item types
      }

      if (!itemTypes.includes(6)) {
        return null; // No physical products in order
      }

      // Fetch physical products from order
      const [orderItems] = await pool.execute(
        `SELECT up.*, p.product_name, p.weight, p.length, p.width, p.height, p.sale_price
         FROM res_uproducts up 
         LEFT JOIN res_products p ON up.product_id = p.product_id
         WHERE up.order_id = ?`,
        [orderId]
      );

      if (orderItems.length === 0) {
        return null; // No physical products found
      }

      // Get pickup location configuration
      const pickupLocation = await this.getPickupLocation();
      if (!pickupLocation || !pickupLocation.pickup_pincode) {
        console.warn('Ship Rocket pickup location not configured, skipping auto-shipment');
        return null;
      }

      // Get user shipping address
      const userAddress = await this.getUserShippingAddress(userId);
      if (!userAddress || !userAddress.zip_code) {
        console.warn(`No shipping address found for user ${userId}, skipping auto-shipment`);
        return null;
      }

      // Fetch user details
      const [users] = await pool.execute(
        "SELECT first_name, last_name, email, phone, dial_code FROM res_users WHERE user_id = ?",
        [userId]
      );

      const user = users[0] || {};
      const customerName = userAddress.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User #${userId}`;
      const customerEmail = user.email || '';
      const customerPhone = userAddress.phone || `${user.dial_code || ''}${user.phone || ''}`.trim() || '';

      // Prepare order items for Ship Rocket
      const shipRocketItems = orderItems.map(item => ({
        name: item.product_name || 'Product',
        sku: item.product_id.toString(),
        units: item.quantity || 1,
        selling_price: parseFloat(item.sale_price || 0),
        weight: parseFloat(item.weight || 0.5), // Default 0.5 kg if not provided
        length: parseFloat(item.length || 10),
        width: parseFloat(item.width || 10),
        height: parseFloat(item.height || 10),
      }));

      // Calculate total weight and dimensions
      const totalWeight = shipRocketItems.reduce((sum, item) => sum + (item.weight * item.units), 0) || 0.5;
      const totalLength = Math.max(...shipRocketItems.map(item => item.length), 10);
      const totalWidth = Math.max(...shipRocketItems.map(item => item.width), 10);
      const totalHeight = shipRocketItems.reduce((sum, item) => sum + (item.height * item.units), 0) || 10;

      // Prepare shipment data for Ship Rocket
      const shipmentData = {
        order_id: `ORDER_${orderId}_${Date.now()}`,
        order_date: new Date(order.created_at).toISOString().split('T')[0],
        pickup_location: 'Primary',
        billing_customer_name: customerName,
        billing_last_name: '',
        billing_address: userAddress.address || '',
        billing_address_2: userAddress.landmark || '',
        billing_city: userAddress.city || '',
        billing_pincode: userAddress.zip_code || '',
        billing_state: userAddress.state_name || userAddress.state_code || '',
        billing_country: userAddress.country_name || userAddress.country_code || 'India',
        billing_email: customerEmail,
        billing_phone: customerPhone,
        billing_alternate_phone: userAddress.alternate_phone || '',
        shipping_is_billing: true,
        shipping_customer_name: customerName,
        shipping_last_name: '',
        shipping_address: userAddress.address || '',
        shipping_address_2: userAddress.landmark || '',
        shipping_city: userAddress.city || '',
        shipping_pincode: userAddress.zip_code || '',
        shipping_state: userAddress.state_name || userAddress.state_code || '',
        shipping_country: userAddress.country_name || userAddress.country_code || 'India',
        shipping_email: customerEmail,
        shipping_phone: customerPhone,
        order_items: shipRocketItems,
        payment_method: order.payment_status === 2 ? 'Prepaid' : 'COD',
        sub_total: parseFloat(order.subtotal || 0),
        length: totalLength,
        breadth: totalWidth,
        height: totalHeight,
        weight: totalWeight,
      };

      // Create shipment in Ship Rocket
      const shiprocketResponse = await ShipRocketService.createShipment(shipmentData);

      // Update order with Ship Rocket details
      if (shiprocketResponse && shiprocketResponse.shipment_id) {
        await pool.execute(
          `UPDATE res_orders 
           SET shiprocket_order_id = ?,
               shiprocket_awb = ?,
               shiprocket_tracking_url = ?,
               shiprocket_courier_name = ?,
               shiprocket_courier_id = ?,
               shiprocket_status = ?,
               shiprocket_response = ?,
               shiprocket_created_at = NOW()
           WHERE order_id = ?`,
          [
            shiprocketResponse.shipment_id?.toString() || null,
            shiprocketResponse.awb_code || null,
            shiprocketResponse.tracking_url || null,
            shiprocketResponse.courier_name || null,
            shiprocketResponse.courier_id?.toString() || null,
            shiprocketResponse.status || null,
            JSON.stringify(shiprocketResponse),
            orderId,
          ]
        );

        // Update order status to "Shipped" if shipment created successfully
        if (shiprocketResponse.status !== 'CANCELLED') {
          await pool.execute(
            "UPDATE res_orders SET order_status = 4 WHERE order_id = ?",
            [orderId]
          );
        }

        return {
          success: true,
          shiprocket_order_id: shiprocketResponse.shipment_id,
          awb: shiprocketResponse.awb_code,
          tracking_url: shiprocketResponse.tracking_url,
        };
      }

      return null;
    } catch (error) {
      // Log error but don't fail order activation
      console.error('Error creating automatic Ship Rocket shipment:', error);
      
      await ErrorLogger.logError({
        errorType: 'shiprocket_auto_shipment',
        errorLevel: 'warning',
        errorMessage: error.message,
        errorDetails: error,
        userId: userId,
        orderId: orderId,
        endpoint: '/activateOrder/autoShipment',
      });

      return null; // Return null to not block order activation
    }
  }
}

module.exports = new ShipRocketAutoShip();

