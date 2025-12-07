const express = require("express");
const router = express.Router();
const {
  getAllInvoices,
  getInvoiceDetails,
  updateInvoiceStatus,
  getInvoiceStatistics,
  generateInvoicePDF,
  getInvoicePDF,
} = require("../../controllers/admin/invoices");

// Get all invoices with filtering and pagination
router.get("/", getAllInvoices);

// Get invoice statistics for dashboard
router.get("/statistics", getInvoiceStatistics);

// Get invoice details by ID
router.get("/:invoice_id", getInvoiceDetails);

// Update invoice status
router.put("/:invoice_id/status", updateInvoiceStatus);

// Generate PDF invoice
router.get("/:invoice_id/pdf", getInvoicePDF);
router.post("/:invoice_id/pdf", generateInvoicePDF);

module.exports = router;
