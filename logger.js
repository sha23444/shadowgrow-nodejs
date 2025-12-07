const fs = require('fs');
const path = require('path');

// SAFE ERROR LOGGER - NEVER CRASHES THE SERVER
// Multiple layers of protection to ensure 100% uptime

// Ensure the logs directory exists before creating the log file stream
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    // If we can't create logs directory, just continue without file logging
    console.warn('Could not create logs directory:', error.message);
  }
}

// Create a writable log file stream with error handling
let logFile = null;
try {
  if (fs.existsSync(logsDir)) {
    logFile = fs.createWriteStream(path.join(logsDir, 'app.log'), { flags: 'a' });
    
    // Handle file stream errors gracefully
    logFile.on('error', (error) => {
      console.warn('Log file stream error (continuing without file logging):', error.message);
      logFile = null;
    });
  }
} catch (error) {
  console.warn('Could not create log file stream (continuing without file logging):', error.message);
  logFile = null;
}

// Safe database connection check - OPTIMIZED
async function isDatabaseAvailable() {
  try {
    // Quick check if database module exists
    const dbModule = require('./config/database');
    if (!dbModule || !dbModule.pool) {
      return false;
    }
    
    const { pool } = dbModule;
    
    // Quick check if pool is valid
    if (!pool || typeof pool.execute !== 'function') {
      return false;
    }
    
    // Fast ping query with timeout
    const pingPromise = pool.execute('SELECT 1');
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database timeout')), 1000)
    );
    
    await Promise.race([pingPromise, timeoutPromise]);
    return true;
  } catch (error) {
    return false;
  }
}

// Error logging service - OPTIMIZED FOR PERFORMANCE
class ErrorLogger {
  static async logError({
    errorType = 'system',
    errorLevel = 'error',
    errorMessage,
    errorDetails = null,
    userId = null,
    userEmail = null,
    ipAddress = null,
    userAgent = null,
    endpoint = null,
    method = null,
    statusCode = null,
    req = null
  }) {
    // Fast path: Skip processing for expected errors
    if (statusCode === 404 || 
        errorMessage?.includes('404') || 
        errorMessage?.includes('not found') ||
        errorType === '404') {
      return; // Exit immediately for 404s
    }

    try {
      // LAYER 1: Fast console logging (synchronous)
      const timestamp = new Date().toISOString();
      const consoleMessage = `[${errorLevel.toUpperCase()}] ${timestamp} - ${errorType}: ${errorMessage}`;
      
      if (errorLevel === 'error') {
        console.error(consoleMessage);
      } else if (errorLevel === 'warn') {
        console.warn(consoleMessage);
      } else {
        console.log(consoleMessage);
      }

      // LAYER 2: Quick request info extraction (synchronous)
      if (req) {
        try {
          ipAddress = ipAddress || req.ip || req.connection?.remoteAddress;
          userAgent = userAgent || req.get('User-Agent');
          endpoint = endpoint || req.originalUrl;
          method = method || req.method;
        } catch (extractError) {
          // Ignore extraction errors - not critical
        }
      }

      // LAYER 3: Background database logging (non-blocking)
      setImmediate(async () => {
        try {
          const dbAvailable = await isDatabaseAvailable();
          if (dbAvailable) {
            await this.logToDatabase({
              errorType,
              errorLevel,
              errorMessage,
              errorDetails: errorDetails ? JSON.stringify(errorDetails) : null,
              userId,
              userEmail,
              ipAddress,
              userAgent,
              endpoint,
              method,
              statusCode
            });
          }
        } catch (dbError) {
          // Database logging failed - not critical, just log to console
          console.warn('Database logging failed:', dbError.message);
        }
      });

      // LAYER 4: Background file logging (non-blocking)
      setImmediate(() => {
        try {
          this.logToFile(errorLevel, errorMessage, errorDetails);
        } catch (fileError) {
          // File logging failed - not critical
          console.warn('File logging failed:', fileError.message);
        }
      });

    } catch (criticalError) {
      // This should never happen, but just in case
      console.error('Critical error in ErrorLogger:', criticalError.message);
    }
  }

  static async logToDatabase(logData) {
    try {
      // Double-check database availability
      if (!(await isDatabaseAvailable())) {
        return;
      }

      const { pool } = require('./config/database');
      
      // Check if the error_logs table exists before trying to insert
      try {
        const [tableCheck] = await pool.execute(
          "SHOW TABLES LIKE 'res_error_logs'"
        );
        
        if (tableCheck.length === 0) {
          console.warn('Error logs table does not exist, skipping database logging');
          return;
        }
      } catch (tableError) {
        console.warn('Could not check error logs table (skipping database logging):', tableError.message);
        return;
      }
      
      const query = `
        INSERT INTO res_error_logs (
          error_type, error_level, error_message, error_details,
          user_id, user_email, ip_address, user_agent,
          endpoint, method, status_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const params = [
        logData.errorType || 'unknown',
        logData.errorLevel || 'error',
        logData.errorMessage || 'Unknown error',
        logData.errorDetails,
        logData.userId,
        logData.userEmail,
        logData.ipAddress,
        logData.userAgent,
        logData.endpoint,
        logData.method,
        logData.statusCode
      ];

      await pool.execute(query, params);
      
    } catch (error) {
      // Log the database error but don't crash
      console.warn('Database logging operation failed:', error.message);
      // Don't re-throw - just log and continue
    }
  }

  static logToFile(level, message, details = null) {
    try {
      if (!logFile) {
        return; // No file logging available
      }

      const timestamp = new Date().toISOString();
      const logEntry = `[${level.toUpperCase()}] ${timestamp} - ${message}`;
      const detailsEntry = details ? `\nDetails: ${JSON.stringify(details, null, 2)}` : '';
      
      const fullEntry = logEntry + detailsEntry + '\n';
      
      // Check if file stream is writable
      if (logFile.writable) {
        logFile.write(fullEntry);
      }
      
    } catch (error) {
      console.warn('File logging failed:', error.message);
      // Don't crash - just continue
    }
  }

  // Convenience methods for different error types (all safe)
  static async logEmailError(error, userEmail, userId = null, req = null) {
    try {
      await this.logError({
        errorType: 'email',
        errorLevel: 'error',
        errorMessage: error.message || 'Email sending failed',
        errorDetails: { error: error.toString(), stack: error.stack },
        userEmail,
        userId,
        req
      });
    } catch (logError) {
      console.warn('Email error logging failed (safe fallback):', logError.message);
    }
  }

  static async logAuthError(error, userEmail = null, userId = null, req = null) {
    try {
      await this.logError({
        errorType: 'auth',
        errorLevel: 'error',
        errorMessage: error.message || 'Authentication error',
        errorDetails: { error: error.toString(), stack: error.stack },
        userEmail,
        userId,
        req
      });
    } catch (logError) {
      console.warn('Auth error logging failed (safe fallback):', logError.message);
    }
  }

  static async logPaymentError(error, userEmail = null, userId = null, req = null) {
    try {
      await this.logError({
        errorType: 'payment',
        errorLevel: 'error',
        errorMessage: error.message || 'Payment processing error',
        errorDetails: { error: error.toString(), stack: error.stack },
        userEmail,
        userId,
        req
      });
    } catch (logError) {
      console.warn('Payment error logging failed (safe fallback):', logError.message);
    }
  }

  static async logSystemError(error, req = null) {
    try {
      await this.logError({
        errorType: 'system',
        errorLevel: 'error',
        errorMessage: error.message || 'System error',
        errorDetails: { error: error.toString(), stack: error.stack },
        req
      });
    } catch (logError) {
      console.warn('System error logging failed (safe fallback):', logError.message);
    }
  }

  static async logWarning(message, details = null, req = null) {
    try {
      await this.logError({
        errorType: 'system',
        errorLevel: 'warn',
        errorMessage: message,
        errorDetails: details,
        req
      });
    } catch (logError) {
      console.warn('Warning logging failed (safe fallback):', logError.message);
    }
  }

  static async logInfo(message, details = null, req = null) {
    try {
      await this.logError({
        errorType: 'system',
        errorLevel: 'info',
        errorMessage: message,
        errorDetails: details,
        req
      });
    } catch (logError) {
      console.warn('Info logging failed (safe fallback):', logError.message);
    }
  }
}

// Safe console override methods (never crash)
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function (...args) {
  try {
    const message = `[LOG] ${new Date().toISOString()} - ${args.join(' ')}\n`;
    if (logFile && logFile.writable) {
      logFile.write(message);
    }
    originalLog.apply(console, args);
  } catch (error) {
    // If console override fails, just use original
    originalLog.apply(console, args);
  }
};

console.error = function (...args) {
  try {
    const message = `[ERROR] ${new Date().toISOString()} - ${args.join(' ')}\n`;
    if (logFile && logFile.writable) {
      logFile.write(message);
    }
    originalError.apply(console, args);
  } catch (error) {
    // If console override fails, just use original
    originalError.apply(console, args);
  }
};

console.warn = function (...args) {
  try {
    const message = `[WARN] ${new Date().toISOString()} - ${args.join(' ')}\n`;
    if (logFile && logFile.writable) {
      logFile.write(message);
    }
    originalWarn.apply(console, args);
  } catch (error) {
    // If console override fails, just use original
    originalWarn.apply(console, args);
  }
};

module.exports = { ErrorLogger };
