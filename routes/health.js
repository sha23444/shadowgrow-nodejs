/**
 * Health Check Route
 * Provides system health status including database, Redis, and performance metrics
 */

const express = require("express");
const router = express.Router();

/**
 * Health check endpoint
 * GET /health
 */
router.get("/health", async (req, res) => {
  try {
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      redis: "unknown",
      database: "unknown",
      performance: {
        responseTime: Date.now() - req.startTime || 0
      }
    };

    // Check Redis status
    try {
      const { getRedisClient } = require("../config/smart-cache");
      const client = await getRedisClient();
      
      if (client && client.status === 'ready') {
        try {
          await client.ping();
          health.redis = {
            enabled: true,
            connected: true,
            status: "ready",
            host: "localhost:6379"
          };
        } catch (pingError) {
          health.redis = {
            enabled: true,
            connected: false,
            status: "disconnected",
            error: pingError.message
          };
        }
      } else {
        health.redis = {
          enabled: false,
          connected: false,
          status: "not_initialized"
        };
      }
    } catch (error) {
      health.redis = {
        enabled: false,
        connected: false,
        status: "error",
        error: error.message
      };
    }

    // Check database status
    try {
      const { pool } = require("../config/database");
      const startTime = Date.now();
      await pool.query('SELECT 1');
      const dbResponseTime = Date.now() - startTime;
      
      health.database = {
        status: "connected",
        responseTime: dbResponseTime
      };
    } catch (error) {
      health.database = {
        status: "disconnected",
        error: error.message
      };
    }

    // Determine overall health status
    const isHealthy = health.database.status === "connected" && 
                     (health.redis.enabled === false || health.redis.connected === true);
    
    health.status = isHealthy ? "ok" : "degraded";

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

