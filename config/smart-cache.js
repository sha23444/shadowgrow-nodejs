// SMART Redis Cache System with Auto-Clearing
// Automatically clears cache when data changes
// Uses local Redis on localhost:6379

const Redis = require("ioredis");

// Redis client instance
let redisClient = null;

// Initialize Redis client - Optimized for MILLION+ daily traffic
function createRedisClient() {
  try {
    // Create Redis client connecting to localhost
    // Optimized configuration for high-volume traffic
    const client = new Redis({
      host: 'localhost',        // Local Redis server
      port: 6379,               // Default Redis port
      retryStrategy: (times) => {
        if (times > 10) {
          console.warn('⚠️ Redis connection failed after 10 retries. App will work without cache.');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false, // Disable offline queue for faster failure detection
      connectTimeout: 3000,      // Reduced from 5000ms to 3000ms for faster connection
      commandTimeout: 3000,       // Reduced from 5000ms to 3000ms for faster operations
      keepAlive: 30000,
      family: 4,
      db: 0,
      // High-traffic optimizations
      enableReadyCheck: true,     // Ensure connection is ready before use
      maxLoadingTimeout: 5000,   // Max time to wait for loading
      enableAutoPipelining: true, // Enable auto-pipelining for better performance
      // Connection pooling for high concurrency
      showFriendlyErrorStack: false, // Disable for better performance in production
    });

    // Event handlers
    client.on("connect", () => console.log('✅ Redis connected to localhost:6379'));
    client.on("ready", () => console.log('✅ Redis ready'));
    client.on("error", (err) => {
      // Only log if not a connection refused error (to reduce noise)
      if (!err.message.includes('ECONNREFUSED')) {
        console.warn('⚠️ Redis error:', err.message);
      }
    });
    client.on("close", () => {
      console.log('Redis connection closed - will reconnect on next request');
    });
    client.on("end", () => {
      console.log('Redis connection ended - will reconnect on next request');
    });

    return client;
  } catch (error) {
    console.warn('Could not initialize Redis:', error.message);
    console.log('ℹ️ App will work without Redis caching.');
    return null;
  }
}

// Initialize Redis client on first call
async function getRedisClient() {
  // Check if we need to create a new client
  if (!redisClient || redisClient.status === 'end') {
    redisClient = createRedisClient();
  }
  
  // Try to ensure connection is ready
  if (redisClient && redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
    try {
      await redisClient.connect();
    } catch (error) {
      // If connect fails and client is not in connecting state, reset it
      if (redisClient.status === 'close' || redisClient.status === 'end') {
        redisClient = null;
      }
    }
  }
  
  return redisClient;
}

// ==========================================
// CACHE OPERATIONS
// ==========================================

// Get from cache
async function get(key) {
  try {
    const client = await getRedisClient();
    if (!client || client.status !== 'ready') return null;
    
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    // Silently fail - app works without cache
    return null;
  }
}

// Set in cache with TTL
async function set(key, value, ttl = 3600) {
  try {
    const client = await getRedisClient();
    if (!client || client.status !== 'ready') return false;
    
    const serialized = JSON.stringify(value);
    if (ttl > 0) {
      await client.setex(key, ttl, serialized);
    } else {
      await client.set(key, serialized);
    }
    return true;
  } catch (error) {
    // Silently fail - app works without cache
    return false;
  }
}

// Delete from cache
async function del(key) {
  try {
    const client = await getRedisClient();
    if (!client || client.status !== 'ready') return false;
    
    await client.del(key);
    return true;
  } catch (error) {
    // Silently fail - app works without cache
    return false;
  }
}

// Check if key exists
async function exists(key) {
  try {
    const client = await getRedisClient();
    if (!client || client.status !== 'ready') return false;
    
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    // Silently fail - app works without cache
    return false;
  }
}

// ==========================================
// SMART CACHE AUTO-CLEARING
// ==========================================

// Auto-clear cache by pattern - OPTIMIZED: Uses SCAN instead of KEYS for non-blocking operation
async function clearByPattern(pattern) {
  try {
    const client = await getRedisClient();
    if (!client || client.status !== 'ready') return 0;
    
    // Use SCAN instead of KEYS to avoid blocking Redis (critical for production)
    // KEYS() blocks Redis and is O(N) - can cause severe performance issues
    const keys = [];
    let cursor = '0';
    
    do {
      const [nextCursor, foundKeys] = await client.scan(
        cursor,
        'MATCH', pattern,
        'COUNT', 100 // Process in batches of 100
      );
      cursor = nextCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');
    
    if (keys.length === 0) {
      return 0;
    }

    const deletedCount = keys.length;
    
    // Delete keys in batches to avoid overwhelming Redis
    const BATCH_SIZE = 100;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      if (batch.length === 1) {
        await client.del(batch[0]);
      } else {
        await client.del(...batch);
      }
    }
    
    console.log(`🗑️  Cleared ${deletedCount} cache keys matching: ${pattern}`);
    return deletedCount;
  } catch (error) {
    console.warn('Cache clear pattern error:', error.message);
    return 0;
  }
}

// Auto-clear specific file cache
async function clearFileCache(fileId, folderId = null) {
  try {
    await clearByPattern(`/api/v1/user/*`);
    await clearByPattern(`files:file:*${fileId}*`);
    await clearByPattern(`files:recent:*`);
    await clearByPattern(`files:paid:*`);
    await clearByPattern(`files:free:*`);
    
    if (folderId) {
      await clearByPattern(`files:folder:*${folderId}*`);
      await clearByPattern(`files:folders:*${folderId}*`);
    }
    
    // Clear all folder listings
    await clearByPattern(`files:folders:*`);
    
    console.log(`✅ File cache cleared for file ID: ${fileId}`);
    return true;
  } catch (error) {
    console.warn('clearFileCache error:', error.message);
    return false;
  }
}

// Auto-clear specific folder cache
async function clearFolderCache(folderId) {
  try {
    await clearByPattern(`/api/v1/user/*`);
    await clearByPattern(`files:folder:*${folderId}*`);
    await clearByPattern(`files:folders:*${folderId}*`);
    await clearByPattern(`files:file:*`);
    
    console.log(`✅ Folder cache cleared for folder ID: ${folderId}`);
    return true;
  } catch (error) {
    console.warn('clearFolderCache error:', error.message);
    return false;
  }
}

// Clear all file-related cache
async function clearAllFileCache() {
  try {
    await clearByPattern(`/api/v1/user/*`);
    await clearByPattern(`files:*`);
    console.log('✅ All file cache cleared');
    return true;
  } catch (error) {
    console.warn('clearAllFileCache error:', error.message);
    return false;
  }
}

// Clear cache for file paths
async function clearFilePathCache(fileId) {
  try {
    await clearByPattern(`files:path:*${fileId}*`);
    return true;
  } catch (error) {
    console.warn('clearFilePathCache error:', error.message);
    return false;
  }
}

// Clear cache when file is added
async function onFileAdded(fileId, folderId) {
  await clearFileCache(fileId, folderId);
  await clearAllFileCache(); // Clear all to show new file in listings
  
  // 🔄 REVALIDATE NEXT.JS CACHE
  const { revalidateFile } = require("../services/nextRevalidation");
  revalidateFile(fileId, folderId).catch(err => console.warn('Next.js revalidation failed:', err.message));
}

// Clear cache when file is updated
async function onFileUpdated(fileId, folderId) {
  await clearFileCache(fileId, folderId);
  
  // 🔄 REVALIDATE NEXT.JS CACHE
  const { revalidateFile } = require("../services/nextRevalidation");
  revalidateFile(fileId, folderId).catch(err => console.warn('Next.js revalidation failed:', err.message));
}

// Clear cache when file is deleted
async function onFileDeleted(fileId, folderId) {
  await clearFileCache(fileId, folderId);
  
  // 🔄 REVALIDATE NEXT.JS CACHE
  const { revalidateFile } = require("../services/nextRevalidation");
  revalidateFile(fileId, folderId).catch(err => console.warn('Next.js revalidation failed:', err.message));
}

// Clear cache when folder is added/updated
async function onFolderChanged(folderId) {
  await clearFolderCache(folderId);
  
  // 🔄 REVALIDATE NEXT.JS CACHE
  const { revalidateFolder } = require("../services/nextRevalidation");
  revalidateFolder(folderId).catch(err => console.warn('Next.js revalidation failed:', err.message));
}

// Clear cache when folder is deleted
async function onFolderDeleted(folderId) {
  await clearFolderCache(folderId);
  await clearAllFileCache(); // Clear all to update listings
  
  // 🔄 REVALIDATE NEXT.JS CACHE
  const { revalidateFolder } = require("../services/nextRevalidation");
  revalidateFolder(folderId).catch(err => console.warn('Next.js revalidation failed:', err.message));
}

// Clear page-related cache
async function clearPageCache(pageId = null, slug = null) {
  try {
    if (pageId) {
      await clearByPattern(`pages:*${pageId}*`);
    }
    if (slug) {
      await clearByPattern(`pages:*${slug}*`);
    }
    // Clear all pages cache when any page changes
    await clearByPattern(`pages:*`);
    console.log(`✅ Page cache cleared for ${pageId || slug || 'all pages'}`);
    return true;
  } catch (error) {
    console.warn('clearPageCache error:', error.message);
    return false;
  }
}

// Clear banner cache
async function clearBannerCache() {
  try {
    await clearByPattern(`banners:*`);
    console.log('✅ Banner cache cleared');
    return true;
  } catch (error) {
    console.warn('clearBannerCache error:', error.message);
    return false;
  }
}

// Clear menu cache
async function clearMenuCache() {
  try {
    await clearByPattern(`menus:*`);
    console.log('✅ Menu cache cleared');
    return true;
  } catch (error) {
    console.warn('clearMenuCache error:', error.message);
    return false;
  }
}

// Clear CMS cache
async function clearCMSCache() {
  try {
    await clearByPattern(`cms:*`);
    console.log('✅ CMS cache cleared');
    return true;
  } catch (error) {
    console.warn('clearCMSCache error:', error.message);
    return false;
  }
}

// Clear product cache - OPTIMIZED: Uses SCAN instead of KEYS
async function clearProductCache(productId = null) {
  try {
    const client = await getRedisClient();
    if (!client || client.status !== 'ready') {
      console.log('⚠️  Redis not ready, skipping cache clear');
      return false;
    }

    console.log(`🗑️  Starting product cache clear${productId ? ` for product ${productId}` : ' for all products'}`);
    
    // Use SCAN with multiple patterns instead of KEYS('*') which blocks Redis
    const patterns = ['product:*', 'products:*', 'product/categories:*'];
    const keysToDelete = new Set();
    
    // Scan for each pattern
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [nextCursor, foundKeys] = await client.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', 100
        );
        cursor = nextCursor;
        foundKeys.forEach(key => keysToDelete.add(key));
      } while (cursor !== '0');
    }
    
    if (keysToDelete.size > 0) {
      // Delete keys in batches
      const keysArray = Array.from(keysToDelete);
      const BATCH_SIZE = 100;
      for (let i = 0; i < keysArray.length; i += BATCH_SIZE) {
        const batch = keysArray.slice(i, i + BATCH_SIZE);
        if (batch.length === 1) {
          await client.del(batch[0]);
        } else {
          await client.del(...batch);
        }
      }
      console.log(`✅ Cleared ${keysToDelete.size} product cache keys`);
    } else {
      console.log(`🗑️  No product cache keys found`);
    }
    
    return true;
  } catch (error) {
    console.warn('clearProductCache error:', error.message);
    return false;
  }
}

// Clear blog cache
async function clearBlogCache(blogId = null) {
  try {
    await clearByPattern(`blogs:*`);
    await clearByPattern(`blog:*`);
    if (blogId) {
      await clearByPattern(`blog:*${blogId}*`);
    }
    console.log(`✅ Blog cache cleared${blogId ? ` for blog ID: ${blogId}` : ''}`);
    return true;
  } catch (error) {
    console.warn('clearBlogCache error:', error.message);
    return false;
  }
}

// Clear video cache
async function clearVideoCache(videoId = null) {
  try {
    await clearByPattern(`videos:*`);
    await clearByPattern(`video:*`);
    if (videoId) {
      await clearByPattern(`video:*${videoId}*`);
    }
    console.log(`✅ Video cache cleared${videoId ? ` for video ID: ${videoId}` : ''}`);
    return true;
  } catch (error) {
    console.warn('clearVideoCache error:', error.message);
    return false;
  }
}

// Clear service cache
async function clearServiceCache(serviceId = null) {
  try {
    await clearByPattern(`services:*`);
    await clearByPattern(`service:*`);
    if (serviceId) {
      await clearByPattern(`service:*${serviceId}*`);
    }
    console.log(`✅ Service cache cleared${serviceId ? ` for service ID: ${serviceId}` : ''}`);
    return true;
  } catch (error) {
    console.warn('clearServiceCache error:', error.message);
    return false;
  }
}

// Clear site settings cache
async function clearSettingsCache() {
  try {
    await clearByPattern(`settings:*`);
    await clearByPattern(`site:*`);
    await clearByPattern(`/api/settings*`);
    console.log('✅ Settings cache cleared');
    return true;
  } catch (error) {
    console.warn('clearSettingsCache error:', error.message);
    return false;
  }
}

// ==========================================
// CACHE MIDDLEWARE
// ==========================================

// Smart cache middleware
async function smartCache(req, res, next) {
  // Check cache first
  const cacheKey = req.originalUrl || req.url;
  
  try {
    const cached = await get(cacheKey);
    
    if (cached) {
      return res.status(200).json(cached);
    }
  } catch (error) {
    console.warn('Cache get error in middleware:', error.message);
  }
  
  // Store original json function
  const originalJson = res.json.bind(res);
  
  // Override json to cache the response
  res.json = function(data) {
    // Cache successful responses only
    if (res.statusCode >= 200 && res.statusCode < 300) {
      set(cacheKey, data, 3600).catch(err => {
        console.warn('Cache set error in middleware:', err.message);
      }); // Cache for 1 hour
    }
    return originalJson(data);
  };
  
  next();
}

// Export
module.exports = {
  // Basic operations
  get,
  set,
  del,
  exists,
  
  // Smart auto-clearing
  clearFileCache,
  clearFolderCache,
  clearAllFileCache,
  clearFilePathCache,
  clearByPattern,
  
  // Event handlers for auto-clearing
  onFileAdded,
  onFileUpdated,
  onFileDeleted,
  onFolderChanged,
  onFolderDeleted,
  
  // Page cache clearing
  clearPageCache,
  
  // Banner cache clearing
  clearBannerCache,
  
  // Menu cache clearing
  clearMenuCache,
  
  // CMS cache clearing
  clearCMSCache,
  
  // Product cache clearing
  clearProductCache,
  
  // Blog cache clearing
  clearBlogCache,
  
  // Video cache clearing
  clearVideoCache,
  
  // Service cache clearing
  clearServiceCache,
  
  // Settings cache clearing
  clearSettingsCache,
  
  // Middleware
  smartCache,
  
  // Get client
  getRedisClient,
};
