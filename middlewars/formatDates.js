/**
 * Date Formatting Middleware
 * Automatically formats all date fields in API responses to IST timezone
 * 
 * Features:
 * - Recursively processes all date fields in response objects
 * - Converts dates to IST (Asia/Kolkata) format
 * - Handles arrays, nested objects, and date strings
 * - Preserves other data types
 */

const moment = require('moment-timezone');

// Common date field names to format
const DATE_FIELDS = [
  'created_at',
  'updated_at',
  'deleted_at',
  'timestamp',
  'date',
  'datetime',
  'completed_at',
  'scheduled_at',
  'preferred_date',
  'scheduled_date',
  'completed_date',
  'start_date',
  'end_date',
  'shiprocket_created_at',
  'shiprocket_updated_at',
  'shiprocket_shipped_at',
  'shiprocket_delivered_at',
  'booked_at',
  'cancelled_at',
  'published_at',
  'expires_at',
];

/**
 * Check if a string is a valid date
 */
function isDateString(value) {
  if (typeof value !== 'string') return false;
  
  // Check for common date formats
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/, // ISO format
    /^\d{4}-\d{2}-\d{2}$/, // Date only
    /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/, // MySQL datetime
  ];
  
  return datePatterns.some(pattern => pattern.test(value)) && !isNaN(Date.parse(value));
}

/**
 * Format a date value to IST
 */
function formatDateToIST(value) {
  if (!value) return value;
  
  try {
    // If already a Date object
    if (value instanceof Date) {
      return moment(value).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
    }
    
    // If string that looks like a date
    if (typeof value === 'string' && isDateString(value)) {
      const date = moment(value);
      if (date.isValid()) {
        return date.tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
      }
    }
    
    return value;
  } catch (error) {
    // If formatting fails, return original value
    return value;
  }
}

/**
 * Recursively format dates in an object or array
 */
function formatDatesInObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => formatDatesInObject(item));
  }
  
  // Handle Date objects
  if (obj instanceof Date) {
    return formatDateToIST(obj);
  }
  
  // Handle plain objects
  if (typeof obj === 'object' && obj.constructor === Object) {
    const formatted = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        // Check if this is a known date field
        if (DATE_FIELDS.includes(key.toLowerCase()) || key.toLowerCase().endsWith('_at') || key.toLowerCase().endsWith('_date')) {
          formatted[key] = formatDateToIST(value);
        } else if (typeof value === 'object') {
          // Recursively process nested objects and arrays
          formatted[key] = formatDatesInObject(value);
        } else {
          // Keep other values as-is
          formatted[key] = value;
        }
      }
    }
    
    return formatted;
  }
  
  // Return primitives as-is
  return obj;
}

/**
 * Middleware to format dates in API responses
 */
function formatDatesMiddleware(req, res, next) {
  // Store original json method
  const originalJson = res.json.bind(res);
  
  // Override json method to format dates before sending
  res.json = function(data) {
    // Only format dates for successful responses
    if (res.statusCode >= 200 && res.statusCode < 300 && data) {
      // Format dates in response data
      const formattedData = formatDatesInObject(data);
      return originalJson(formattedData);
    }
    
    // For error responses, send as-is
    return originalJson(data);
  };
  
  next();
}

module.exports = {
  formatDatesMiddleware,
  formatDatesInObject,
  formatDateToIST,
};

