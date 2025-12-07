const axios = require('axios');
require('dotenv').config();
const { pool } = require('../../config/database');

/**
 * Get first active bot token from database
 * @param {number} botId - Optional bot configuration ID
 * @returns {Promise<string|null>} Bot token or null
 */
async function getBotToken(botId = null) {
  try {
    let query, params;
    
    if (botId) {
      query = `SELECT bot_token FROM telegram_bot_configurations WHERE id = ? AND is_active = 1 LIMIT 1`;
      params = [botId];
    } else {
      query = `SELECT bot_token FROM telegram_bot_configurations WHERE is_active = 1 LIMIT 1`;
      params = [];
    }
    
    const [bots] = await pool.execute(query, params);
    
    if (bots.length === 0) {
      return null;
    }
    
    return bots[0].bot_token;
  } catch (error) {
    console.error('Error fetching bot token from database:', error);
    return null;
  }
}

/**
 * Get chat ID from bot updates
 * Note: Users must send /start message to the bot first
 * @param {number} botId - Optional bot configuration ID (uses first active bot if not provided)
 * @returns {Promise<string|null>} Chat ID or null if no chats found
 */
async function getChannelId(botId = null) {
  try {
    const botToken = await getBotToken(botId);
    
    if (!botToken) {
      throw new Error('No active bot found in database. Please configure a bot first.');
    }
    
    const API_URL = `https://api.telegram.org/bot${botToken}`;
    const res = await axios.get(`${API_URL}/getUpdates`);
    const updates = res.data.result;

    if (!updates || updates.length === 0) {
      return null;
    }

    // First, try to find a channel
    for (const update of updates) {
      if (update.message && update.message.chat && update.message.chat.id) {
        const chat = update.message.chat;
        if (chat.type === 'channel') {
          return chat.id;
        }
      }
    }

    // If no channel, return the first chat ID found (private chat or group)
    for (const update of updates) {
      if (update.message && update.message.chat && update.message.chat.id) {
        return update.message.chat.id;
      }
    }

    return null;
  } catch (err) {
    console.error('Error fetching updates:', err.message);
    throw err;
  }
}

/**
 * List all available chats that have sent messages to the bot
 * Note: Users must send /start message to the bot first
 * @param {number} botId - Optional bot configuration ID (uses first active bot if not provided)
 * @returns {Promise<Array>} Array of chat objects
 */
async function listChats(botId = null) {
  try {
    const botToken = await getBotToken(botId);
    
    if (!botToken) {
      throw new Error('No active bot found in database. Please configure a bot first.');
    }
    
    const API_URL = `https://api.telegram.org/bot${botToken}`;
    const res = await axios.get(`${API_URL}/getUpdates`);
    const updates = res.data.result;

    if (!updates || updates.length === 0) {
      return [];
    }

    const chats = [];
    const seenChats = new Set();

    for (const update of updates) {
      if (update.message && update.message.chat) {
        const chat = update.message.chat;
        const chatId = chat.id;
        
        if (!seenChats.has(chatId)) {
          seenChats.add(chatId);
          chats.push({
            id: chatId,
            type: chat.type,
            title: chat.title || chat.first_name || chat.username || 'Unknown',
            username: chat.username || null
          });
        }
      }
    }

    return chats;
  } catch (err) {
    console.error('Error listing chats:', err.message);
    throw err;
  }
}

/**
 * Send a message to a specific chat/channel
 * Note: Users must send /start message to the bot first for personal chats
 * @param {string|number} chatId - The chat ID to send message to
 * @param {string} text - The message text to send
 * @param {number} botId - Optional bot configuration ID (uses first active bot if not provided)
 * @returns {Promise<Object>} Telegram API response
 */
async function sendMessage(chatId, text, botId = null) {
  try {
    if (!chatId || !text) {
      throw new Error('chatId and text are required');
    }

    const botToken = await getBotToken(botId);
    
    if (!botToken) {
      throw new Error('No active bot found in database. Please configure a bot first.');
    }
    
    const API_URL = `https://api.telegram.org/bot${botToken}`;
    const res = await axios.post(`${API_URL}/sendMessage`, {
      chat_id: chatId,
      text: text,
    });

    return res.data;
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Send message to all bots subscribed to a specific module
 * Uses the new module subscription system (telegram_bot_module_subscriptions)
 * @param {string} moduleKey - Module key (e.g., 'order_pending', 'contact_us_enquiry')
 * @param {string} messageText - Message text to send
 * @param {string|number} chatId - Optional chat ID (overrides bot's default chat_id)
 * @returns {Promise<Object>} Result with success status and details
 */
async function sendMessageByModuleKey(moduleKey, messageText, chatId = null) {
  try {
    if (!moduleKey || !messageText) {
      return {
        success: false,
        error: 'moduleKey and messageText are required'
      };
    }

    // Find module by module_key
    const [modules] = await pool.execute(
      `SELECT id, module_key, module_name, category 
       FROM telegram_modules 
       WHERE module_key = ? AND is_active = 1`,
      [moduleKey]
    );

    if (modules.length === 0) {
      return {
        success: false,
        error: `Module '${moduleKey}' not found or is inactive`
      };
    }

    const module = modules[0];

    // Find all active bots subscribed to this module
    const [bots] = await pool.execute(
      `SELECT 
        tbc.id,
        tbc.bot_token,
        tbc.bot_name,
        tbc.chat_id,
        tbc.is_active
       FROM telegram_bot_configurations tbc
       INNER JOIN telegram_bot_module_subscriptions tbms ON tbc.id = tbms.bot_config_id
       WHERE tbms.module_id = ?
       AND tbc.is_active = 1
       AND tbms.is_active = 1`,
      [module.id]
    );

    if (bots.length === 0) {
      return {
        success: false,
        error: `No active bots subscribed to module '${moduleKey}'`,
        module: module.module_name,
        sent_count: 0,
        total_bots: 0
      };
    }

    // Send message to all subscribed bots
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const bot of bots) {
      // Use provided chatId or fallback to bot's chat_id
      const targetChatId = chatId || bot.chat_id;

      if (!targetChatId) {
        results.push({
          bot_id: bot.id,
          bot_name: bot.bot_name,
          success: false,
          error: `chatId not set for bot ${bot.id}. Please configure chat_id in settings.`
        });
        failCount++;
        continue;
      }

      // Send message via Telegram API
      const API_URL = `https://api.telegram.org/bot${bot.bot_token}`;

      try {
        const response = await axios.post(`${API_URL}/sendMessage`, {
          chat_id: targetChatId,
          text: messageText
        });

        if (response.data.ok) {
          results.push({
            bot_id: bot.id,
            bot_name: bot.bot_name,
            chat_id: targetChatId,
            success: true,
            message_id: response.data.result.message_id,
            chat: response.data.result.chat
          });
          successCount++;
        } else {
          results.push({
            bot_id: bot.id,
            bot_name: bot.bot_name,
            success: false,
            error: 'Failed to send message',
            details: response.data
          });
          failCount++;
        }
      } catch (apiError) {
        console.error(`Error sending Telegram message to bot ${bot.id} for module ${moduleKey}:`, apiError.response?.data || apiError.message);
        
        results.push({
          bot_id: bot.id,
          bot_name: bot.bot_name,
          success: false,
          error: apiError.response?.data?.description || 'Failed to send message',
          details: apiError.response?.data || { message: apiError.message }
        });
        failCount++;
      }
    }

    // Return summary
    return {
      success: successCount > 0,
      module_key: moduleKey,
      module_name: module.module_name,
      category: module.category,
      total_bots: bots.length,
      sent_count: successCount,
      failed_count: failCount,
      results: results,
      message: successCount === bots.length 
        ? `Message sent to all ${successCount} bot(s) subscribed to ${module.module_name}` 
        : `Message sent to ${successCount} of ${bots.length} bot(s) subscribed to ${module.module_name}`
    };
  } catch (error) {
    console.error(`Error in sendMessageByModuleKey for ${moduleKey}:`, error);
    return {
      success: false,
      error: 'Internal server error',
      details: error.message,
      sent_count: 0,
      total_bots: 0
    };
  }
}

/**
 * Helper function to fetch complete order details including items and customer info
 */
async function fetchOrderDetails(orderId, userId) {
  const { pool } = require('../../config/database');
  
  // Fetch order
  const [orders] = await pool.execute(
    `SELECT * FROM res_orders WHERE order_id = ?`,
    [orderId]
  );
  
  if (!orders.length) return null;
  
  const order = orders[0];
  
  // Fetch customer details
  const [users] = await pool.execute(
    `SELECT user_id, username, email, first_name, last_name, phone, dial_code, country, city, state, address
     FROM res_users WHERE user_id = ?`,
    [userId || order.user_id]
  );
  
  const user = users[0] || {};
  
  // Parse item types
  let itemTypes = [];
  try {
    itemTypes = JSON.parse(order.item_types || '[]');
  } catch (e) {
    itemTypes = [];
  }
  
  // Fetch items based on type
  const items = [];
  
  // Files (type 1)
  if (itemTypes.includes(1)) {
    const [files] = await pool.execute(
      `SELECT rf.title, rf.size, uf.price
       FROM res_files rf
       JOIN res_ufiles uf ON rf.file_id = uf.file_id
       WHERE uf.order_id = ?`,
      [orderId]
    );
    files.forEach(f => items.push({ type: 'File', name: f.title, price: f.price }));
  }
  
  // Packages (type 2)
  if (itemTypes.includes(2)) {
    const [packages] = await pool.execute(
      `SELECT package_title, package_object FROM res_upackages WHERE order_id = ?`,
      [orderId]
    );
    packages.forEach(p => {
      try {
        const pkg = JSON.parse(p.package_object || '{}');
        items.push({ type: 'Package', name: p.package_title || pkg.title || 'Package', price: order.total_amount });
      } catch (e) {
        items.push({ type: 'Package', name: p.package_title || 'Package', price: order.total_amount });
      }
    });
  }
  
  // Products (type 3)
  if (itemTypes.includes(3)) {
    const [products] = await pool.execute(
      `SELECT rp.product_name, up.quantity, rp.sale_price
       FROM res_uproducts up
       JOIN res_products rp ON up.product_id = rp.product_id
       WHERE up.order_id = ?`,
      [orderId]
    );
    products.forEach(p => items.push({ type: 'Product', name: p.product_name, quantity: p.quantity, price: p.sale_price }));
  }
  
  // Courses (type 4)
  if (itemTypes.includes(4)) {
    const [courses] = await pool.execute(
      `SELECT rp.title, rp.sale_price
       FROM res_ucourses up
       JOIN res_courses rp ON up.course_id = rp.course_id
       WHERE up.order_id = ?`,
      [orderId]
    );
    courses.forEach(c => items.push({ type: 'Course', name: c.title, price: c.sale_price }));
  }
  
  // Fetch payment/transaction details
  let paymentInfo = null;
  if (order.transaction_id) {
    const [transactions] = await pool.execute(
      `SELECT payment_method, gateway_txn_id, payment_date FROM res_transactions WHERE transaction_id = ?`,
      [order.transaction_id]
    );
    if (transactions.length) {
      paymentInfo = transactions[0];
    }
  }
  
  return { order, user, items, paymentInfo, itemTypes };
}

/**
 * Send order pending notification to subscribed bots with complete details
 * @param {Object} orderData - Order data object (should include order_id)
 * @returns {Promise<Object>} Result
 */
async function notifyOrderPending(orderData) {
  try {
    const orderId = orderData.order_id || orderData.id;
    const userId = orderData.user_id;
    
    // Try to fetch complete order details
    let details = null;
    if (orderId) {
      try {
        details = await fetchOrderDetails(orderId, userId);
      } catch (err) {
        console.error('Error fetching order details for notification:', err);
      }
    }
    
    // Build customer info
    const customerName = details?.user?.first_name || details?.user?.username || orderData.customer_name || orderData.user_name || 'N/A';
    const customerEmail = details?.user?.email || 'N/A';
    const customerPhone = details?.user?.dial_code ? `+${details.user.dial_code} ` : '';
    const customerPhoneFull = customerPhone + (details?.user?.phone || 'N/A');
    const customerAddress = details?.user?.address || 'N/A';
    const customerCity = details?.user?.city ? `, ${details.user.city}` : '';
    const customerState = details?.user?.state ? `, ${details.user.state}` : '';
    const customerCountry = details?.user?.country ? `, ${details.user.country}` : '';
    const customerLocation = `${customerAddress}${customerCity}${customerState}${customerCountry}`;
    
    // Build items list
    let itemsText = '';
    if (details?.items && details.items.length > 0) {
      itemsText = '\n\n📋 Items Purchased:\n';
      details.items.forEach((item, index) => {
        itemsText += `${index + 1}. ${item.type}: ${item.name}`;
        if (item.quantity) itemsText += ` (Qty: ${item.quantity})`;
        if (item.price) itemsText += ` - ${item.price} ${details.order.currency || ''}`;
        itemsText += '\n';
      });
    } else {
      itemsText = `\nItems: ${orderData.items_count || details?.items?.length || 'N/A'}`;
    }
    
    // Build payment info
    let paymentText = '';
    if (details?.paymentInfo) {
      const { PAYMENT_METHOD } = require('../utils/constants');
      const paymentMethod = PAYMENT_METHOD[details.paymentInfo.payment_method] || `Method ${details.paymentInfo.payment_method}`;
      paymentText = `\n💳 Payment Method: ${paymentMethod}`;
      if (details.paymentInfo.gateway_txn_id) {
        paymentText += `\nTransaction ID: ${details.paymentInfo.gateway_txn_id}`;
      }
    } else {
      const { PAYMENT_METHOD } = require('../utils/constants');
      const paymentMethod = orderData.payment_method ? (PAYMENT_METHOD[orderData.payment_method] || `Method ${orderData.payment_method}`) : 'N/A';
      paymentText = `\n💳 Payment Method: ${paymentMethod}`;
    }
    
    const message = `📦 Pending Order!\n\n` +
      `Order ID: #${orderId || 'N/A'}\n` +
      `\n👤 Customer Information:\n` +
      `Name: ${customerName}\n` +
      `Email: ${customerEmail}\n` +
      `Phone: ${customerPhoneFull}\n` +
      `Location: ${customerLocation}\n` +
      `\n💰 Order Details:\n` +
      `Amount: ${details?.order?.total_amount || orderData.total_amount || orderData.amount || '0'} ${details?.order?.currency || orderData.currency || ''}\n` +
      `Subtotal: ${details?.order?.subtotal || orderData.subtotal || details?.order?.total_amount || '0'} ${details?.order?.currency || orderData.currency || ''}\n` +
      `${details?.order?.tax ? `Tax: ${details.order.tax} ${details.order.currency || ''}\n` : ''}` +
      `${details?.order?.discount ? `Discount: ${details.order.discount} ${details.order.currency || ''}\n` : ''}` +
      `${paymentText}` +
      `${itemsText}` +
      `\nStatus: Pending\n` +
      `Time: ${details?.order?.created_at ? new Date(details.order.created_at).toLocaleString() : new Date().toLocaleString()}`;

    return await sendMessageByModuleKey('order_pending', message);
  } catch (error) {
    console.error('Error in notifyOrderPending:', error);
    // Fallback to simple message
    const message = `📦 Pending Order!\n\n` +
      `Order ID: ${orderData.order_id || orderData.id || 'N/A'}\n` +
      `Customer: ${orderData.customer_name || orderData.user_name || 'N/A'}\n` +
      `Amount: ${orderData.total_amount || orderData.amount || '0'} ${orderData.currency || ''}\n` +
      `Items: ${orderData.items_count || 'N/A'}\n` +
      `Status: Pending\n` +
      `Time: ${new Date().toLocaleString()}`;
    return await sendMessageByModuleKey('order_pending', message);
  }
}

/**
 * Send order completed notification to subscribed bots with complete details
 * @param {Object} orderData - Order data object (should include order_id)
 * @returns {Promise<Object>} Result
 */
async function notifyOrderCompleted(orderData) {
  try {
    const orderId = orderData.order_id || orderData.id;
    const userId = orderData.user_id;
    
    // Try to fetch complete order details
    let details = null;
    if (orderId) {
      try {
        details = await fetchOrderDetails(orderId, userId);
      } catch (err) {
        console.error('Error fetching order details for notification:', err);
      }
    }
    
    // Build customer info
    const customerName = details?.user?.first_name || details?.user?.username || orderData.customer_name || orderData.user_name || 'N/A';
    const customerEmail = details?.user?.email || 'N/A';
    const customerPhone = details?.user?.dial_code ? `+${details.user.dial_code} ` : '';
    const customerPhoneFull = customerPhone + (details?.user?.phone || 'N/A');
    const customerAddress = details?.user?.address || 'N/A';
    const customerCity = details?.user?.city ? `, ${details.user.city}` : '';
    const customerState = details?.user?.state ? `, ${details.user.state}` : '';
    const customerCountry = details?.user?.country ? `, ${details.user.country}` : '';
    const customerLocation = `${customerAddress}${customerCity}${customerState}${customerCountry}`;
    
    // Build items list
    let itemsText = '';
    if (details?.items && details.items.length > 0) {
      itemsText = '\n\n📋 Items Purchased:\n';
      details.items.forEach((item, index) => {
        itemsText += `${index + 1}. ${item.type}: ${item.name}`;
        if (item.quantity) itemsText += ` (Qty: ${item.quantity})`;
        if (item.price) itemsText += ` - ${item.price} ${details.order.currency || ''}`;
        itemsText += '\n';
      });
    } else {
      itemsText = `\nItems: ${orderData.items_count || details?.items?.length || 'N/A'}`;
    }
    
    // Build payment info
    let paymentText = '';
    if (details?.paymentInfo) {
      const { PAYMENT_METHOD } = require('../utils/constants');
      const paymentMethod = PAYMENT_METHOD[details.paymentInfo.payment_method] || `Method ${details.paymentInfo.payment_method}`;
      paymentText = `\n💳 Payment Method: ${paymentMethod}`;
      if (details.paymentInfo.gateway_txn_id) {
        paymentText += `\nTransaction ID: ${details.paymentInfo.gateway_txn_id}`;
      }
      if (details.paymentInfo.payment_date) {
        paymentText += `\nPayment Date: ${new Date(details.paymentInfo.payment_date).toLocaleString()}`;
      }
    } else {
      const { PAYMENT_METHOD } = require('../utils/constants');
      const paymentMethod = orderData.payment_method ? (PAYMENT_METHOD[orderData.payment_method] || `Method ${orderData.payment_method}`) : 'N/A';
      paymentText = `\n💳 Payment Method: ${paymentMethod}`;
    }
    
    const message = `✅ Order Completed!\n\n` +
      `Order ID: #${orderId || 'N/A'}\n` +
      `\n👤 Customer Information:\n` +
      `Name: ${customerName}\n` +
      `Email: ${customerEmail}\n` +
      `Phone: ${customerPhoneFull}\n` +
      `Location: ${customerLocation}\n` +
      `\n💰 Order Details:\n` +
      `Total Amount: ${details?.order?.total_amount || details?.order?.amount_paid || orderData.total_amount || orderData.amount || '0'} ${details?.order?.currency || orderData.currency || ''}\n` +
      `Amount Paid: ${details?.order?.amount_paid || details?.order?.total_amount || orderData.amount || '0'} ${details?.order?.currency || orderData.currency || ''}\n` +
      `${details?.order?.subtotal ? `Subtotal: ${details.order.subtotal} ${details.order.currency || ''}\n` : ''}` +
      `${details?.order?.tax ? `Tax: ${details.order.tax} ${details.order.currency || ''}\n` : ''}` +
      `${details?.order?.discount ? `Discount: ${details.order.discount} ${details.order.currency || ''}\n` : ''}` +
      `${paymentText}` +
      `${itemsText}` +
      `\nStatus: Completed ✅\n` +
      `Time: ${details?.order?.updated_at ? new Date(details.order.updated_at).toLocaleString() : new Date().toLocaleString()}`;

    return await sendMessageByModuleKey('order_completed', message);
  } catch (error) {
    console.error('Error in notifyOrderCompleted:', error);
    // Fallback to simple message
    const message = `✅ Order Completed!\n\n` +
      `Order ID: ${orderData.order_id || orderData.id || 'N/A'}\n` +
      `Customer: ${orderData.customer_name || orderData.user_name || 'N/A'}\n` +
      `Amount: ${orderData.total_amount || orderData.amount || '0'} ${orderData.currency || ''}\n` +
      `Items: ${orderData.items_count || 'N/A'}\n` +
      `Status: Completed\n` +
      `Time: ${new Date().toLocaleString()}`;
    return await sendMessageByModuleKey('order_completed', message);
  }
}

/**
 * Helper function to fetch user details if user_id is provided
 */
async function fetchUserDetailsForNotification(userId) {
  if (!userId) return null;
  
  try {
    const { pool } = require('../../config/database');
    const [users] = await pool.execute(
      `SELECT user_id, username, email, first_name, last_name, phone, dial_code, country, city, state, address, created_at
       FROM res_users WHERE user_id = ?`,
      [userId]
    );
    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error('Error fetching user details for notification:', error);
    return null;
  }
}

/**
 * Send contact us enquiry notification to subscribed bots with complete details
 * @param {Object} enquiryData - Contact enquiry data object
 * @returns {Promise<Object>} Result
 */
async function notifyContactUsEnquiry(enquiryData) {
  try {
    // Fetch user details if user_id is provided
    let userDetails = null;
    if (enquiryData.user_id) {
      userDetails = await fetchUserDetailsForNotification(enquiryData.user_id);
    }
    
    // Build customer info section
    const customerName = enquiryData.name || userDetails?.first_name || userDetails?.username || 'N/A';
    const customerEmail = enquiryData.email || userDetails?.email || 'N/A';
    const customerPhone = enquiryData.phone || (userDetails?.dial_code ? `+${userDetails.dial_code} ` : '') + (userDetails?.phone || '') || 'N/A';
    const customerUsername = userDetails?.username ? `\n👤 Username: ${userDetails.username}` : '';
    const customerLocation = userDetails?.address || userDetails?.city || userDetails?.state || userDetails?.country 
      ? `\n📍 Location: ${[userDetails?.address, userDetails?.city, userDetails?.state, userDetails?.country].filter(Boolean).join(', ')}` 
      : '';
    const isRegisteredUser = userDetails ? `\n✅ Registered User (ID: ${userDetails.user_id})` : '\n👤 Guest User';
    
    // Build message
    const message = `📧 New Contact Us Enquiry!\n\n` +
      `👤 Contact Information:\n` +
      `Name: ${customerName}${customerUsername}${isRegisteredUser}\n` +
      `📧 Email: ${customerEmail}\n` +
      `📱 Phone: ${customerPhone}${customerLocation}\n` +
      `\n📝 Enquiry Details:\n` +
      `Subject: ${enquiryData.subject || 'N/A'}\n` +
      `Message:\n${enquiryData.message || 'N/A'}\n` +
      `\n⏰ Time: ${new Date().toLocaleString()}`;

    return await sendMessageByModuleKey('contact_us_enquiry', message);
  } catch (error) {
    console.error('Error in notifyContactUsEnquiry:', error);
    // Fallback to simple message
    const message = `📧 New Contact Us Enquiry!\n\n` +
      `Name: ${enquiryData.name || 'N/A'}\n` +
      `Email: ${enquiryData.email || 'N/A'}\n` +
      `Phone: ${enquiryData.phone || 'N/A'}\n` +
      `Subject: ${enquiryData.subject || 'N/A'}\n` +
      `Message: ${enquiryData.message || 'N/A'}\n` +
      `Time: ${new Date().toLocaleString()}`;
    return await sendMessageByModuleKey('contact_us_enquiry', message);
  }
}

/**
 * Send file request notification to subscribed bots with complete details
 * @param {Object} requestData - File request data object
 * @returns {Promise<Object>} Result
 */
async function notifyRequestFile(requestData) {
  try {
    // Fetch user details if user_id is provided
    let userDetails = null;
    if (requestData.user_id) {
      userDetails = await fetchUserDetailsForNotification(requestData.user_id);
    }
    
    // Build customer info section
    const customerName = requestData.fullName || requestData.name || userDetails?.first_name || userDetails?.username || 'N/A';
    const customerEmail = requestData.email || userDetails?.email || 'N/A';
    const customerPhone = userDetails?.dial_code ? `+${userDetails.dial_code} ` : '';
    const customerPhoneFull = customerPhone + (userDetails?.phone || 'N/A');
    const customerUsername = userDetails?.username ? `\n👤 Username: ${userDetails.username}` : '';
    const customerLocation = userDetails?.address || userDetails?.city || userDetails?.state || userDetails?.country 
      ? `\n📍 Location: ${[userDetails?.address, userDetails?.city, userDetails?.state, userDetails?.country].filter(Boolean).join(', ')}` 
      : '';
    const isRegisteredUser = userDetails ? `\n✅ Registered User (ID: ${userDetails.user_id})` : '\n👤 Guest User';
    
    // Priority emoji mapping
    const priorityEmoji = {
      'low': '🟢',
      'medium': '🟡',
      'high': '🟠',
      'urgent': '🔴'
    };
    const priorityText = requestData.priority || 'N/A';
    const priorityDisplay = `${priorityEmoji[priorityText.toLowerCase()] || '⚪'} ${priorityText.charAt(0).toUpperCase() + priorityText.slice(1)}`;
    
    // File type emoji mapping
    const fileTypeEmoji = {
      'document': '📄',
      'image': '🖼️',
      'video': '🎥',
      'audio': '🎵',
      'archive': '📦',
      'other': '📎'
    };
    const fileTypeText = requestData.fileType || 'N/A';
    const fileTypeDisplay = `${fileTypeEmoji[fileTypeText.toLowerCase()] || '📎'} ${fileTypeText}`;
    
    // Build message
    const message = `📄 New File Request!\n\n` +
      `👤 Requester Information:\n` +
      `Name: ${customerName}${customerUsername}${isRegisteredUser}\n` +
      `📧 Email: ${customerEmail}\n` +
      `${userDetails ? `📱 Phone: ${customerPhoneFull}${customerLocation}` : ''}\n` +
      `\n📋 Request Details:\n` +
      `File Type: ${fileTypeDisplay}\n` +
      `Priority: ${priorityDisplay}\n` +
      `Purpose: ${requestData.purpose || 'N/A'}\n` +
      `${requestData.additionalInfo ? `\n📝 Additional Information:\n${requestData.additionalInfo}\n` : ''}` +
      `\n⏰ Time: ${new Date().toLocaleString()}`;

    return await sendMessageByModuleKey('request_file', message);
  } catch (error) {
    console.error('Error in notifyRequestFile:', error);
    // Fallback to simple message
    const message = `📄 New File Request!\n\n` +
      `Name: ${requestData.fullName || requestData.name || 'N/A'}\n` +
      `Email: ${requestData.email || 'N/A'}\n` +
      `File Type: ${requestData.fileType || 'N/A'}\n` +
      `Priority: ${requestData.priority || 'N/A'}\n` +
      `Purpose: ${requestData.purpose || 'N/A'}\n` +
      `${requestData.additionalInfo ? `Additional Info: ${requestData.additionalInfo}\n` : ''}` +
      `Time: ${new Date().toLocaleString()}`;
    return await sendMessageByModuleKey('request_file', message);
  }
}

/**
 * Send user signup notification to subscribed bots with complete information
 * Includes all available user information
 * @param {Object} userData - User data object (from database or signup form)
 * @returns {Promise<Object>} Result
 */
async function notifyUserSignup(userData) {
  try {
    // Build comprehensive message with all user info
    const fullName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'N/A';
    const userId = userData.user_id || userData.id || 'N/A';
    const username = userData.username || 'N/A';
    const email = userData.email || 'N/A';
    const phone = userData.dial_code ? `+${userData.dial_code} ` : '';
    const phoneFull = phone + (userData.phone || 'N/A');
    
    // Build location info
    const locationParts = [userData.address, userData.city, userData.state, userData.country].filter(Boolean);
    const location = locationParts.length > 0 ? locationParts.join(', ') : 'N/A';
    
    // Registration type emoji mapping
    const regTypeEmoji = {
      'manual': '📝',
      'google': '🔵',
      'facebook': '🔵',
      'apple': '⚪'
    };
    const regType = userData.register_type || 'manual';
    const regTypeDisplay = `${regTypeEmoji[regType.toLowerCase()] || '📝'} ${regType.charAt(0).toUpperCase() + regType.slice(1)}`;
    
    // Verification status
    const emailVerified = userData.is_email_verified !== undefined 
      ? (userData.is_email_verified ? '✅ Verified' : '❌ Not Verified') 
      : '❓ Unknown';
    const mobileVerified = userData.is_mobile_verified !== undefined 
      ? (userData.is_mobile_verified ? '✅ Verified' : '❌ Not Verified') 
      : '❓ Unknown';
    
    const message = `🎉 New User Signup!\n\n` +
      `🆔 User Information:\n` +
      `User ID: #${userId}\n` +
      `👤 Username: ${username}\n` +
      `📧 Email: ${email}\n` +
      `👨‍👩‍👧 Name: ${fullName}\n` +
      `📱 Phone: ${phoneFull}\n` +
      `\n📍 Location Details:\n` +
      `${location !== 'N/A' ? `📍 Address: ${location}` : '📍 Location: Not provided'}\n` +
      `\n✅ Account Details:\n` +
      `Registration: ${regTypeDisplay}\n` +
      `Email Status: ${emailVerified}\n` +
      `Mobile Status: ${mobileVerified}\n` +
      `${userData.user_type ? `User Type: ${userData.user_type}\n` : ''}` +
      `${userData.ip_address ? `🌐 IP Address: ${userData.ip_address}\n` : ''}` +
      `${userData.country_code ? `🌍 Country Code: ${userData.country_code}\n` : ''}` +
      `\n⏰ Signup Time: ${userData.created_at ? new Date(userData.created_at).toLocaleString() : new Date().toLocaleString()}`;

    return await sendMessageByModuleKey('user_signup', message);
  } catch (error) {
    console.error('Error in notifyUserSignup:', error);
    // Fallback to simple message
    const fullName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'N/A';
    const message = `🎉 New User Signup!\n\n` +
      `User ID: ${userData.user_id || userData.id || 'N/A'}\n` +
      `Username: ${userData.username || 'N/A'}\n` +
      `Email: ${userData.email || 'N/A'}\n` +
      `Name: ${fullName}\n` +
      `Phone: ${userData.dial_code ? `+${userData.dial_code} ` : ''}${userData.phone || 'N/A'}\n` +
      `Time: ${userData.created_at ? new Date(userData.created_at).toLocaleString() : new Date().toLocaleString()}`;
    return await sendMessageByModuleKey('user_signup', message);
  }
}

module.exports = {
  getChannelId,
  sendMessage,
  listChats,
  // New functions for module-based messaging
  sendMessageByModuleKey,
  notifyOrderPending,
  notifyOrderCompleted,
  notifyContactUsEnquiry,
  notifyRequestFile,
  notifyUserSignup,
};
