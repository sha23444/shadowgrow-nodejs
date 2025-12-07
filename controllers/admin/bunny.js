/**
 * Bunny.net Admin Controller
 * Handles Bunny.net settings and configuration
 */

const { pool } = require("../../config/database");
const BunnyService = require("../../services/BunnyService");
const { ErrorLogger } = require("../../logger");

/**
 * Get Bunny.net settings
 */
async function getSettings(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value 
       FROM res_options 
       WHERE option_name LIKE 'bunny_%'`
    );

    const settings = {};
    rows.forEach(row => {
      const key = row.option_name.replace('bunny_', '');
      if (key === 'api_key' || key === 'stream_api_key') {
        settings[key] = row.option_value ? '***' : null; // Don't expose API keys
      } else {
        settings[key] = row.option_value;
      }
    });

    res.status(200).json({
      status: 'success',
      data: settings,
    });
  } catch (error) {
    console.error('Error getting Bunny.net settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get Bunny.net settings',
    });
  }
}

/**
 * Update Bunny.net settings
 */
async function updateSettings(req, res) {
  try {
    const {
      api_key,
      storage_zone,
      cdn_hostname,
      stream_library_id,
      stream_api_key,
      use_stream,
    } = req.body;

    // Update API key (storage)
    if (api_key && api_key !== '***') {
      await pool.execute(
        "INSERT INTO res_options (option_name, option_value) VALUES ('bunny_api_key', ?) ON DUPLICATE KEY UPDATE option_value = ?",
        [api_key, api_key]
      );
    }

    // Update storage zone
    if (storage_zone !== undefined) {
      await pool.execute(
        "INSERT INTO res_options (option_name, option_value) VALUES ('bunny_storage_zone', ?) ON DUPLICATE KEY UPDATE option_value = ?",
        [storage_zone, storage_zone]
      );
    }

    // Update CDN hostname
    if (cdn_hostname !== undefined) {
      await pool.execute(
        "INSERT INTO res_options (option_name, option_value) VALUES ('bunny_cdn_hostname', ?) ON DUPLICATE KEY UPDATE option_value = ?",
        [cdn_hostname || '', cdn_hostname || '']
      );
    }

    // Update Stream library ID
    if (stream_library_id !== undefined) {
      await pool.execute(
        "INSERT INTO res_options (option_name, option_value) VALUES ('bunny_stream_library_id', ?) ON DUPLICATE KEY UPDATE option_value = ?",
        [stream_library_id || '', stream_library_id || '']
      );
    }

    // Update Stream API key
    if (stream_api_key && stream_api_key !== '***') {
      await pool.execute(
        "INSERT INTO res_options (option_name, option_value) VALUES ('bunny_stream_api_key', ?) ON DUPLICATE KEY UPDATE option_value = ?",
        [stream_api_key, stream_api_key]
      );
    }

    // Update use_stream preference
    if (use_stream !== undefined) {
      await pool.execute(
        "INSERT INTO res_options (option_name, option_value) VALUES ('bunny_use_stream', ?) ON DUPLICATE KEY UPDATE option_value = ?",
        [use_stream ? '1' : '0', use_stream ? '1' : '0']
      );
    }

    res.status(200).json({
      status: 'success',
      message: 'Bunny.net settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating Bunny.net settings:', error);
    ErrorLogger.error('Error updating Bunny.net settings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update Bunny.net settings',
    });
  }
}

/**
 * Test Bunny.net connection
 */
async function testConnection(req, res) {
  try {
    const result = await BunnyService.testConnection();

    res.status(result.success ? 200 : 400).json({
      status: result.success ? 'success' : 'error',
      message: result.message,
      data: {
        baseURL: BunnyService.getBaseURL(),
        testMode: BunnyService.isTestMode(),
        type: result.type,
        warning: result.success && BunnyService.isTestMode()
          ? 'Test mode is enabled - All API calls will use production Bunny.net API. Use with caution.'
          : null,
      },
    });
  } catch (error) {
    console.error('Error testing Bunny.net connection:', error);
    ErrorLogger.error('Error testing Bunny.net connection:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to test connection',
    });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  testConnection,
};

