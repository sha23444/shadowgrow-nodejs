/**
 * Telegram Worker Service
 * Processes queued Telegram messages
 * 
 * Features:
 * - Concurrency control (process multiple messages simultaneously)
 * - Rate limiting (respects Telegram API limits - ~30 messages/second per bot)
 * - Automatic retries with exponential backoff
 * - Error handling and logging
 * - Graceful shutdown
 */

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const axios = require('axios');
const https = require('https');
const { pool } = require('../config/database');

// Redis connection configuration (same as queue)
const redisConnection = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 5, // Increased retries
  enableOfflineQueue: true, // Allow offline queue (commands wait when Redis is down)
  connectTimeout: 10000, // Increased connect timeout to 10 seconds
  commandTimeout: 10000, // Increased command timeout to 10 seconds
  retryStrategy: (times) => {
    if (times > 20) {
      return null; // Stop retrying after 20 attempts
    }
    const delay = Math.min(times * 200, 5000); // Exponential backoff up to 5 seconds
    return delay;
  },
  lazyConnect: true, // Don't connect immediately
  keepAlive: 30000, // Keep connection alive
  family: 4, // IPv4
  db: 0,
};

// HTTP agent for Telegram API (reuse connection)
const TELEGRAM_HTTP_AGENT = new https.Agent({
  keepAlive: true,
  family: 4,
  timeout: 10000,
});

/**
 * Get all active bot configurations for a module
 * @param {string} module - Module name
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
 * Send message to Telegram API
 * @param {Object} config - Bot configuration
 * @param {string} chatId - Chat ID
 * @param {string} message - Message text
 * @param {string} parseMode - Optional parse mode (HTML, Markdown, etc.)
 * @returns {Promise<Object>} Result
 */
async function sendTelegramMessage(config, chatId, message, parseMode = null) {
  const API_URL = `https://api.telegram.org/bot${config.bot_token}`;

  try {
    const payload = {
      chat_id: chatId,
      text: message,
    };

    // Add parse mode if specified
    if (parseMode && (parseMode === 'HTML' || parseMode === 'Markdown' || parseMode === 'MarkdownV2')) {
      payload.parse_mode = parseMode;
    }

    const response = await axios.post(
      `${API_URL}/sendMessage`,
      payload,
      {
        timeout: 12000,
        httpsAgent: TELEGRAM_HTTP_AGENT,
      }
    );

    if (response.data.ok) {
      return {
        success: true,
        bot_id: config.id,
        bot_name: config.bot_name || config.module,
        message_id: response.data.result.message_id,
        chat: response.data.result.chat,
      };
    } else {
      return {
        success: false,
        bot_id: config.id,
        error: 'Failed to send message',
        details: response.data,
      };
    }
  } catch (apiError) {
    // Handle specific Telegram API errors
    const errorMessage = apiError.response?.data?.description || apiError.message;
    const errorCode = apiError.response?.data?.error_code;

    // Retriable errors (will be retried by BullMQ)
    const retriableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNREFUSED',
      'timeout',
    ];

    // Check if error is retriable
    const isRetriable = retriableErrors.some(err => 
      errorMessage.includes(err) || apiError.code === err
    );

    // Rate limit errors (429) - will be retried with backoff
    if (apiError.response?.status === 429) {
      const retryAfter = apiError.response?.headers['retry-after'] || 60;
      throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
    }

    // If not retriable, throw error to fail the job
    if (!isRetriable && errorCode !== 429) {
      throw new Error(`Non-retriable error: ${errorMessage}`);
    }

    // Otherwise, throw error for retry
    throw apiError;
  }
}

/**
 * Process a single job
 * @param {Job} job - The job to process
 * @returns {Promise<Object>} Result
 */
async function processTelegramMessage(job) {
  const { module, message, chatId, parseMode } = job.data;

  try {
    // Validate job data
    if (!module || !message) {
      throw new Error('module and message are required');
    }

    // Get all active bot configurations for this module
    const configs = await getAllBotConfigs(module);

    if (configs.length === 0) {
      throw new Error(`No active bot configuration found for module: ${module}`);
    }

    // Send message to ALL active bots
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const config of configs) {
      // Use provided chatId or fallback to config's chatId
      const targetChatId = chatId || config.chat_id;

      if (!targetChatId) {
        results.push({
          bot_id: config.id,
          bot_name: config.bot_name || config.module,
          success: false,
          error: `chatId not set for bot ${config.id}`,
        });
        failCount++;
        continue;
      }

      try {
        const result = await sendTelegramMessage(config, targetChatId, message, parseMode);
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(
          `Error sending message to bot ${config.id} for module ${module}:`,
          error.message
        );
        results.push({
          bot_id: config.id,
          bot_name: config.bot_name || config.module,
          success: false,
          error: error.message,
        });
        failCount++;
        
        // If this is a critical error, rethrow to fail the job
        if (error.message.includes('Non-retriable')) {
          throw error;
        }
      }

      // Small delay between sends to same bot (rate limiting)
      // Telegram allows ~30 messages/second per bot
      if (configs.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
      }
    }

    // Return summary
    return {
      success: successCount > 0,
      module,
      total_bots: configs.length,
      sent_count: successCount,
      failed_count: failCount,
      results,
      message: successCount === configs.length
        ? `Message sent to all ${successCount} bot(s)`
        : `Message sent to ${successCount} of ${configs.length} bot(s)`,
    };
  } catch (error) {
    console.error(`Error processing Telegram message job ${job.id}:`, error);
    throw error; // Rethrow to trigger retry mechanism
  }
}

// Create worker instance
// Options:
// - concurrency: Process up to 5 messages simultaneously
// - limiter: Rate limit to respect Telegram API limits (30 messages/second per bot)
let telegramWorker = null;

/**
 * Check if Redis is ready before starting worker
 */
async function waitForRedisReady(maxAttempts = 10, delay = 1000) {
  const Redis = require('ioredis');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const testRedis = new Redis({
        host: 'localhost',
        port: 6379,
        connectTimeout: 2000,
        retryStrategy: () => null, // Don't retry, just test connection
        lazyConnect: true,
      });
      await testRedis.connect();
      await testRedis.ping();
      await testRedis.quit();
      return true;
    } catch (error) {
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

/**
 * Initialize and start the worker
 * @returns {Promise<Worker>} The worker instance
 */
async function startTelegramWorker() {
  if (telegramWorker) {
    console.log('⚠️  Telegram worker already running');
    return telegramWorker;
  }

  // Wait for Redis to be ready before starting worker
  console.log('🔍 Waiting for Redis to be ready before starting Telegram worker...');
  const redisReady = await waitForRedisReady(15, 1000); // Wait up to 15 seconds

  if (!redisReady) {
    console.warn('⚠️  Redis is not ready. Telegram worker will start but may fail.');
    console.log('ℹ️  Worker will retry connecting automatically.');
  } else {
    console.log('✅ Redis is ready');
  }

  telegramWorker = new Worker(
    'telegram-messages',
    async (job) => {
      console.log(`🔄 Processing Telegram message job ${job.id} for module ${job.data.module}`);
      const result = await processTelegramMessage(job);
      console.log(`✅ Telegram message job ${job.id} completed: ${result.message}`);
      return result;
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 messages simultaneously
      limiter: {
        max: 25, // Max 25 jobs
        duration: 1000, // Per second (to stay under Telegram's 30/sec limit)
      },
    }
  );

  // Event handlers
  telegramWorker.on('completed', (job, result) => {
    console.log(`✅ Telegram job ${job.id} completed successfully`);
  });

  telegramWorker.on('failed', (job, err) => {
    console.error(`❌ Telegram job ${job?.id} failed:`, err.message);
    if (job) {
      console.error(`   Attempt: ${job.attemptsMade}/${job.opts.attempts}`);
      console.error(`   Module: ${job.data.module}`);
    }
  });

  telegramWorker.on('error', (err) => {
    // Only log non-timeout errors to reduce noise
    if (!err.message || !err.message.includes('timed out')) {
      console.error('❌ Telegram worker error:', err.message || err);
    } else {
      // For timeout errors, just log a warning
      console.warn('⚠️  Telegram worker: Redis connection timeout (will retry automatically)');
    }
  });

  telegramWorker.on('stalled', (jobId) => {
    console.warn(`⚠️  Telegram job ${jobId} stalled`);
  });

  telegramWorker.on('ready', () => {
    console.log('✅ Telegram worker ready and connected to Redis');
  });

  telegramWorker.on('closed', () => {
    console.log('⚠️  Telegram worker closed');
  });

  console.log('✅ Telegram worker started (connecting to Redis...)');
  return telegramWorker;
}

/**
 * Stop the worker gracefully
 */
async function stopTelegramWorker() {
  if (telegramWorker) {
    try {
      await telegramWorker.close();
      telegramWorker = null;
      console.log('✅ Telegram worker stopped');
    } catch (error) {
      console.error('Error stopping Telegram worker:', error);
    }
  }
}

// Worker should be started explicitly in app.js
// Do not auto-start to allow better control and initialization order

module.exports = {
  startTelegramWorker,
  stopTelegramWorker,
  processTelegramMessage,
  telegramWorker: () => telegramWorker,
};

