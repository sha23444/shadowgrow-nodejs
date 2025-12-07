// controllers/cacheController.js
const NodeCache = require('node-cache');
const { getRedisClient, clearByPattern } = require('../../config/smart-cache');

const inMemoryCache = new NodeCache();

function clearRequireCache() {
    Object.keys(require.cache).forEach((key) => {
        delete require.cache[key];
    });
}

function flushInMemoryCache() {
    inMemoryCache.flushAll();
}

async function flushRedisCache() {
    try {
        const client = await getRedisClient();
        
        // Check if Redis client is available
        if (!client) {
            return;
        }
        
        // Wait for the Redis connection to be ready.
        await client.ping(); // A simple way to check if the connection is alive.
        await client.flushall();
    } catch (error) {
//         // console.error('Error flushing Redis cache:', error);
        throw new Error('Failed to clear Redis cache');
    }
}

exports.clearAllCaches = async (req, res) => {
    try {
        clearRequireCache();
        flushInMemoryCache();
        
        // Clear Redis cache if available
        try {
            await flushRedisCache();
        } catch (redisError) {
            console.warn('Redis not available or error clearing:', redisError.message);
            // Continue even if Redis fails
        }
        
        res.status(200).json({ message: 'All caches cleared successfully!' });
    } catch (error) {
//         // console.error('❌ Error clearing caches:', error);
        res.status(500).json({ message: 'Failed to clear caches', error: error.message });
    }
};