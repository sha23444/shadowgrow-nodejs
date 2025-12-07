const express = require("express");
const router = express.Router();
const {
  getActivationKeys,
  addActivationKeys,
  updateActivationKeyStatus,
  assignActivationKey,
  getActivationKeyStatistics,
  getActivationKeyBatches
} = require("../../controllers/admin/activationKeys");

// Get all activation keys for a product
router.get("/products/:productId/keys", getActivationKeys);

// Get activation key statistics for a product
router.get("/products/:productId/keys/statistics", getActivationKeyStatistics);

// Get activation key batches for a product
router.get("/products/:productId/keys/batches", getActivationKeyBatches);

// Add new activation keys (bulk)
router.post("/products/:productId/keys", addActivationKeys);

// Update activation key status
router.put("/keys/:keyId/status", updateActivationKeyStatus);

// Assign activation key to order
router.post("/orders/:orderId/assign-key", assignActivationKey);

module.exports = router;
