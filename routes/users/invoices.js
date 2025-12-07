const express = require("express");
const router = express.Router();
const {
  getAllUserInvoices,
  getUserInvoiceDetails,
  getUserInvoiceStatistics,
  generateUserInvoicePDF,
  getUserInvoicePDF,
} = require("../../controllers/user/invoices");

// Get all invoices for the authenticated user
router.get("/", getAllUserInvoices);

// Get user invoice statistics
router.get("/statistics", getUserInvoiceStatistics);

// Get invoice details by ID (only for the authenticated user)
router.get("/:invoice_id", getUserInvoiceDetails);

// Generate PDF invoice for user
router.get("/:invoice_id/pdf", getUserInvoicePDF);
router.post("/:invoice_id/pdf", generateUserInvoicePDF);

module.exports = router;
