const express = require("express");
const router = express.Router();

const InventoryController = require("../../controllers/admin/inventory");

// Inventory management routes
router.get("/overview", InventoryController.getInventoryOverview);
router.get("/reports", InventoryController.getInventoryReports);
router.get("/alerts", InventoryController.getInventoryAlerts);
router.get("/product/:id", InventoryController.getProductInventory);
router.post("/product/:id/adjust", InventoryController.adjustInventory);
router.post("/bulk-adjust", InventoryController.bulkAdjustInventory);

module.exports = router;
