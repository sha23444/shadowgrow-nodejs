const express = require("express");
const router = express.Router();

const SupplierController = require("../../controllers/admin/suppliers");

// Supplier CRUD routes
router.post("/", SupplierController.createSupplier);
router.get("/", SupplierController.getSuppliers);
router.get("/search", SupplierController.searchSuppliersForDropdown);
router.get("/stats", SupplierController.getSupplierStats);
router.get("/reports", SupplierController.getSupplierReports);
router.get("/:id/report", SupplierController.getIndividualSupplierReport);
router.get("/:id", SupplierController.getSupplierById);
router.put("/:id", SupplierController.updateSupplier);
router.delete("/:id", SupplierController.deleteSupplier);

module.exports = router;
