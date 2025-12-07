function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
    const i = Math.floor(Math.log(bytes) / Math.log(k));
  
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Safe error handler to prevent server crashes
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - Wrapped function with error handling
 */
const safeAsyncHandler = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      // Log the error
      // console.error('SafeAsyncHandler Error:', {
      //   message: error.message,
      //   stack: error.stack,
      //   url: req.url,
      //   method: req.method,
      //   ip: req.ip,
      //   timestamp: new Date().toISOString()
      // });

      // Don't crash the server, send error response
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Something went wrong',
          status: 500
        });
      }
    }
  };
};

/**
 * Safe database query wrapper
 * @param {Function} queryFn - The database query function
 * @returns {Promise} - Promise with error handling
 */
const safeDatabaseQuery = async (queryFn) => {
  try {
    return await queryFn();
  } catch (error) {
    // console.error('Database Query Error:', {
    //   message: error.message,
    //   code: error.code,
    //   sqlState: error.sqlState,
    //   timestamp: new Date().toISOString()
    // });

    // Return a safe default or re-throw if needed
    throw error;
  }
};

module.exports = {
  formatBytes,
  safeAsyncHandler,
  safeDatabaseQuery
};