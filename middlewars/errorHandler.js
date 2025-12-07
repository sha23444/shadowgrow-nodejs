/**
 * Global Error Handler Middleware
 * Handles all errors in the application with optimized performance
 */

const createError = require("http-errors");
const { ErrorLogger } = require('../logger');

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  const url = req.url;
  const method = req.method;
  
  // Quick checks to avoid expensive operations for static assets
  if (method === 'OPTIONS' || 
      url.startsWith('/static/') || 
      url.startsWith('/_next/') || 
      url.startsWith('/favicon') ||
      url.startsWith('/robots.txt') ||
      url.startsWith('/sitemap') ||
      url.includes('.')) {
    const notFoundError = createError(404, "Page Not Found");
    notFoundError.is404 = true;
    notFoundError.skipLogging = true;
    return next(notFoundError);
  }
  
  const notFoundError = createError(404, "Page Not Found");
  notFoundError.is404 = true;
  next(notFoundError);
}

/**
 * Error response formatters
 */
const errorFormatters = {
  // 404 Not Found
  is404: () => ({
    status: 404,
    error: 'Not Found',
    message: 'The requested resource was not found'
  }),

  // JWT Authentication errors
  isAuthError: (err) => ({
    status: 401,
    error: 'Authentication failed',
    message: err.name === 'TokenExpiredError' 
      ? 'Token expired, please login again' 
      : 'Invalid token'
  }),

  // Connection errors
  isConnectionError: () => ({
    status: 503,
    error: 'Service temporarily unavailable',
    message: 'Database connection error'
  }),

  // Validation errors
  isValidationError: (err) => ({
    status: 400,
    error: 'Validation Error',
    message: err.message
  }),

  // File upload errors
  isFileUploadError: (err) => {
    const errors = {
      'LIMIT_UNEXPECTED_FILE': {
        status: 400,
        error: 'Invalid File Field',
        message: `Unexpected field '${err.field}'. Please check the field name and try again.`
      },
      'LIMIT_FILE_SIZE': {
        status: 400,
        error: 'File Too Large',
        message: 'File size exceeds the allowed limit'
      },
      'LIMIT_FILE_COUNT': {
        status: 400,
        error: 'Too Many Files',
        message: 'Number of files exceeds the allowed limit'
      },
      'file not allowed': {
        status: 400,
        error: 'Invalid File Type',
        message: 'File type is not allowed'
      }
    };
    return errors[err.code || err.message];
  },

  // Rate limit errors
  isRateLimitError: () => ({
    status: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, please try again later'
  }),

  // Generic server error
  default: (err, req) => ({
    status: err.status || 500,
    error: 'Server Error',
    message: err.status === 500 && req.app.get('env') === 'production' 
      ? 'Something went wrong' 
      : (err.message || 'Internal Server Error'),
    ...(req.app.get('env') === 'development' && { stack: err.stack })
  })
};

/**
 * Format error response based on error type
 */
function formatErrorResponse(err, req) {
  // Quick error classification
  const is404 = err.status === 404 || err.is404;
  const isAuthError = err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError';
  const isConnectionError = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET';
  const isValidationError = err.name === 'ValidationError';
  const isFileUploadError = err.code && (err.code.startsWith('LIMIT_') || err.message === 'file not allowed');
  const isRateLimitError = err.status === 429;

  // Format response based on error type
  if (is404) return errorFormatters.is404();
  if (isAuthError) return errorFormatters.isAuthError(err);
  if (isConnectionError) return errorFormatters.isConnectionError();
  if (isValidationError) return errorFormatters.isValidationError(err);
  if (isFileUploadError) return errorFormatters.isFileUploadError(err);
  if (isRateLimitError) return errorFormatters.isRateLimitError();
  
  return errorFormatters.default(err, req);
}

/**
 * Log error to database (background, non-blocking)
 */
async function logErrorToDatabase(err, req) {
  const shouldLog = 
    err.status >= 500 || 
    (err.status >= 400 && err.status !== 404 && err.status !== 401);

  if (!shouldLog) return;

  try {
    await ErrorLogger.logError({
      errorType: 'http',
      errorLevel: 'error',
      errorMessage: err.message || 'Unknown error',
      errorDetails: {
        stack: err.stack,
        status: err.status,
        code: err.code,
        name: err.name
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      method: req.method,
      statusCode: err.status || 500,
      req
    });
  } catch (logError) {
    console.warn('Background error logging failed:', logError.message);
  }
}

/**
 * Global error handler middleware
 */
function globalErrorHandler(err, req, res, next) {
  // Fast path: Check if response already sent
  if (res.headersSent) {
    return;
  }

  try {
    const is404 = err.status === 404 || err.is404;
    const skipLogging = err.skipLogging;

    // Minimal console logging (synchronous, fast)
    if (!skipLogging && !is404) {
      console.error(`[ERROR] ${req.method} ${req.originalUrl || req.url}:`, err.message);
    } else if (is404) {
      console.log(`[INFO] 404: ${req.method} ${req.originalUrl || req.url}`);
    }

    // Format error response
    const errorResponse = formatErrorResponse(err, req);
    const status = errorResponse.status;

    // Send response immediately (fastest path)
    res.status(status).json(errorResponse);

    // Background error logging (non-blocking)
    if (!skipLogging && !is404 && err.status !== 404) {
      setImmediate(() => logErrorToDatabase(err, req));
    }

  } catch (criticalError) {
    // Critical error fallback
    console.error('Critical error in global error handler:', criticalError.message);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Something went wrong',
        status: 500
      });
    }
  }
}

module.exports = {
  notFoundHandler,
  globalErrorHandler
};

