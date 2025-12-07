const express = require('express');
const router = express.Router();
const authenticateAdmin = require('../../middlewars/authenticateAdmin');
const ShipRocketController = require('../../controllers/admin/shiprocket');

// All routes require admin authentication
router.use(authenticateAdmin);

// Settings
router.get('/settings', ShipRocketController.getSettings);
router.post('/settings', ShipRocketController.updateSettings);
router.post('/test-connection', ShipRocketController.testConnection);

// Shipments
router.get('/shipments', ShipRocketController.getShipments); // Get all shipments
router.get('/shipment/:order_id', ShipRocketController.getShipmentDetails); // Get shipment details
router.post('/shipment/:order_id', ShipRocketController.createShipment);
router.get('/shipment/:order_id/label', ShipRocketController.generateLabel);
router.post('/shipment/:order_id/pickup', ShipRocketController.requestPickup);
router.get('/shipment/:order_id/track', ShipRocketController.trackShipment);
router.post('/shipment/:order_id/cancel', ShipRocketController.cancelShipment);

// Rates
router.post('/rates', ShipRocketController.getShippingRates);

module.exports = router;

