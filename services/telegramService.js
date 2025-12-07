const axios = require('axios');
const https = require('https');
const { pool } = require('../config/database');
const { addTelegramMessage } = require('./telegramQueue');

/**
 * Telegram Service
 * Handles sending messages to different modules using their configured bots
 * 
 * NOTE: Messages are now sent via a queue system (BullMQ with Redis) to handle
 * high-volume traffic reliably. The queue system provides:
 * - Rate limiting (respects Telegram API limits)
 * - Automatic retries with exponential backoff
 * - Persistent queue (survives server restarts)
 * - Batch processing for efficiency
 */

/**
 * Get active bot configuration for a module (single bot - for backwards compatibility)
 * @param {string} module - Module name (e.g., 'new_user_signup', 'order_details')
 * @returns {Promise<Object|null>} Bot configuration or null
 */
async function getBotConfig(module) {
  try {
    const [configs] = await pool.execute(
      `SELECT * FROM telegram_bot_configurations 
       WHERE module = ? AND is_active = 1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [module]
    );

    return configs.length > 0 ? configs[0] : null;
  } catch (error) {
    console.error(`Error fetching bot config for module ${module}:`, error);
    return null;
  }
}

/**
 * Get ALL active bot configurations for a module
 * Supports multiple bots per module (multiple admins receiving notifications)
 * @param {string} module - Module name (e.g., 'new_user_signup', 'order_details')
 * @returns {Promise<Array>} Array of bot configurations
 */
async function getAllBotConfigs(module) {
  try {
    const [configs] = await pool.execute(
      `SELECT * FROM telegram_bot_configurations 
       WHERE module = ? AND is_active = 1 
       ORDER BY created_at DESC`,
      [module]
    );

    return configs;
  } catch (error) {
    console.error(`Error fetching bot configs for module ${module}:`, error);
    return [];
  }
}

/**
 * Send message using module's configured bot(s)
 * Messages are sent via queue system for reliable delivery in high-traffic scenarios
 * 
 * @param {string} module - Module name
 * @param {string} message - Message text to send
 * @param {string|number} chatId - Optional chat ID (uses each config's default if not provided)
 * @param {Object} options - Optional job options (priority, delay, etc.)
 * @returns {Promise<Object>} Result with job ID and queue status
 */
const TELEGRAM_HTTP_AGENT = new https.Agent({
  keepAlive: true,
  family: 4,
  timeout: 10000,
});

async function sendMessageByModule(module, message, chatId = null, options = {}) {
  try {
    if (!module || !message) {
      return {
        success: false,
        error: 'module and message are required'
      };
    }

    // Validate that bot configuration exists before queuing
    const configs = await getAllBotConfigs(module);
    if (configs.length === 0) {
      return {
        success: false,
        error: `No active bot configuration found for module: ${module}`,
        sent_count: 0,
        total_bots: 0,
        queued: false
      };
    }

    // Add message to queue (processed by worker)
    try {
      const job = await addTelegramMessage(
        {
          module,
          message,
          chatId,
        },
        {
          priority: options.priority || 1,
          delay: options.delay || 0,
          ...options,
        }
      );

      return {
        success: true,
        queued: true,
        job_id: job.id,
        module: module,
        message: 'Message queued successfully. Will be sent shortly.',
        total_bots: configs.length,
      };
    } catch (queueError) {
      console.error(`Error adding message to queue for module ${module}:`, queueError);
      return {
        success: false,
        queued: false,
        error: 'Failed to queue message',
        details: queueError.message,
      };
    }
  } catch (error) {
    console.error(`Error in sendMessageByModule for ${module}:`, error);
    return {
      success: false,
      error: 'Internal server error',
      queued: false,
      sent_count: 0,
      total_bots: 0
    };
  }
}

/**
 * Send message with formatting (HTML)
 * Messages are sent via queue system for reliable delivery
 * 
 * Note: parseMode is stored in job data but currently not processed by worker.
 * For formatted messages, HTML formatting should be included in the message text.
 * 
 * @param {string} module - Module name
 * @param {string} message - Message text (supports HTML)
 * @param {string|number} chatId - Optional chat ID
 * @param {string} parseMode - Parse mode (HTML/Markdown) - stored but not used yet
 * @param {Object} options - Optional job options
 * @returns {Promise<Object>} Result with job ID and queue status
 */
async function sendMessageByModuleFormatted(module, message, chatId = null, parseMode = 'HTML', options = {}) {
  try {
    const config = await getBotConfig(module);

    if (!config) {
      return {
        success: false,
        error: `No active bot configuration found for module: ${module}`,
        queued: false
      };
    }

    // Validate chatId exists
    const targetChatId = chatId || config.chat_id;
    if (!targetChatId) {
      return {
        success: false,
        error: `chatId is required for module ${module}`,
        queued: false
      };
    }

    // Add formatted message to queue
    try {
      const job = await addTelegramMessage(
        {
          module,
          message, // HTML formatting included in message text
          chatId: targetChatId,
          parseMode, // Stored for future enhancement
        },
        {
          priority: options.priority || 1,
          delay: options.delay || 0,
          ...options,
        }
      );

      return {
        success: true,
        queued: true,
        job_id: job.id,
        module: module,
        message: 'Formatted message queued successfully. Will be sent shortly.',
      };
    } catch (queueError) {
      console.error(`Error adding formatted message to queue for module ${module}:`, queueError);
      return {
        success: false,
        queued: false,
        error: 'Failed to queue formatted message',
        details: queueError.message,
      };
    }
  } catch (error) {
    console.error(`Error in sendMessageByModuleFormatted for ${module}:`, error);
    return {
      success: false,
      error: error.response?.data?.description || 'Failed to queue message',
      queued: false
    };
  }
}

/**
 * Helper: Send new user signup notification
 * @param {Object} userData - User data object
 * @returns {Promise<Object>} Result
 */
async function notifyNewUserSignup(userData) {
  const message = `🎉 New User Signup!\n\n` +
    `Name: ${userData.name || userData.username || 'N/A'}\n` +
    `Email: ${userData.email || 'N/A'}\n` +
    `Phone: ${userData.phone || 'N/A'}\n` +
    `Time: ${new Date().toLocaleString()}`;

  return await sendMessageByModule('new_user_signup', message);
}

/**
 * Helper: Send order details notification
 * @param {Object} orderData - Order data object
 * @returns {Promise<Object>} Result
 */
async function notifyOrderDetails(orderData) {
  const message = `📦 New Order!\n\n` +
    `Order ID: ${orderData.order_id || orderData.id || 'N/A'}\n` +
    `Customer: ${orderData.customer_name || orderData.user_name || 'N/A'}\n` +
    `Amount: ${orderData.total_amount || orderData.amount || '0'} ${orderData.currency || ''}\n` +
    `Items: ${orderData.items_count || 'N/A'}\n` +
    `Status: ${orderData.status || 'N/A'}\n` +
    `Time: ${new Date().toLocaleString()}`;

  return await sendMessageByModule('order_details', message);
}

module.exports = {
  getBotConfig,
  getAllBotConfigs,
  sendMessageByModule,
  sendMessageByModuleFormatted,
  notifyNewUserSignup,
  notifyOrderDetails
};

