// Database connection error handler middleware - independent of Redis
const handleDatabaseErrors = (err, req, res, next) => {
  // Handle database connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    console.error('Database Connection Error:', {
      code: err.code,
      message: err.message,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    return res.status(503).json({
      error: 'Service temporarily unavailable',
      message: 'Database connection error. Please try again later.',
      status: 503
    });
  }

  // Handle database query errors
  if (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') {
    console.error('Database Access Error:', {
      code: err.code,
      message: err.message,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      error: 'Database error',
      message: 'Unable to access database. Please try again later.',
      status: 500
    });
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
    console.error('Database Timeout Error:', {
      code: err.code,
      message: err.message,
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    return res.status(504).json({
      error: 'Request timeout',
      message: 'Database request timed out. Please try again.',
      status: 504
    });
  }

  // Pass other errors to the next error handler
  next(err);
};

module.exports = {
  handleDatabaseErrors
};
