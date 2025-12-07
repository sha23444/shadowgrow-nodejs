/**
 * Telegram Queue Service
 * Uses BullMQ with Redis to handle high-volume message sending
 * 
 * Features:
 * - Rate limiting to respect Telegram API limits
 * - Automatic retries with exponential backoff
 * - Persistent queue (survives server restarts)
 * - Batch processing for efficiency
 * - Error handling and logging
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');

// Redis connection configuration (reusing smart-cache config)
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

// Create Telegram message queue
// Queue name: 'telegram-messages'
// Options:
// - defaultJobOptions: Configure job retry behavior
// - connection: Redis connection config
const telegramQueue = new Queue('telegram-messages', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5, // Try 5 times before giving up
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay, exponential backoff
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

/**
 * Add message to queue
 * @param {Object} jobData - Message job data
 * @param {string} jobData.module - Module name (e.g., 'order_details', 'new_user_signup')
 * @param {string} jobData.message - Message text to send
 * @param {string|number|null} jobData.chatId - Optional chat ID
 * @param {Object} jobOptions - Optional job options (priority, delay, etc.)
 * @returns {Promise<Job>} The job that was added to the queue
 */
async function addTelegramMessage(jobData, jobOptions = {}) {
  try {
    if (!jobData.module || !jobData.message) {
      throw new Error('module and message are required');
    }

    // Add job to queue with default options and any custom options
    const job = await telegramQueue.add(
      'send-message',
      {
        module: jobData.module,
        message: jobData.message,
        chatId: jobData.chatId || null,
        timestamp: new Date().toISOString(),
      },
      {
        // Default priority (higher number = higher priority)
        priority: jobOptions.priority || 1,
        // Delay if specified (useful for rate limiting)
        delay: jobOptions.delay || 0,
        // Job ID for tracking
        jobId: jobOptions.jobId || undefined,
        ...jobOptions,
      }
    );

    console.log(`✅ Telegram message queued: ${job.id} for module ${jobData.module}`);
    return job;
  } catch (error) {
    console.error('Error adding Telegram message to queue:', error);
    throw error;
  }
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue stats
 */
async function getQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      telegramQueue.getWaitingCount(),
      telegramQueue.getActiveCount(),
      telegramQueue.getCompletedCount(),
      telegramQueue.getFailedCount(),
      telegramQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
      error: error.message,
    };
  }
}

/**
 * Clean up old jobs (optional utility function)
 */
async function cleanQueue() {
  try {
    await telegramQueue.clean(24 * 3600 * 1000, 1000, 'completed'); // 24 hours
    await telegramQueue.clean(7 * 24 * 3600 * 1000, 500, 'failed'); // 7 days
    console.log('✅ Queue cleaned');
  } catch (error) {
    console.error('Error cleaning queue:', error);
  }
}

/**
 * Close queue connection gracefully
 */
async function closeQueue() {
  try {
    await telegramQueue.close();
    console.log('✅ Telegram queue closed');
  } catch (error) {
    console.error('Error closing queue:', error);
  }
}

module.exports = {
  addTelegramMessage,
  getQueueStats,
  cleanQueue,
  closeQueue,
  telegramQueue,
};

