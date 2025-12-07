/**
 * Bunny.net Service
 * Handles video uploads, storage, and management via Bunny.net API
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { ErrorLogger } = require('../logger');

class BunnyService {
  constructor() {
    // Bunny.net API credentials from environment or database
    this.apiKey = process.env.BUNNY_API_KEY || null;
    this.storageZoneName = process.env.BUNNY_STORAGE_ZONE || process.env.BUNNY_STORAGE_ZONE_NAME || 'videos';
    this.cdnHostname = process.env.BUNNY_CDN_HOSTNAME || null;
    this.streamLibraryId = process.env.BUNNY_STREAM_LIBRARY_ID || null;
    this.streamApiKey = process.env.BUNNY_STREAM_API_KEY || null;
    this.baseURL = process.env.BUNNY_API_URL || 'https://storage.bunnycdn.com';
    this.streamURL = process.env.BUNNY_STREAM_API_URL || 'https://video.bunnycdn.com';
    
    // Test mode for logging without actual API calls
    this.testMode = process.env.BUNNY_TEST_MODE === 'true' || process.env.NODE_ENV === 'development';
  }

  /**
   * Load credentials from database
   */
  async loadCredentials() {
    try {
      const { pool } = require('../config/database');
      const [rows] = await pool.execute(
        `SELECT option_name, option_value 
         FROM res_options 
         WHERE option_name LIKE 'bunny_%'`
      );

      const settings = {};
      rows.forEach(row => {
        const key = row.option_name.replace('bunny_', '');
        settings[key] = row.option_value;
      });

      if (settings.api_key) this.apiKey = settings.api_key;
      if (settings.storage_zone) this.storageZoneName = settings.storage_zone;
      if (settings.cdn_hostname) this.cdnHostname = settings.cdn_hostname;
      if (settings.stream_library_id) this.streamLibraryId = settings.stream_library_id;
      if (settings.stream_api_key) this.streamApiKey = settings.stream_api_key;

      return settings;
    } catch (error) {
      console.error('Error loading Bunny.net credentials:', error);
      return null;
    }
  }

  /**
   * Test connection to Bunny.net
   */
  async testConnection() {
    try {
      await this.loadCredentials();

      if (!this.apiKey && !this.streamApiKey) {
        return {
          success: false,
          message: 'Bunny.net API key not configured',
        };
      }

      // Test storage API connection
      if (this.apiKey && this.storageZoneName) {
        const response = await axios.get(
          `${this.baseURL}/${this.storageZoneName}/`,
          {
            headers: {
              AccessKey: this.apiKey,
            },
            timeout: 10000,
          }
        );

        if (this.testMode) {
          console.log('[BUNNY TEST MODE] Storage connection successful');
        }

        return {
          success: true,
          message: 'Bunny.net connection successful',
          type: 'storage',
          baseURL: this.baseURL,
          testMode: this.testMode,
        };
      }

      // Test Stream API connection
      if (this.streamApiKey && this.streamLibraryId) {
        const response = await axios.get(
          `${this.streamURL}/library/${this.streamLibraryId}`,
          {
            headers: {
              AccessKey: this.streamApiKey,
            },
            timeout: 10000,
          }
        );

        if (this.testMode) {
          console.log('[BUNNY TEST MODE] Stream connection successful');
        }

        return {
          success: true,
          message: 'Bunny.net Stream connection successful',
          type: 'stream',
          baseURL: this.streamURL,
          testMode: this.testMode,
        };
      }

      return {
        success: false,
        message: 'Bunny.net not properly configured',
      };
    } catch (error) {
      if (this.testMode) {
        console.error('[BUNNY TEST MODE] Connection test failed:', error.message);
      }
      ErrorLogger.error('Bunny.net connection test failed:', error);
      return {
        success: false,
        message: error.response?.data?.Message || error.message || 'Connection failed',
      };
    }
  }

  /**
   * Upload video to Bunny.net Storage
   */
  async uploadVideo(filePath, fileName, options = {}) {
    try {
      await this.loadCredentials();

      if (!this.apiKey || !this.storageZoneName) {
        throw new Error('Bunny.net storage credentials not configured');
      }

      if (this.testMode) {
        console.log('[BUNNY TEST MODE] Upload request:', {
          filePath,
          fileName,
          storageZone: this.storageZoneName,
          warning: 'Test mode - This will upload to Bunny.net production',
        });
      }

      const fileContent = fs.readFileSync(filePath);
      const uploadPath = options.folder ? `${options.folder}/${fileName}` : `videos/${fileName}`;

      const url = `${this.baseURL}/${this.storageZoneName}/${uploadPath}`;

      const response = await axios.put(url, fileContent, {
        headers: {
          AccessKey: this.apiKey,
          'Content-Type': options.contentType || 'video/mp4',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300000, // 5 minutes for large files
      });

      // Construct CDN URL
      const cdnURL = this.cdnHostname 
        ? `https://${this.cdnHostname}/${uploadPath}`
        : `${this.baseURL}/${this.storageZoneName}/${uploadPath}`;

      if (this.testMode) {
        console.log('[BUNNY TEST MODE] Upload successful:', cdnURL);
      }

      return {
        success: true,
        url: cdnURL,
        path: uploadPath,
        fileName: fileName,
      };
    } catch (error) {
      if (this.testMode) {
        console.error('[BUNNY TEST MODE] Upload failed:', error.message);
      }
      ErrorLogger.error('Bunny.net video upload failed:', error);
      throw new Error(error.response?.data?.Message || error.message || 'Upload failed');
    }
  }

  /**
   * Upload video buffer to Bunny.net Storage
   */
  async uploadVideoBuffer(buffer, fileName, options = {}) {
    try {
      await this.loadCredentials();

      if (!this.apiKey || !this.storageZoneName) {
        throw new Error('Bunny.net storage credentials not configured');
      }

      if (this.testMode) {
        console.log('[BUNNY TEST MODE] Upload buffer request:', {
          fileName,
          size: buffer.length,
          storageZone: this.storageZoneName,
        });
      }

      const uploadPath = options.folder ? `${options.folder}/${fileName}` : `videos/${fileName}`;
      const url = `${this.baseURL}/${this.storageZoneName}/${uploadPath}`;

      const response = await axios.put(url, buffer, {
        headers: {
          AccessKey: this.apiKey,
          'Content-Type': options.contentType || 'video/mp4',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300000,
      });

      const cdnURL = this.cdnHostname 
        ? `https://${this.cdnHostname}/${uploadPath}`
        : `${this.baseURL}/${this.storageZoneName}/${uploadPath}`;

      return {
        success: true,
        url: cdnURL,
        path: uploadPath,
        fileName: fileName,
      };
    } catch (error) {
      ErrorLogger.error('Bunny.net buffer upload failed:', error);
      throw new Error(error.response?.data?.Message || error.message || 'Upload failed');
    }
  }

  /**
   * Upload video to Bunny.net Stream (with transcoding)
   */
  async uploadVideoToStream(filePath, fileName, options = {}) {
    try {
      await this.loadCredentials();

      if (!this.streamApiKey || !this.streamLibraryId) {
        throw new Error('Bunny.net Stream credentials not configured');
      }

      if (this.testMode) {
        console.log('[BUNNY TEST MODE] Stream upload request:', {
          filePath,
          fileName,
          libraryId: this.streamLibraryId,
        });
      }

      const fileContent = fs.readFileSync(filePath);
      const uploadURL = `${this.streamURL}/library/${this.streamLibraryId}/videos`;

      // First, create the video entry
      const createResponse = await axios.post(
        uploadURL,
        {
          title: options.title || fileName,
          collectionId: options.collectionId || null,
        },
        {
          headers: {
            AccessKey: this.streamApiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const videoId = createResponse.data.guid;

      // Then upload the video file
      const uploadVideoURL = `${this.streamURL}/library/${this.streamLibraryId}/videos/${videoId}`;
      const uploadResponse = await axios.put(uploadVideoURL, fileContent, {
        headers: {
          AccessKey: this.streamApiKey,
          'Content-Type': 'application/octet-stream',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 600000, // 10 minutes for large files
      });

      // Get video details with embed URL
      const videoDetails = await axios.get(
        `${this.streamURL}/library/${this.streamLibraryId}/videos/${videoId}`,
        {
          headers: {
            AccessKey: this.streamApiKey,
          },
        }
      );

      if (this.testMode) {
        console.log('[BUNNY TEST MODE] Stream upload successful:', videoId);
      }

      return {
        success: true,
        videoId: videoId,
        embedUrl: videoDetails.data.videoLibraryId 
          ? `https://iframe.mediadelivery.net/embed/${videoDetails.data.videoLibraryId}/${videoId}`
          : null,
        thumbnailUrl: videoDetails.data.thumbnailFileName
          ? `https://vz-${this.streamLibraryId}.b-cdn.net/${videoDetails.data.thumbnailFileName}`
          : null,
        playbackUrl: videoDetails.data.videoLibraryId
          ? `https://vz-${this.streamLibraryId}.b-cdn.net/${videoId}/play_720p.mp4`
          : null,
        title: videoDetails.data.title,
        duration: videoDetails.data.length,
      };
    } catch (error) {
      ErrorLogger.error('Bunny.net Stream upload failed:', error);
      throw new Error(error.response?.data?.Message || error.message || 'Stream upload failed');
    }
  }

  /**
   * Delete video from Bunny.net Storage
   */
  async deleteVideo(filePath) {
    try {
      await this.loadCredentials();

      if (!this.apiKey || !this.storageZoneName) {
        throw new Error('Bunny.net storage credentials not configured');
      }

      const url = `${this.baseURL}/${this.storageZoneName}/${filePath}`;

      await axios.delete(url, {
        headers: {
          AccessKey: this.apiKey,
        },
      });

      return { success: true };
    } catch (error) {
      ErrorLogger.error('Bunny.net video deletion failed:', error);
      throw new Error(error.response?.data?.Message || error.message || 'Deletion failed');
    }
  }

  /**
   * List videos from Bunny.net Storage
   */
  async listVideos(folder = 'videos') {
    try {
      await this.loadCredentials();

      if (!this.apiKey || !this.storageZoneName) {
        throw new Error('Bunny.net storage credentials not configured');
      }

      const url = `${this.baseURL}/${this.storageZoneName}/${folder}/`;

      const response = await axios.get(url, {
        headers: {
          AccessKey: this.apiKey,
        },
      });

      return {
        success: true,
        files: response.data || [],
      };
    } catch (error) {
      ErrorLogger.error('Bunny.net list videos failed:', error);
      throw new Error(error.response?.data?.Message || error.message || 'List failed');
    }
  }

  /**
   * Generate secure token URL for protected videos
   */
  generateSecureUrl(videoPath, expiresIn = 3600) {
    const crypto = require('crypto');
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const token = crypto
      .createHash('sha256')
      .update(`${videoPath}${expires}${this.apiKey || this.streamApiKey || ''}`)
      .digest('hex');

    const cdnURL = this.cdnHostname 
      ? `https://${this.cdnHostname}/${videoPath}`
      : `${this.baseURL}/${this.storageZoneName}/${videoPath}`;

    return `${cdnURL}?token=${token}&expires=${expires}`;
  }

  /**
   * Check if test mode is enabled
   */
  isTestMode() {
    return this.testMode;
  }

  /**
   * Get base URL
   */
  getBaseURL() {
    return this.baseURL;
  }
}

module.exports = new BunnyService();

