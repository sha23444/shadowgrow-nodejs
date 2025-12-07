#!/usr/bin/env node

/**
 * Ensure Redis is Running
 * Checks if Redis is running, and starts it if not
 * Cross-platform support (macOS, Linux)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const Redis = require('ioredis');

const execAsync = promisify(exec);

/**
 * Check if Redis is already running
 */
async function isRedisRunning() {
  try {
    const redis = new Redis({
      host: 'localhost',
      port: 6379,
      connectTimeout: 2000,
      retryStrategy: () => null, // Don't retry, just check if it's up
      lazyConnect: true,
    });

    await redis.connect();
    await redis.ping();
    await redis.quit();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Start Redis on macOS (using Homebrew)
 */
async function startRedisMacOS() {
  try {
    console.log('🔄 Starting Redis on macOS...');
    // Try to start Redis using brew services
    try {
      await execAsync('brew services start redis');
      console.log('✅ Redis started via brew services');
      return true;
    } catch (error) {
      // If brew services fails, try redis-server directly
      console.log('⚠️  brew services failed, trying redis-server directly...');
      try {
        await execAsync('redis-server --daemonize yes');
        console.log('✅ Redis started directly');
        return true;
      } catch (error2) {
        console.warn('⚠️  Could not start Redis:', error2.message);
        return false;
      }
    }
  } catch (error) {
    console.warn('⚠️  Could not start Redis on macOS:', error.message);
    return false;
  }
}

/**
 * Start Redis on Linux (using systemctl)
 */
async function startRedisLinux() {
  try {
    console.log('🔄 Starting Redis on Linux...');
    try {
      // Try with sudo first
      await execAsync('sudo systemctl start redis-server');
      console.log('✅ Redis started via systemctl');
      return true;
    } catch (error) {
      // If sudo fails, try without sudo (if user has permission)
      try {
        await execAsync('systemctl start redis-server');
        console.log('✅ Redis started via systemctl (no sudo)');
        return true;
      } catch (error2) {
        // Try redis-server directly as last resort
        console.log('⚠️  systemctl failed, trying redis-server directly...');
        try {
          await execAsync('redis-server --daemonize yes');
          console.log('✅ Redis started directly');
          return true;
        } catch (error3) {
          console.warn('⚠️  Could not start Redis:', error3.message);
          return false;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Could not start Redis on Linux:', error.message);
    return false;
  }
}

/**
 * Detect OS and start Redis accordingly
 */
async function startRedis() {
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS
    return await startRedisMacOS();
  } else if (platform === 'linux') {
    // Linux
    return await startRedisLinux();
  } else {
    console.warn(`⚠️  Unsupported platform: ${platform}. Please start Redis manually.`);
    return false;
  }
}

/**
 * Wait for Redis to be ready
 */
async function waitForRedis(maxAttempts = 10, delay = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isRedisRunning()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return false;
}

/**
 * Main function
 */
async function ensureRedis() {
  console.log('🔍 Checking if Redis is running...');

  // Check if Redis is already running
  if (await isRedisRunning()) {
    console.log('✅ Redis is already running');
    return true;
  }

  // Redis is not running, try to start it
  console.log('⚠️  Redis is not running. Attempting to start...');
  const started = await startRedis();

  if (!started) {
    console.warn('❌ Could not start Redis automatically.');
    console.log('ℹ️  Please start Redis manually:');
    if (process.platform === 'darwin') {
      console.log('   macOS: brew services start redis');
    } else {
      console.log('   Linux: sudo systemctl start redis-server');
    }
    console.log('   OR: redis-server');
    console.log('');
    console.log('⚠️  App will continue but Telegram queue will not work without Redis.');
    return false;
  }

  // Wait for Redis to be ready
  console.log('⏳ Waiting for Redis to be ready...');
  const ready = await waitForRedis();

  if (ready) {
    console.log('✅ Redis is ready!');
    return true;
  } else {
    console.warn('⚠️  Redis started but not ready yet. App will continue.');
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  ensureRedis()
    .then((success) => {
      if (success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Error ensuring Redis:', error);
      process.exit(1);
    });
}

module.exports = { ensureRedis, isRedisRunning };
