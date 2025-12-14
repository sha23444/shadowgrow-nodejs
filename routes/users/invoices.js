const express = require("express");
const router = express.Router();
const authenticateToken = require("../../middlewars/authenticateToken");
const {
  getAllUserInvoices,
  getUserInvoiceDetails,
  getUserInvoiceStatistics,
  generateUserInvoicePDF,
  getUserInvoicePDF,
  generateInvoiceFromOrderId,
} = require("../../controllers/user/invoices");

// Get all invoices for the authenticated user
router.get("/", authenticateToken, getAllUserInvoices);

// Get user invoice statistics
router.get("/statistics", authenticateToken, getUserInvoiceStatistics);

// Generate invoice PDF from order_id (creates invoice if needed) - MUST be before /:invoice_id routes
router.get("/generate-from-order/:order_id", authenticateToken, generateInvoiceFromOrderId);

// Get invoice details by ID (only for the authenticated user)
router.get("/:invoice_id", authenticateToken, getUserInvoiceDetails);

// Generate PDF invoice for user
router.get("/:invoice_id/pdf", authenticateToken, getUserInvoicePDF);
router.post("/:invoice_id/pdf", authenticateToken, generateUserInvoicePDF);

module.exports = router;
