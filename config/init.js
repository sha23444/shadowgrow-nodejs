/**
 * Application Initialization
 * Handles timezone setup, background services, and cron jobs
 */

require("dotenv").config();

// Set default timezone to Indian Standard Time (IST) - Asia/Kolkata
// This must be set before any date/time operations
process.env.TZ = 'Asia/Kolkata';

const moment = require("moment-timezone");

// Set moment-timezone default timezone to IST
moment.tz.setDefault('Asia/Kolkata');

// Log timezone configuration
console.log(`🌏 Default timezone set to: ${process.env.TZ || 'Asia/Kolkata'} (IST)`);
console.log(`📅 Current time: ${moment().format('YYYY-MM-DD HH:mm:ss z')}`);

// Initialize logger
require("../logger");

/**
 * Initialize background services (Redis, Workers, Cron Jobs)
 */
function initializeBackgroundServices() {
  // Skip in test environment
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  // Ensure Redis is running (non-blocking)
  const { ensureRedis } = require("../scripts/ensure-redis");
  ensureRedis().catch(err => {
    console.warn('⚠️  Redis check failed:', err.message);
    console.log('ℹ️  App will continue, but some features may not work without Redis.');
  });

  // Initialize cron jobs
  require("../jobs/updateIsNewCron");
  require("../jobs/autoCrawlAndIndex");
  require("../jobs/cancelPendingOrders");

  // Start Telegram Queue Worker after Redis is ready
  setTimeout(async () => {
    try {
      const { startTelegramWorker } = require("../services/telegramWorker");
      await startTelegramWorker();
    } catch (error) {
      console.warn('⚠️  Failed to start Telegram queue worker:', error.message);
      console.log('ℹ️  Telegram messages will be queued but not processed. Check Redis connection.');
      console.log('ℹ️  Worker will retry connecting automatically when Redis is available.');
    }
  }, 5000); // Wait 5 seconds for Redis to be ready
}

// Initialize background services
initializeBackgroundServices();

module.exports = { initializeBackgroundServices };

