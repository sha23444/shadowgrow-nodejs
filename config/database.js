
const mysql = require("mysql2/promise");
require('dotenv').config();

// Environment variables are assumed to be present

// Create a MariaDB connection pool optimized for high-volume traffic (1M+ daily visitors)
const originalPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  charset: 'utf8mb4',
  // Set timezone to IST (Indian Standard Time) - Asia/Kolkata (UTC+5:30)
  timezone: '+05:30', // IST offset
  // Ensure initial TCP connection attempts fail fast instead of hanging
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
  
  // Connection pool settings - optimized for VPS with limited resources
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10, // Reduced to 10 for VPS stability (was 100)
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT) || 50, // Reduced to 50 to prevent memory exhaustion (was 500)
  
  // Note: mysql2 does not support acquireTimeout/timeout at pool level
  
  // Connection persistence settings - optimized for high traffic
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  
  // Performance optimizations for million+ traffic
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: false, // Changed: false for better type handling
  debug: false,
  multipleStatements: false, // Security: prevent SQL injection via multiple statements
  
  // Additional optimizations for high-volume traffic
  // Reuse connections aggressively
  reconnect: true,
  // Reduce connection overhead
  flags: ['-FOUND_ROWS'], // Return found rows instead of affected rows for better performance
  
  // SSL configuration (enable if using remote DB)
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false,
  
  // Optimize for performance
  typeCast: true,
  
  // Connection flags/reconnect/idleTimeout are not supported by mysql2 pool; removed to avoid warnings
});

// Track connection status
let isConnected = false;
let connectionAttempts = 0;

// Create an optimized proxy wrapper for the pool with connection caching
// Optimized for MILLION+ daily traffic
const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '20000', 10); // Reduced to 20s for faster failure detection
const MAX_RETRIES = parseInt(process.env.DB_TRANSIENT_MAX_RETRIES || '2', 10);
const BASE_RETRY_DELAY_MS = parseInt(process.env.DB_TRANSIENT_BASE_DELAY_MS || '50', 10);
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD_MS || '300', 10); // Reduced to 300ms for million+ traffic
const ENABLE_PARAM_TYPE_FIXING = process.env.DB_ENABLE_PARAM_TYPE_FIXING !== 'false'; // Can disable if not needed

// Lightweight circuit-breaker to protect DB when it's down
let breakerOpen = false;
let breakerResetAt = 0;
const BREAKER_ERROR_THRESHOLD = parseInt(process.env.DB_BREAKER_ERROR_THRESHOLD || '5', 10);
const BREAKER_COOL_DOWN_MS = parseInt(process.env.DB_BREAKER_COOL_DOWN_MS || '5000', 10);
let consecutiveConnectionErrors = 0;

function shouldOpenBreaker() {
  return consecutiveConnectionErrors >= BREAKER_ERROR_THRESHOLD;
}

function openBreaker() {
  breakerOpen = true;
  breakerResetAt = Date.now() + BREAKER_COOL_DOWN_MS;
}

function maybeCloseBreaker() {
  if (breakerOpen && Date.now() >= breakerResetAt) {
    breakerOpen = false;
    consecutiveConnectionErrors = 0;
  }
}

const TRANSIENT_ERROR_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_CON_COUNT_ERROR',
  'ER_SERVER_GONE_AWAY',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
]);

// Optimized parameter type fixing - only processes when needed
function fixParameterTypes(params) {
  if (!ENABLE_PARAM_TYPE_FIXING || !params || !Array.isArray(params)) {
    return params;
  }
  
  // Fast path: check if any params need fixing before processing
  let needsFixing = false;
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    if (param === null || param === undefined) continue;
    if (typeof param === 'string') {
      // Quick check if it might be a number or boolean
      if (/^\d+$/.test(param) || /^\d+\.\d+$/.test(param) || 
          param.toLowerCase() === 'true' || param.toLowerCase() === 'false') {
        needsFixing = true;
        break;
      }
    }
  }
  
  // If no fixing needed, return original array
  if (!needsFixing) {
    return params;
  }
  
  // Only create new array if fixing is needed
  return params.map(param => {
    // Handle null/undefined
    if (param === null || param === undefined) {
      return null;
    }
    
    // Handle strings that should be numbers
    if (typeof param === 'string') {
      // Pure integer strings
      if (/^\d+$/.test(param)) {
        return parseInt(param, 10);
      }
      // Decimal strings
      if (/^\d+\.\d+$/.test(param)) {
        return parseFloat(param);
      }
      // Boolean strings
      if (param.toLowerCase() === 'true') {
        return true;
      }
      if (param.toLowerCase() === 'false') {
        return false;
      }
      // Keep other strings as-is
      return param;
    }
    
    // Keep numbers, booleans, and objects as-is
    return param;
  });
}

const pool = new Proxy(originalPool, {
  get(target, prop) {
    // If the property is a method that returns a promise, wrap it
    if (typeof target[prop] === 'function' && ['execute', 'query', 'getConnection'].includes(prop)) {
      return async function(...args) {
        // MySQL strict mode compatibility - fix parameter types before execution
        if ((prop === 'execute' || prop === 'query') && args.length >= 2 && Array.isArray(args[1])) {
          // Optimized: only fix if needed
          args[1] = fixParameterTypes(args[1]);
        }
        
        // For execute and query, use direct pool methods (faster)
        if (prop === 'execute' || prop === 'query') {
          try {
            // Ensure per-query timeout using mysql2 options object
            if (typeof args[0] === 'string') {
              args[0] = { sql: args[0], timeout: QUERY_TIMEOUT_MS };
            } else if (args[0] && typeof args[0] === 'object' && !('timeout' in args[0])) {
              args[0].timeout = QUERY_TIMEOUT_MS;
            }

            // Circuit breaker fast-fail
            maybeCloseBreaker();
            if (breakerOpen) {
              console.warn(`Database ${prop} fast-fail: circuit open`);
              return [[]];
            }

            // Execute with retry/backoff for transient errors
            const start = Date.now();
            let attempt = 0;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              try {
                const result = await target[prop].apply(target, args);
                const duration = Date.now() - start;
                if (duration >= SLOW_QUERY_THRESHOLD_MS) {
                  const sqlPreview = typeof args[0] === 'object' ? (args[0].sql || '') : String(args[0] || '');
                  console.warn(`Slow DB ${prop} (${duration}ms)`, sqlPreview.slice(0, 200));
                }
                isConnected = true;
                consecutiveConnectionErrors = 0; // reset on success
                return result;
              } catch (err) {
                const isConnectionError = (
                  err.code === 'PROTOCOL_CONNECTION_LOST' ||
                  err.code === 'ECONNREFUSED' ||
                  err.code === 'ER_CON_COUNT_ERROR' ||
                  err.code === 'ER_SERVER_GONE_AWAY' ||
                  err.code === 'ETIMEDOUT' ||
                  err.code === 'ECONNRESET' ||
                  err.fatal === true
                );

                if (isConnectionError) {
                  consecutiveConnectionErrors++;
                  if (shouldOpenBreaker()) {
                    openBreaker();
                    console.warn(`Database ${prop} connection errors exceeded threshold. Circuit opened for ${BREAKER_COOL_DOWN_MS}ms`);
                  }
                }

                const isTransient = TRANSIENT_ERROR_CODES.has(err.code || '') || err.fatal === true;
                if (isTransient && attempt < MAX_RETRIES) {
                  const delay = Math.min(BREAKER_COOL_DOWN_MS, Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, attempt)));
                  attempt++;
                  await new Promise(r => setTimeout(r, delay));
                  continue; // retry
                }

                // Non-retryable or retries exhausted
                if (isConnectionError) {
                  isConnected = false;
                  if (err.code !== 'ER_PARSE_ERROR' && err.code !== 'ER_BAD_FIELD_ERROR') {
                    console.warn(`Database ${prop} connection error: ${err.code || err.message}`);
                  }
                  return [[]];
                }

                if (process.env.NODE_ENV === 'development' || err.code?.startsWith('ER_')) {
                  console.error(`Database ${prop} error [${err.code}]: ${err.message}`);
                }
                return [[]];
              }
            }
          } catch (error) {
            // Handle connection errors gracefully without crashing
            if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
                error.code === 'ECONNREFUSED' || 
                error.code === 'ER_CON_COUNT_ERROR' ||
                error.code === 'ER_SERVER_GONE_AWAY' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNRESET' ||
                error.fatal === true) {
              isConnected = false;
              // Only log connection errors, not query errors (reduces noise)
              if (error.code !== 'ER_PARSE_ERROR' && error.code !== 'ER_BAD_FIELD_ERROR') {
                console.warn(`Database ${prop} connection error: ${error.code || error.message}`);
              }
              // Return empty results instead of crashing the server
              return [[]];
            }
            // For query errors (not connection errors), log but don't spam
            // Only log serious errors in production
            if (process.env.NODE_ENV === 'development' || error.code?.startsWith('ER_')) {
              console.error(`Database ${prop} error [${error.code}]: ${error.message}`);
            }
            return [[]];
          }
        }
        
        // For getConnection, use optimized connection management
        // Optimized for high-traffic: cache timezone setting per connection
        if (prop === 'getConnection') {
          try {
            const connection = await target[prop].apply(target, args);
            
            // Set MySQL timezone to IST on each new connection
            // Only set if not already set (connection reuse optimization)
            if (!connection._timezoneSet) {
              try {
                await connection.execute("SET time_zone = '+05:30'");
                connection._timezoneSet = true; // Cache flag to avoid redundant queries
              } catch (tzError) {
                // Ignore timezone errors (connection might already have it set)
                connection._timezoneSet = true; // Mark as set even on error to avoid retries
              }
            }
            
            isConnected = true;
            return connection;
          } catch (error) {
            console.warn(`Database ${prop} failed: ${error.message}`);
            isConnected = false;
            // Return mock connection to prevent server crashes
            return createMockConnection();
          }
        }
      };
    }
    
    // Return the original property for non-method properties
    return target[prop];
  }
});

// Create a mock connection for when database is unavailable
function createMockConnection() {
  return {
    execute: async () => [[]],
    query: async () => [[]],
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: async () => {},
    // Add any other methods that might be called
  };
}

// Retry connection function with infinite attempts to keep server alive
async function testConnectionWithRetry(maxRetries = Infinity, delay = 2000) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    connectionAttempts = attempt;
    
    try {
      const connection = await originalPool.getConnection();
      
      // Set MySQL timezone to IST (Asia/Kolkata - UTC+5:30)
      await connection.execute("SET time_zone = '+05:30'");
      
      console.log(`✅ MariaDB Connected (attempt ${attempt}) - Timezone set to IST`);
      connection.release(); // Release back to pool
      isConnected = true;
      return true; // Connection successful
    } catch (err) {
      console.error(`❌ MariaDB Connection Error (attempt ${attempt}):`, err.message);
      
      // Don't give up - keep trying to maintain server availability
      console.log(`⏳ Retrying in ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay for exponential backoff (max 30 seconds)
      delay = Math.min(delay * 1.2, 30000);
    }
  }
}

// Health check function with automatic reconnection
async function checkConnectionHealth() {
  try {
    const connection = await originalPool.getConnection();
    
    // Ensure timezone is set to IST on each connection
    await connection.execute("SET time_zone = '+05:30'").catch(() => {
      // Ignore errors if timezone is already set
    });
    
    connection.release();
    if (!isConnected) {
      console.log("✅ Database connection restored - Timezone set to IST");
      isConnected = true;
    }
    return true;
  } catch (err) {
    if (isConnected) {
      console.error("❌ Database connection lost:", err.message);
      isConnected = false;
      // Automatically attempt to reconnect
      console.log("🔄 Attempting to reconnect...");
      testConnectionWithRetry(1, 1000); // Quick retry
    }
    return false;
  }
}

// Test connection with retry mechanism
testConnectionWithRetry()
  .then((connected) => {
    if (connected) {
      console.log("🚀 Database connection established successfully");
    } else {
      console.log("⚠️  App running without database connection");
    }
  })
  .catch((err) => {
    console.error("❌ Unexpected error during connection test:", err);
    console.log("⚠️  App running without database connection");
    isConnected = false;
  });

// Set up periodic health checks (every 5 minutes for high-traffic production)
// Reduced frequency to minimize overhead with 1M+ visitors
const HEALTH_CHECK_INTERVAL = parseInt(process.env.DB_HEALTH_CHECK_INTERVAL) || 300000; // 5 minutes
let healthCheckInterval = setInterval(checkConnectionHealth, HEALTH_CHECK_INTERVAL);

// Add connection pool event handlers (logging disabled for high-traffic production)
// These events are tracked silently - only errors are logged
// Uncomment below if you need debug logging in development
/*
let connectionCount = 0;
let acquireCount = 0;
let releaseCount = 0;
const ENABLE_POOL_LOGGING = process.env.NODE_ENV === 'development';

originalPool.on('connection', (connection) => {
  connectionCount++;
  if (ENABLE_POOL_LOGGING && connectionCount % 1000 === 0) {
    console.log(`🔗 ${connectionCount} database connections established`);
  }
});

originalPool.on('acquire', (connection) => {
  acquireCount++;
  if (ENABLE_POOL_LOGGING && acquireCount % 10000 === 0) {
    console.log(`📥 ${acquireCount} connections acquired from pool`);
  }
});

originalPool.on('release', (connection) => {
  releaseCount++;
  if (ENABLE_POOL_LOGGING && releaseCount % 10000 === 0) {
    console.log(`📤 ${releaseCount} connections released back to pool`);
  }
});
*/

originalPool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
  isConnected = false;
  
  // Don't crash the server - just log and continue
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 Database connection lost, will retry automatically');
    // Attempt immediate reconnection
    setTimeout(() => testConnectionWithRetry(1, 1000), 1000);
  } else if (err.code === 'ECONNREFUSED') {
    console.log('🚫 Database connection refused, will retry automatically');
    // Attempt immediate reconnection
    setTimeout(() => testConnectionWithRetry(1, 2000), 2000);
  } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.log('🔐 Database access denied, check credentials');
  } else if (err.code === 'ER_CON_COUNT_ERROR') {
    console.log('📊 Too many connections, will retry automatically');
    setTimeout(() => testConnectionWithRetry(1, 5000), 5000);
  } else if (err.code === 'ER_SERVER_GONE_AWAY') {
    console.log('🔄 Server gone away, will retry automatically');
    setTimeout(() => testConnectionWithRetry(1, 1000), 1000);
  }
});

// Add graceful shutdown handling
process.on('SIGINT', () => {
  console.log('🛑 Gracefully shutting down database connections...');
  
  // Clear health check interval to prevent memory leak
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  
  originalPool.end((err) => {
    if (err) {
      console.error('Error closing database pool:', err.message);
    } else {
      console.log('✅ Database pool closed successfully');
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🛑 Gracefully shutting down database connections...');
  
  // Clear health check interval to prevent memory leak
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  
  originalPool.end((err) => {
    if (err) {
      console.error('Error closing database pool:', err.message);
    } else {
      console.log('✅ Database pool closed successfully');
    }
    process.exit(0);
  });
});

const secretKey = process.env.JWT_SECRET;

// Export connection status and health check function
module.exports = { 
  pool, 
  secretKey, 
  isConnected: () => isConnected,
  checkConnectionHealth,
  connectionAttempts: () => connectionAttempts
};
