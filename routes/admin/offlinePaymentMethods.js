const express = require("express");
const router = express.Router();

const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const { offlinePaymentMethodsController } = require("../../controllers/admin/offlinePaymentMethods");

// All routes require admin authentication
router.get("/display", authenticateAdmin, offlinePaymentMethodsController.displayAll);
router.get("/", authenticateAdmin, offlinePaymentMethodsController.getAll);
router.get("/:category", authenticateAdmin, offlinePaymentMethodsController.getByCategory);
router.get("/:category/:methodType", authenticateAdmin, offlinePaymentMethodsController.getById);
router.post("/", authenticateAdmin, offlinePaymentMethodsController.create);
router.put("/:category/:methodType", authenticateAdmin, offlinePaymentMethodsController.update);
router.delete("/:category/:methodType", authenticateAdmin, offlinePaymentMethodsController.delete);
router.patch("/:category/:methodType/toggle-status", authenticateAdmin, offlinePaymentMethodsController.toggleStatus);

module.exports = router;
