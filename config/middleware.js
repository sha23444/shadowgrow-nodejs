/**
 * Express Middleware Configuration
 * Centralized middleware setup for better organization
 */

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const compression = require("compression");
const cors = require("cors");
const requestIp = require('request-ip');
const { formatDatesMiddleware } = require("../middlewars/formatDates");

/**
 * Configure all Express middleware
 * @param {Express} app - Express application instance
 */
function configureMiddleware(app) {
  // Trust proxy (important for getting real IP from Nginx)
  app.set('trust proxy', true);

  // Enable Gzip Compression - Optimized for high traffic
  app.use(compression({
    level: 6, // Balance between compression and CPU (1-9, 6 is optimal)
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Don't compress if client doesn't support it
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use compression for all other requests
      return compression.filter(req, res);
    }
  }));

  // Request IP middleware
  app.use(requestIp.mw());

  // Request timing middleware for performance monitoring
  app.use((req, res, next) => {
    req.startTime = Date.now();
    next();
  });

  // CORS configuration
  // When credentials: true, origin cannot be "*" - must be specific origins
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.APP_BASE_URL,
    process.env.ADMIN_BASE_URL,
  ].filter(Boolean); // Remove undefined values

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, curl)
        if (!origin) {
          return callback(null, true);
        }
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // In development, allow localhost with any port
          if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      },
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
      allowedHeaders: "Content-Type, Authorization, X-Requested-With",
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    })
  );

  // Date formatting middleware - formats all dates in API responses to IST
  app.use(formatDatesMiddleware);

  // Body parser middleware - Optimized for high traffic with size limits
  app.use(express.json({ 
    limit: '10mb', // Limit JSON payload size to prevent DoS
    parameterLimit: 10000 // Limit number of parameters
  }));
  app.use(express.urlencoded({ 
    extended: false,
    limit: '10mb', // Limit URL-encoded payload size
    parameterLimit: 10000
  }));
  app.use(cookieParser());

  // Logger (Only in development mode)
  if (process.env.NODE_ENV === "development") {
    app.use(logger("dev"));
  }

  // Serve static files with caching
  app.use(
    "/static",
    express.static(path.join(__dirname, "../public"), {
      maxAge: "1y",
      etag: false,
      lastModified: false,
    })
  );

  // Serve invoice PDFs
  app.use(
    "/invoices",
    express.static(path.join(__dirname, "../public/invoices"), {
      maxAge: "1d",
      etag: false,
      lastModified: false,
    })
  );

  // Serve uploaded product images from uploads directory
  app.use(
    "/static/media/products",
    express.static(path.join(__dirname, "../uploads/products"), {
      maxAge: "1y", // Cache for 1 year since product images rarely change
      etag: true,
      lastModified: true,
    })
  );

  // View engine setup
  app.set("views", path.join(__dirname, "../views"));
  app.set("view engine", "pug");
}

module.exports = { configureMiddleware };

