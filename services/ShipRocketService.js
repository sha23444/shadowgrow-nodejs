const axios = require('axios');
const { pool } = require('../config/database');

/**
 * Ship Rocket API Service
 * Handles authentication, shipment creation, tracking, and label generation
 * 
 * Note: Ship Rocket does not provide a dedicated sandbox environment.
 * Use test mode with caution in production to avoid real shipments.
 */
class ShipRocketService {
  constructor() {
    // Check for environment-based URL configuration
    // Use test environment if SHIPROCKET_API_URL is set in .env
    // Otherwise, use production URL
    this.baseURL = process.env.SHIPROCKET_API_URL || 'https://apiv2.shiprocket.in/v1/external';
    this.token = null;
    this.tokenExpiry = null;
    this.email = null;
    this.password = null;
    this.testMode = process.env.SHIPROCKET_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
  }

  /**
   * Load Ship Rocket credentials from database
   */
  async loadCredentials() {
    try {
      const [rows] = await pool.execute(
        "SELECT option_name, option_value FROM res_options WHERE option_name = 'shiprocket_email' OR option_name = 'shiprocket_password'"
      );
      
      if (rows.length >= 2) {
        const emailRow = rows.find(r => r.option_name === 'shiprocket_email');
        const passwordRow = rows.find(r => r.option_name === 'shiprocket_password');
        
        this.email = emailRow?.option_value || null;
        this.password = passwordRow?.option_value || null;
        
        // Debug logging (without exposing full password)
        console.log('[SHIPROCKET] Credentials loaded:', {
          email: this.email,
          passwordExists: !!this.password,
          passwordLength: this.password ? this.password.length : 0,
          passwordIsPlaceholder: this.password === '***'
        });
      } else {
        console.log('[SHIPROCKET] Credentials not found in database. Rows found:', rows.length);
        throw new Error('Ship Rocket credentials not configured');
      }

      if (!this.email || !this.password) {
        const missingFields = [];
        if (!this.email) missingFields.push('email');
        if (!this.password) missingFields.push('password');
        throw new Error(`Ship Rocket ${missingFields.join(' and ')} ${missingFields.length > 1 ? 'are' : 'is'} missing. Please configure your credentials in the admin settings.`);
      }

      // Validate password is not the placeholder
      if (this.password === '***' || this.password.trim() === '') {
        throw new Error('Ship Rocket password is not configured. Please enter your password in the admin settings.');
      }
    } catch (error) {
      console.error('Error loading Ship Rocket credentials:', error);
      throw error;
    }
  }

  /**
   * Authenticate with Ship Rocket API
   * Returns auth token (valid for 240 hours / 10 days)
   */
  async authenticate() {
    try {
      // Load credentials if not loaded
      if (!this.email || !this.password) {
        await this.loadCredentials();
      }

      // Check if token is still valid
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      // Trim whitespace from credentials
      const trimmedEmail = this.email.trim();
      const trimmedPassword = this.password.trim();

      // Log authentication attempt (without exposing full password)
      console.log('[SHIPROCKET] Authentication attempt:', {
        baseURL: this.baseURL,
        email: trimmedEmail,
        passwordLength: trimmedPassword.length,
        passwordFirstChar: trimmedPassword.length > 0 ? trimmedPassword[0] : 'empty',
        passwordLastChar: trimmedPassword.length > 0 ? trimmedPassword[trimmedPassword.length - 1] : 'empty',
        hasWhitespace: trimmedPassword !== this.password || trimmedEmail !== this.email,
        testMode: this.testMode
      });

      const response = await axios.post(`${this.baseURL}/auth/login`, {
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (response.data && response.data.token) {
        this.token = response.data.token;
        // Token valid for 240 hours (10 days), set expiry to 9 days for safety
        this.tokenExpiry = Date.now() + (9 * 24 * 60 * 60 * 1000);
        
        if (this.testMode) {
          console.log('[SHIPROCKET TEST MODE] Authentication successful - Using production API for testing');
        }
        
        return this.token;
      }

      throw new Error('Invalid response from Ship Rocket API');
    } catch (error) {
      // Note: ErrorLogger is not available in this service, using console.error
      console.error('Ship Rocket authentication error:', error.response?.data || error.message);
      if (this.testMode) {
        console.log('[SHIPROCKET TEST MODE] Authentication failed:', {
          baseURL: this.baseURL,
          error: error.message
        });
      }
      throw new Error(`Ship Rocket authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Check if service is in test mode
   * @returns {boolean} True if in test mode
   */
  isTestMode() {
    return this.testMode;
  }

  /**
   * Get current API base URL
   * @returns {string} API base URL
   */
  getBaseURL() {
    return this.baseURL;
  }

  /**
   * Get authenticated headers for API requests
   */
  async getAuthHeaders() {
    const token = await this.authenticate();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  /**
   * Create shipment in Ship Rocket
   * @param {Object} shipmentData - Shipment data
   * @returns {Promise<Object>} Ship Rocket response
   */
  async createShipment(shipmentData) {
    try {
      const headers = await this.getAuthHeaders();
      
      // Log test mode requests
      if (this.testMode) {
        console.log('[SHIPROCKET TEST MODE] Creating shipment:', {
          baseURL: this.baseURL,
          url: `${this.baseURL}/orders/create/adhoc`,
          hasData: !!shipmentData,
          orderId: shipmentData?.order_id,
          warning: 'Test mode - This will create real shipments on production API'
        });
      }
      
      const response = await axios.post(
        `${this.baseURL}/orders/create/adhoc`,
        shipmentData,
        { headers }
      );

      if (this.testMode) {
        console.log('[SHIPROCKET TEST MODE] Shipment created:', {
          status: response.status,
          hasData: !!response.data,
          warning: 'Real shipment created on production API'
        });
      }

      return response.data;
    } catch (error) {
      console.error('Ship Rocket create shipment error:', error.response?.data || error.message);
      throw new Error(`Failed to create shipment: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate shipping label for a shipment
   * @param {string} shipmentId - Ship Rocket shipment ID
   * @returns {Promise<Object>} Label data
   */
  async generateLabel(shipmentId) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/courier/generate/label?shipment_id=${shipmentId}`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('Ship Rocket generate label error:', error.response?.data || error.message);
      throw new Error(`Failed to generate label: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate manifest for a shipment
   * @param {string} shipmentId - Ship Rocket shipment ID
   * @returns {Promise<Object>} Manifest data
   */
  async generateManifest(shipmentId) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/manifests/generate?shipment_id=${shipmentId}`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('Ship Rocket generate manifest error:', error.response?.data || error.message);
      throw new Error(`Failed to generate manifest: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Request pickup for a shipment
   * @param {string} shipmentId - Ship Rocket shipment ID
   * @returns {Promise<Object>} Pickup response
   */
  async requestPickup(shipmentId) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.post(
        `${this.baseURL}/orders/create/pickup`,
        { shipment_id: shipmentId },
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('Ship Rocket request pickup error:', error.response?.data || error.message);
      throw new Error(`Failed to request pickup: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Track shipment
   * @param {string} awb - AWB number or shipment ID
   * @returns {Promise<Object>} Tracking data
   */
  async trackShipment(awb) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/courier/track/awb/${awb}`,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('Ship Rocket track shipment error:', error.response?.data || error.message);
      throw new Error(`Failed to track shipment: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get shipping rates
   * @param {Object} rateData - Rate calculation data (pickup_pincode, delivery_pincode, weight, etc.)
   * @returns {Promise<Object>} Available shipping rates
   */
  async getShippingRates(rateData) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.post(
        `${this.baseURL}/shipping/rates`,
        rateData,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('Ship Rocket get rates error:', error.response?.data || error.message);
      throw new Error(`Failed to get shipping rates: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Cancel shipment
   * @param {string} awb - AWB number or shipment IDs array
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelShipment(awb) {
    try {
      const headers = await this.getAuthHeaders();
      
      const payload = Array.isArray(awb) ? { awbs: awb } : { awb: awb };
      
      const response = await axios.post(
        `${this.baseURL}/orders/cancel/shipment/awbs`,
        payload,
        { headers }
      );

      return response.data;
    } catch (error) {
      console.error('Ship Rocket cancel shipment error:', error.response?.data || error.message);
      throw new Error(`Failed to cancel shipment: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get courier serviceability
   * @param {Object} serviceabilityData - Pickup pincode, delivery pincode, weight, etc.
   * @returns {Promise<Object>} Serviceability data
   */
  async checkServiceability(serviceabilityData) {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await axios.get(
        `${this.baseURL}/courier/serviceability/`,
        {
          params: serviceabilityData,
          headers,
        }
      );

      return response.data;
    } catch (error) {
      console.error('Ship Rocket serviceability check error:', error.response?.data || error.message);
      throw new Error(`Failed to check serviceability: ${error.response?.data?.message || error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new ShipRocketService();

