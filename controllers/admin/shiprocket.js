const { pool } = require("../../config/database");
const ShipRocketService = require("../../services/ShipRocketService");
const { ErrorLogger } = require("../../logger");

/**
 * Get Ship Rocket settings
 */
async function getSettings(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value 
       FROM res_options 
       WHERE option_name LIKE 'shiprocket_%'`
    );

    const settings = {};
    rows.forEach(row => {
      const key = row.option_name.replace('shiprocket_', '');
      if (key === 'password') {
        settings[key] = row.option_value ? '***' : null; // Don't expose password
      } else {
        settings[key] = row.option_value;
      }
    });

    res.status(200).json({
      status: 'success',
      data: settings,
    });
  } catch (error) {
    console.error('Error getting Ship Rocket settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get Ship Rocket settings',
    });
  }
}

/**
 * Update Ship Rocket settings
 */
async function updateSettings(req, res) {
  try {
    const { 
      email, 
      password,
      auto_shipment,
      pickup_pincode,
      pickup_address,
      pickup_city,
      pickup_state,
      pickup_name,
      pickup_phone,
      pickup_email,
    } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required',
      });
    }

    // Trim email and password to avoid whitespace issues
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'Email cannot be empty',
      });
    }

    // Update email (always required)
    await pool.execute(
      "INSERT INTO res_options (option_name, option_value) VALUES ('shiprocket_email', ?) ON DUPLICATE KEY UPDATE option_value = ?",
      [trimmedEmail, trimmedEmail]
    );

    // Update password only if provided (not '***' or empty)
    if (password && password !== '***') {
      const trimmedPassword = password.trim();
      if (trimmedPassword) {
        await pool.execute(
          "INSERT INTO res_options (option_name, option_value) VALUES ('shiprocket_password', ?) ON DUPLICATE KEY UPDATE option_value = ?",
          [trimmedPassword, trimmedPassword]
        );
        console.log('[SHIPROCKET] Password saved successfully (length:', trimmedPassword.length + ')');
      } else {
        console.log('[SHIPROCKET] Password was empty after trimming, not saved');
      }
    } else {
      console.log('[SHIPROCKET] Password not provided or is placeholder, keeping existing password');
    }

    // Update auto shipment setting
    if (typeof auto_shipment === 'boolean') {
      await pool.execute(
        "INSERT INTO res_options (option_name, option_value) VALUES ('shiprocket_auto_shipment', ?) ON DUPLICATE KEY UPDATE option_value = ?",
        [auto_shipment ? '1' : '0', auto_shipment ? '1' : '0']
      );
    }

    // Update pickup location settings
    const pickupSettings = {
      pickup_pincode,
      pickup_address,
      pickup_city,
      pickup_state,
      pickup_name,
      pickup_phone,
      pickup_email,
    };

    for (const [key, value] of Object.entries(pickupSettings)) {
      if (value !== undefined && value !== null) {
        await pool.execute(
          `INSERT INTO res_options (option_name, option_value) VALUES ('shiprocket_${key}', ?) ON DUPLICATE KEY UPDATE option_value = ?`,
          [value, value]
        );
      }
    }

    // Clear cached token to force re-authentication
    ShipRocketService.token = null;
    ShipRocketService.tokenExpiry = null;

    res.status(200).json({
      status: 'success',
      message: 'Ship Rocket settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating Ship Rocket settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update Ship Rocket settings',
    });
  }
}

/**
 * Create shipment for an order
 */
async function createShipment(req, res) {
  try {
    const { order_id } = req.params;
    const {
      pickup_pincode,
      pickup_address,
      pickup_city,
      pickup_state,
      pickup_country = 'India',
      pickup_name,
      pickup_phone,
      pickup_email,
      delivery_pincode,
      delivery_address,
      delivery_city,
      delivery_state,
      delivery_country = 'India',
      delivery_name,
      delivery_phone,
      delivery_email,
      weight,
      length,
      width,
      height,
      order_date,
    } = req.body;

    // Validate required fields
    if (!order_id || !pickup_pincode || !delivery_pincode || !delivery_name || !delivery_phone || !delivery_address) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields for shipment creation',
      });
    }

    // Fetch order details
    const [orders] = await pool.execute(
      "SELECT * FROM res_orders WHERE order_id = ?",
      [order_id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    const order = orders[0];

    // Check if shipment already exists
    if (order.shiprocket_order_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Shipment already created for this order',
        data: {
          shiprocket_order_id: order.shiprocket_order_id,
          shiprocket_awb: order.shiprocket_awb,
        },
      });
    }

    // Fetch order items (physical products only)
    const [orderItems] = await pool.execute(
      `SELECT oi.*, p.product_name, p.weight, p.length, p.width, p.height 
       FROM res_order_items oi 
       LEFT JOIN res_products p ON oi.item_id = p.product_id AND oi.item_type = 6
       WHERE oi.order_id = ? AND oi.item_type = 6`,
      [order_id]
    );

    if (orderItems.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No physical products found in this order',
      });
    }

    // Get shipping address from order or user's default address
    let orderShippingAddress = null;
    try {
      if (order.shipping_address) {
        orderShippingAddress = typeof order.shipping_address === 'string' 
          ? JSON.parse(order.shipping_address) 
          : order.shipping_address;
      }
    } catch (parseError) {
      console.error('Error parsing order shipping address:', parseError);
    }

    // If delivery details not provided, use from order or fetch user address
    let finalDeliveryName = delivery_name;
    let finalDeliveryEmail = delivery_email;
    let finalDeliveryPhone = delivery_phone;
    let finalDeliveryAddress = delivery_address;
    let finalDeliveryCity = delivery_city;
    let finalDeliveryState = delivery_state;
    let finalDeliveryPincode = delivery_pincode;
    let finalDeliveryCountry = delivery_country;

    if (orderShippingAddress) {
      finalDeliveryName = finalDeliveryName || orderShippingAddress.name || '';
      finalDeliveryEmail = finalDeliveryEmail || orderShippingAddress.email || '';
      finalDeliveryPhone = finalDeliveryPhone || orderShippingAddress.phone || '';
      finalDeliveryAddress = finalDeliveryAddress || orderShippingAddress.address || '';
      finalDeliveryCity = finalDeliveryCity || orderShippingAddress.city || '';
      finalDeliveryState = finalDeliveryState || orderShippingAddress.state || '';
      finalDeliveryPincode = finalDeliveryPincode || orderShippingAddress.zipCode || orderShippingAddress.zip_code || '';
      finalDeliveryCountry = finalDeliveryCountry || orderShippingAddress.country || 'India';
    }

    // Fallback: fetch user details if still missing
    if (!finalDeliveryName || !finalDeliveryAddress) {
      const [users] = await pool.execute(
        "SELECT first_name, last_name, email, phone, dial_code FROM res_users WHERE user_id = ?",
        [order.user_id]
      );

      const user = users[0] || {};
      finalDeliveryName = finalDeliveryName || `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User #${order.user_id}`;
      finalDeliveryEmail = finalDeliveryEmail || user.email || '';
      finalDeliveryPhone = finalDeliveryPhone || `${user.dial_code || ''}${user.phone || ''}`.trim() || '';
      
      // If still no address, try to get from user's default address
      if (!finalDeliveryAddress) {
        const [addresses] = await pool.execute(
          `SELECT rua.*, 
           (SELECT s.name FROM states s WHERE s.iso2 = rua.state_code COLLATE utf8mb4_general_ci LIMIT 1) AS state_name,
           (SELECT c.name FROM countries c WHERE c.iso2 = rua.country_code COLLATE utf8mb4_general_ci LIMIT 1) AS country_name
           FROM res_user_addresses rua
           WHERE rua.user_id = ? AND rua.is_default = 1
           ORDER BY rua.address_id DESC
           LIMIT 1`,
          [order.user_id]
        );
        
        if (addresses.length > 0) {
          const userAddress = addresses[0];
          finalDeliveryName = finalDeliveryName || userAddress.name || finalDeliveryName;
          finalDeliveryPhone = finalDeliveryPhone || userAddress.phone || finalDeliveryPhone;
          finalDeliveryAddress = finalDeliveryAddress || userAddress.address || '';
          finalDeliveryCity = finalDeliveryCity || userAddress.city || '';
          finalDeliveryState = finalDeliveryState || userAddress.state_name || userAddress.state_code || '';
          finalDeliveryPincode = finalDeliveryPincode || userAddress.zip_code || '';
          finalDeliveryCountry = finalDeliveryCountry || userAddress.country_name || userAddress.country_code || 'India';
        }
      }
    }

    const customerName = finalDeliveryName;
    const customerEmail = finalDeliveryEmail;
    const customerPhone = finalDeliveryPhone;

    // Prepare order items for Ship Rocket
    const order_items = orderItems.map(item => ({
      name: item.product_name || 'Product',
      sku: item.product_id.toString(),
      units: item.quantity || 1,
      selling_price: parseFloat(item.sale_price || 0),
      weight: parseFloat(item.weight || weight || 0.5), // Default 0.5 kg if not provided
      length: parseFloat(item.length || length || 10),
      width: parseFloat(item.width || width || 10),
      height: parseFloat(item.height || height || 10),
    }));

    // Calculate total weight and dimensions
    const totalWeight = order_items.reduce((sum, item) => sum + (item.weight * item.units), 0) || weight || 0.5;
    const totalLength = Math.max(...order_items.map(item => item.length), length || 10);
    const totalWidth = Math.max(...order_items.map(item => item.width), width || 10);
    const totalHeight = order_items.reduce((sum, item) => sum + (item.height * item.units), 0) || height || 10;

    // Prepare shipment data for Ship Rocket
    const shipmentData = {
      order_id: `ORDER_${order_id}_${Date.now()}`, // Unique order ID for Ship Rocket
      order_date: order_date || new Date(order.created_at || new Date()).toISOString().split('T')[0],
      pickup_location: 'Primary', // Default pickup location, can be configured
      billing_customer_name: customerName,
      billing_last_name: '',
      billing_address: finalDeliveryAddress,
      billing_address_2: orderShippingAddress?.landmark || orderShippingAddress?.locality || '',
      billing_city: finalDeliveryCity,
      billing_pincode: finalDeliveryPincode,
      billing_state: finalDeliveryState,
      billing_country: finalDeliveryCountry,
      billing_email: customerEmail,
      billing_phone: customerPhone,
      billing_alternate_phone: orderShippingAddress?.alternate_phone || '',
      shipping_is_billing: true, // Use billing address for shipping
      shipping_customer_name: customerName,
      shipping_last_name: '',
      shipping_address: finalDeliveryAddress,
      shipping_address_2: orderShippingAddress?.landmark || orderShippingAddress?.locality || '',
      shipping_city: finalDeliveryCity,
      shipping_pincode: finalDeliveryPincode,
      shipping_state: finalDeliveryState,
      shipping_country: finalDeliveryCountry,
      shipping_email: customerEmail,
      shipping_phone: customerPhone,
      order_items: order_items,
      payment_method: 'Prepaid', // Assuming prepaid for paid orders
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
          order_id,
        ]
      );

      // Update order status to "Shipped" if shipment created successfully
      if (shiprocketResponse.status !== 'CANCELLED') {
        await pool.execute(
          "UPDATE res_orders SET order_status = 4 WHERE order_id = ?",
          [order_id]
        );
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Shipment created successfully',
      data: {
        shiprocket_response: shiprocketResponse,
        order_id: order_id,
      },
    });
  } catch (error) {
    console.error('Error creating Ship Rocket shipment:', error);
    
    await ErrorLogger.logError({
      errorType: 'shiprocket',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      endpoint: '/admin/shiprocket/shipment/:order_id',
    });

    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create shipment',
    });
  }
}

/**
 * Generate shipping label for an order
 */
async function generateLabel(req, res) {
  try {
    const { order_id } = req.params;

    const [orders] = await pool.execute(
      "SELECT shiprocket_order_id FROM res_orders WHERE order_id = ?",
      [order_id]
    );

    if (orders.length === 0 || !orders[0].shiprocket_order_id) {
      return res.status(404).json({
        status: 'error',
        message: 'Shipment not found for this order',
      });
    }

    const labelResponse = await ShipRocketService.generateLabel(orders[0].shiprocket_order_id);

    // Update order with label URL
    if (labelResponse && labelResponse.label_url) {
      await pool.execute(
        "UPDATE res_orders SET shiprocket_label_url = ? WHERE order_id = ?",
        [labelResponse.label_url, order_id]
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Label generated successfully',
      data: labelResponse,
    });
  } catch (error) {
    console.error('Error generating label:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate label',
    });
  }
}

/**
 * Request pickup for an order
 */
async function requestPickup(req, res) {
  try {
    const { order_id } = req.params;

    const [orders] = await pool.execute(
      "SELECT shiprocket_order_id FROM res_orders WHERE order_id = ?",
      [order_id]
    );

    if (orders.length === 0 || !orders[0].shiprocket_order_id) {
      return res.status(404).json({
        status: 'error',
        message: 'Shipment not found for this order',
      });
    }

    const pickupResponse = await ShipRocketService.requestPickup(orders[0].shiprocket_order_id);

    // Update order with pickup status
    if (pickupResponse && pickupResponse.status) {
      await pool.execute(
        "UPDATE res_orders SET shiprocket_pickup_status = ? WHERE order_id = ?",
        [pickupResponse.status, order_id]
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Pickup requested successfully',
      data: pickupResponse,
    });
  } catch (error) {
    console.error('Error requesting pickup:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to request pickup',
    });
  }
}

/**
 * Track shipment for an order
 */
async function trackShipment(req, res) {
  try {
    const { order_id } = req.params;

    const [orders] = await pool.execute(
      "SELECT shiprocket_awb, shiprocket_order_id FROM res_orders WHERE order_id = ?",
      [order_id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    const order = orders[0];
    const trackingId = order.shiprocket_awb || order.shiprocket_order_id;

    if (!trackingId) {
      return res.status(400).json({
        status: 'error',
        message: 'No AWB or shipment ID found for this order',
      });
    }

    const trackingResponse = await ShipRocketService.trackShipment(trackingId);

    // Update order with latest tracking info
    if (trackingResponse && trackingResponse.tracking_data) {
      const trackingData = trackingResponse.tracking_data;
      await pool.execute(
        `UPDATE res_orders 
         SET shiprocket_status = ?,
             shiprocket_tracking_url = ?
         WHERE order_id = ?`,
        [
          trackingData.shipment_status || order.shiprocket_status,
          trackingData.tracking_url || order.shiprocket_tracking_url,
          order_id,
        ]
      );

      // Update order status based on Ship Rocket status
      if (trackingData.shipment_status === 'Delivered') {
        await pool.execute(
          "UPDATE res_orders SET order_status = 6, shiprocket_delivered_at = NOW() WHERE order_id = ?",
          [order_id]
        );
      } else if (trackingData.shipment_status === 'In Transit' || trackingData.shipment_status === 'Out for Delivery') {
        await pool.execute(
          "UPDATE res_orders SET order_status = 5, shiprocket_shipped_at = NOW() WHERE order_id = ?",
          [order_id]
        );
      }
    }

    res.status(200).json({
      status: 'success',
      data: trackingResponse,
    });
  } catch (error) {
    console.error('Error tracking shipment:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to track shipment',
    });
  }
}

/**
 * Get shipping rates
 */
async function getShippingRates(req, res) {
  try {
    const {
      pickup_pincode,
      delivery_pincode,
      weight = 0.5,
      length = 10,
      width = 10,
      height = 10,
      cod_amount = 0,
    } = req.body;

    if (!pickup_pincode || !delivery_pincode) {
      return res.status(400).json({
        status: 'error',
        message: 'pickup_pincode and delivery_pincode are required',
      });
    }

    const rates = await ShipRocketService.getShippingRates({
      pickup_pincode: pickup_pincode.toString(),
      delivery_pincode: delivery_pincode.toString(),
      weight: parseFloat(weight),
      length: parseFloat(length),
      width: parseFloat(width),
      height: parseFloat(height),
      cod: cod_amount > 0 ? 1 : 0,
      cod_amount: parseFloat(cod_amount),
    });

    res.status(200).json({
      status: 'success',
      data: rates,
    });
  } catch (error) {
    console.error('Error getting shipping rates:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get shipping rates',
    });
  }
}

/**
 * Cancel shipment
 */
async function cancelShipment(req, res) {
  try {
    const { order_id } = req.params;

    const [orders] = await pool.execute(
      "SELECT shiprocket_awb FROM res_orders WHERE order_id = ?",
      [order_id]
    );

    if (orders.length === 0 || !orders[0].shiprocket_awb) {
      return res.status(404).json({
        status: 'error',
        message: 'AWB not found for this order',
      });
    }

    const cancelResponse = await ShipRocketService.cancelShipment(orders[0].shiprocket_awb);

    // Update order status
    if (cancelResponse && cancelResponse.status) {
      await pool.execute(
        `UPDATE res_orders 
         SET shiprocket_status = ?,
             order_status = 8
         WHERE order_id = ?`,
        ['CANCELLED', order_id]
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Shipment cancelled successfully',
      data: cancelResponse,
    });
  } catch (error) {
    console.error('Error cancelling shipment:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to cancel shipment',
    });
  }
}

/**
 * Test Ship Rocket connection
 */
async function testConnection(req, res) {
  try {
    await ShipRocketService.authenticate();

    const isTestMode = ShipRocketService.isTestMode();
    const baseURL = ShipRocketService.getBaseURL();

    res.status(200).json({
      status: 'success',
      message: 'Ship Rocket connection successful',
      data: {
        baseURL,
        testMode: isTestMode,
        warning: isTestMode 
          ? 'Test mode is enabled - All API calls will use production Ship Rocket API. Use with caution.' 
          : 'Production mode - All API calls will create real shipments.',
        note: 'Ship Rocket does not provide a dedicated sandbox environment. Test mode logs requests but uses production API.'
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to connect to Ship Rocket',
      data: {
        baseURL: ShipRocketService.getBaseURL(),
        testMode: ShipRocketService.isTestMode(),
      },
    });
  }
}

/**
 * GET /admin/shiprocket/shipments
 * Get list of all shipments (orders with Ship Rocket data)
 */
async function getShipments(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || ''; // Filter by Ship Rocket status

    // Check if Ship Rocket columns exist by querying INFORMATION_SCHEMA
    let shipRocketColumnsExist = false;
    let columnNames = [];
    
    try {
      const [columns] = await pool.execute(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'res_orders' 
         AND COLUMN_NAME LIKE 'shiprocket_%'`
      );
      
      columnNames = columns.map(col => col.COLUMN_NAME);
      shipRocketColumnsExist = columnNames.length > 0;
      
      // If no Ship Rocket columns exist, return empty result
      if (!shipRocketColumnsExist) {
        return res.status(200).json({
          status: 'success',
          response: {
            data: [],
            totalCount: 0,
            totalPages: 0,
            currentPage: page,
          },
        });
      }
    } catch (checkError) {
      console.error('Error checking Ship Rocket columns:', checkError);
      // If we can't check, assume columns don't exist and return empty
      return res.status(200).json({
        status: 'success',
        response: {
          data: [],
          totalCount: 0,
          totalPages: 0,
          currentPage: page,
        },
      });
    }

    // Build WHERE clause - filter for orders with Ship Rocket data
    const whereClauses = ['(o.shiprocket_order_id IS NOT NULL OR o.shiprocket_awb IS NOT NULL)'];
    const queryParams = [];

    // Search filter
    if (search) {
      const searchConditions = [
        'o.order_id LIKE ?',
        'CAST(o.order_id AS CHAR) LIKE ?',
        'u.username LIKE ?',
        'u.email LIKE ?',
        'u.phone LIKE ?'
      ];
      
      if (columnNames.includes('shiprocket_order_id')) {
        searchConditions.push('o.shiprocket_order_id LIKE ?');
      }
      if (columnNames.includes('shiprocket_awb')) {
        searchConditions.push('o.shiprocket_awb LIKE ?');
      }
      
      whereClauses.push(`(${searchConditions.join(' OR ')})`);
      const searchParam = `%${search}%`;
      const searchParamsCount = searchConditions.length;
      for (let i = 0; i < searchParamsCount; i++) {
        queryParams.push(searchParam);
      }
    }

    // Status filter
    if (status && columnNames.includes('shiprocket_status')) {
      whereClauses.push('o.shiprocket_status = ?');
      queryParams.push(status);
    }

    const whereSQL = whereClauses.join(' AND ');

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total 
       FROM res_orders AS o
       LEFT JOIN res_users AS u ON o.user_id = u.user_id
       WHERE ${whereSQL}`,
      queryParams
    );

    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Build SELECT fields - include all Ship Rocket columns that exist
    const selectFields = [
      'o.order_id',
      'o.created_at',
      'o.amount_due',
      'o.total_amount',
      'o.currency',
      'u.user_id',
      'u.username',
      'u.email',
      'u.first_name',
      'u.last_name',
      'u.phone'
    ];
    
    // Add Ship Rocket fields that exist
    const shipRocketFieldMap = {
      'shiprocket_order_id': 'shiprocket_order_id',
      'shiprocket_shipment_id': 'shiprocket_shipment_id',
      'shiprocket_awb': 'shiprocket_awb',
      'shiprocket_courier_id': 'shiprocket_courier_id',
      'shiprocket_courier_name': 'shiprocket_courier_name',
      'shiprocket_tracking_url': 'shiprocket_tracking_url',
      'shiprocket_status': 'shiprocket_status',
      'shiprocket_label_url': 'shiprocket_label_url',
      'shiprocket_manifest_url': 'shiprocket_manifest_url',
      'shiprocket_pickup_scheduled_date': 'shiprocket_pickup_scheduled_date',
      'shiprocket_created_at': 'shiprocket_created_at',
      'shiprocket_updated_at': 'shiprocket_updated_at'
    };
    
    for (const [fieldName, columnName] of Object.entries(shipRocketFieldMap)) {
      if (columnNames.includes(columnName)) {
        selectFields.push(`o.${columnName}`);
      }
    }

    // Determine ORDER BY clause
    const orderBy = columnNames.includes('shiprocket_created_at')
      ? 'ORDER BY o.shiprocket_created_at DESC, o.created_at DESC'
      : 'ORDER BY o.created_at DESC';

    // Get shipments with pagination
    const [shipments] = await pool.execute(
      `SELECT ${selectFields.join(', ')}
       FROM res_orders AS o
       LEFT JOIN res_users AS u ON o.user_id = u.user_id
       WHERE ${whereSQL}
       ${orderBy}
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.status(200).json({
      status: 'success',
      response: {
        data: shipments,
        totalCount,
        totalPages,
        currentPage: page,
      },
    });
  } catch (error) {
    console.error('Error getting shipments:', error);
    ErrorLogger.error('Error getting shipments:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get shipments',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

/**
 * GET /admin/shiprocket/shipment/:order_id
 * Get shipment details for a specific order
 */
async function getShipmentDetails(req, res) {
  try {
    const { order_id } = req.params;

    const [orders] = await pool.execute(
      `SELECT 
        o.*,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.phone
      FROM res_orders AS o
      LEFT JOIN res_users AS u ON o.user_id = u.user_id
      WHERE o.order_id = ?`,
      [order_id]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    res.status(200).json({
      status: 'success',
      response: orders[0],
    });
  } catch (error) {
    console.error('Error getting shipment details:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get shipment details',
    });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  createShipment,
  generateLabel,
  requestPickup,
  trackShipment,
  getShippingRates,
  cancelShipment,
  testConnection,
  getShipments,
  getShipmentDetails,
};

