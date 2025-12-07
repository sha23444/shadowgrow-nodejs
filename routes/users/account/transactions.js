const express = require("express");
const router = express.Router();
const authenticateUser = require("../../../middlewars/authenticateToken");
const {
  getAllTransactions,
  getTransactionById,
  getTransactionStats,
} = require("../../../controllers/user/account/transactions");

// Apply authentication middleware to all routes
router.use(authenticateUser);

// Get all transactions with pagination, filtering, and sorting
router.get("/", getAllTransactions);

module.exports = router;
