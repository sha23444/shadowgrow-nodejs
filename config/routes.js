/**
 * Route Configuration
 * Centralized route registration for better organization
 */

const express = require("express");

/**
 * Configure all application routes
 * @param {Express} app - Express application instance
 */
function configureRoutes(app) {
  // Home route
  app.get("/", (req, res) => {
    res.render("index", { title: "Express" });
  });

  // Health check route
  const healthRouter = require("../routes/health");
  app.use("/", healthRouter);

  // Import grouped routes
  const userRoutes = require("../routes/users");
  const adminRoutes = require("../routes/admin");
  const apiRoutes = require("../routes/api");

  // Register routes
  app.use("/api", apiRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use("/api/v1/user", userRoutes);
}

module.exports = { configureRoutes };

