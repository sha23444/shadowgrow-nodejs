/**
 * Process Event Handlers
 * Handles unhandled rejections, uncaught exceptions, and graceful shutdown
 */

/**
 * Configure all process event handlers
 */
function configureProcessHandlers() {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    // Handle Multer-specific errors gracefully
    if (reason && reason.code && reason.code.startsWith('LIMIT_')) {
      console.warn('Multer error caught in unhandled rejection:', reason.message);
      return; // Don't crash for Multer errors
    }
    
    // Don't exit the process, just log the error
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // Handle Multer-specific errors gracefully
    if (error && error.code && error.code.startsWith('LIMIT_')) {
      console.warn('Multer error caught in uncaught exception:', error.message);
      return; // Don't crash for Multer errors
    }
    
    // Don't exit the process, just log the error and continue
    console.log('⚠️ App continuing despite uncaught exception');
  });

  // Handle process errors
  process.on('error', (error) => {
    console.error('Process Error:', error);
    // Don't exit the process, just log the error
  });

  // Handle warnings
  process.on('warning', (warning) => {
    console.warn('Process Warning:', warning.name, warning.message);
    // Don't exit the process, just log the warning
  });

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}

module.exports = { configureProcessHandlers };

