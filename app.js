/**
 * Express Application Setup
 * Main application file - optimized and refactored for better maintainability
 */

// Initialize application (timezone, background services, cron jobs)
require("./config/init");

const express = require("express");
const { configureMiddleware } = require("./config/middleware");
const { configureRoutes } = require("./config/routes");
const { configureProcessHandlers } = require("./config/processHandlers");
const { notFoundHandler, globalErrorHandler } = require("./middlewars/errorHandler");
const { handleDatabaseErrors } = require("./middlewars/databaseErrors");

// Create Express application
const app = express();

// Configure middleware
configureMiddleware(app);

// Configure routes
configureRoutes(app);

// Database error handling middleware (must be before error handler)
app.use(handleDatabaseErrors);

// 404 Not Found handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(globalErrorHandler);

// Configure process event handlers
configureProcessHandlers();

// Export the app for use in other modules (e.g., bin/www)
module.exports = app;
