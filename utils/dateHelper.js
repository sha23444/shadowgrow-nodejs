/**
 * Date Helper Utilities
 * Provides consistent date formatting and operations in IST timezone
 * 
 * All dates are automatically in IST (Asia/Kolkata - UTC+5:30)
 */

const moment = require('moment-timezone');

// Default timezone
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Get current date/time in IST
 * @returns {string} Current date/time in IST format: YYYY-MM-DD HH:mm:ss
 */
function getCurrentDateTimeIST() {
  return moment().tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * Get current date in IST
 * @returns {string} Current date in IST format: YYYY-MM-DD
 */
function getCurrentDateIST() {
  return moment().tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD');
}

/**
 * Get current timestamp as ISO string in IST
 * @returns {string} ISO string with IST timezone
 */
function getCurrentTimestampIST() {
  return moment().tz(DEFAULT_TIMEZONE).toISOString(true);
}

/**
 * Format a date to IST
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string (default: 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} Formatted date string
 */
function formatDateIST(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return null;
  return moment(date).tz(DEFAULT_TIMEZONE).format(format);
}

/**
 * Convert any date to IST datetime string
 * @param {Date|string} date - Date to convert
 * @returns {string} IST datetime string: YYYY-MM-DD HH:mm:ss
 */
function toIST(date) {
  if (!date) return null;
  try {
    return moment(date).tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
  } catch (error) {
    return date; // Return original if conversion fails
  }
}

/**
 * Convert MySQL NOW() to IST format
 * Use this instead of NOW() in SQL queries when you need IST
 * @returns {string} Current date/time formatted for MySQL: YYYY-MM-DD HH:mm:ss
 */
function mysqlNOW() {
  return moment().tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
}

/**
 * Convert date to MySQL datetime format in IST
 * @param {Date|string} date - Date to convert
 * @returns {string} MySQL datetime string: YYYY-MM-DD HH:mm:ss
 */
function toMySQLDateTime(date) {
  if (!date) return null;
  try {
    return moment(date).tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
  } catch (error) {
    return date;
  }
}

/**
 * Parse a date string and ensure it's in IST
 * @param {string} dateString - Date string to parse
 * @returns {Date} Date object (JavaScript Date objects don't store timezone, but moment handles IST)
 */
function parseDateIST(dateString) {
  if (!dateString) return null;
  return moment.tz(dateString, DEFAULT_TIMEZONE).toDate();
}

module.exports = {
  getCurrentDateTimeIST,
  getCurrentDateIST,
  getCurrentTimestampIST,
  formatDateIST,
  toIST,
  mysqlNOW,
  toMySQLDateTime,
  parseDateIST,
  DEFAULT_TIMEZONE,
};

