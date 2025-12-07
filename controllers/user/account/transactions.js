const { pool } = require("../../../config/database");

/**
 * Get all transactions for the authenticated user
 * Includes both payment transactions and wallet transfers
 */
async function getAllTransactions(req, res) {
  const { id } = req.user;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";
  const type = req.query.type || ""; // payment, wallet, or empty for all
  const status = req.query.status || "";
  const sort = req.query.sort || "created_at";
  const order = req.query.order || "desc";

  try {
    let paymentTransactions = [];
    let walletTransactions = [];
    let totalPaymentTransactions = 0;
    let totalWalletTransactions = 0;

    // Fetch payment transactions if type is not "wallet"
    if (type !== "wallet") {
      let paymentWhereClause = "WHERE t.user_id = ?";
      let paymentQueryParams = [id];

      if (search) {
        paymentWhereClause += " AND (t.transaction_id LIKE ? OR t.order_id LIKE ?)";
        paymentQueryParams.push(`%${search}%`, `%${search}%`);
      }

      if (status) {
        paymentWhereClause += " AND t.payment_status = ?";
        paymentQueryParams.push(status);
      }

      // Count payment transactions
      const [[{ total }]] = await pool.execute(
        `SELECT COUNT(*) as total FROM res_transactions AS t ${paymentWhereClause}`,
        paymentQueryParams
      );
      totalPaymentTransactions = total;

      // Fetch payment transactions with proper pagination
      const [payments] = await pool.execute(
        `SELECT 
          t.transaction_id,
          t.order_id,
          t.currency,
          t.amount,
          t.exchange_rate,
          t.payment_status,
          t.payment_method,
          t.payment_date,
          t.gateway_txn_id,
          t.created_at,
          t.updated_at,
          'payment' as transaction_type
        FROM res_transactions AS t
        ${paymentWhereClause}
        ORDER BY t.created_at ${order.toUpperCase()}
        LIMIT ? OFFSET ?`,
        [...paymentQueryParams, limit, offset]
      );

      paymentTransactions = payments;
    }

    // Fetch wallet transactions if type is not "payment"
    if (type !== "payment") {
      let walletWhereClause = "WHERE user_id = ?";
      let walletQueryParams = [id];

      if (search) {
        walletWhereClause += " AND (description LIKE ? OR notes LIKE ?)";
        walletQueryParams.push(`%${search}%`, `%${search}%`);
      }

      if (status) {
        walletWhereClause += " AND type = ?";
        walletQueryParams.push(status);
      }

      // Count wallet transactions
      const [[{ total }]] = await pool.execute(
        `SELECT COUNT(*) as total FROM res_transfers ${walletWhereClause}`,
        walletQueryParams
      );
      totalWalletTransactions = total;

      // Fetch wallet transactions with proper pagination
      const [wallet] = await pool.execute(
        `SELECT 
          id,
          user_id,
          amount,
          type,
          description,
          notes,
          created_at,
          'wallet' as transaction_type
        FROM res_transfers ${walletWhereClause}
        ORDER BY created_at ${order.toUpperCase()}
        LIMIT ? OFFSET ?`,
        [...walletQueryParams, limit, offset]
      );

      walletTransactions = wallet;
    }

    // Combine transactions
    let allTransactions = [...paymentTransactions, ...walletTransactions];
    
    // If we have both types, sort them together
    if (type === "" && paymentTransactions.length > 0 && walletTransactions.length > 0) {
      allTransactions.sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return order.toLowerCase() === "asc" ? dateA - dateB : dateB - dateA;
      });
      
      // Re-apply pagination to the sorted combined results
      const startIndex = 0;
      const endIndex = Math.min(limit, allTransactions.length);
      allTransactions = allTransactions.slice(startIndex, endIndex);
    }

    // Calculate total count
    const totalTransactions = totalPaymentTransactions + totalWalletTransactions;

    return res.status(200).json({
      status: "success",
      data: {
        transactions: allTransactions,
        pagination: {
          page,
          limit,
          totalCount: totalTransactions,
          totalPages: Math.ceil(totalTransactions / limit),
          currentPage: page,
        }
      },
    });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    return res.status(500).json({
      status: "error",
      message: "An error occurred while fetching transactions. Please try again.",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}


module.exports = {
  getAllTransactions,
};
