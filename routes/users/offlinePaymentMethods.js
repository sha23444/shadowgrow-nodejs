const express = require("express");
const router = express.Router();

const { offlinePaymentMethodsController } = require("../../controllers/user/offlinePaymentMethods");

// Public route - no authentication required
router.get("/", offlinePaymentMethodsController.getPaymentMethods);

module.exports = router;
