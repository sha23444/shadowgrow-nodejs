const express = require("express");
const { pool } = require("../../config/database");

async function getAllTransactionList(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";

  const orderStatus = req.query['order-status'];
  const paymentStatus = req.query['payment-status'];
  const paymentMethod = req.query['payment-method'];

  const whereClauses = ['t.order_id LIKE ?'];
  const queryParams = [`%${search}%`];

  if (orderStatus) {
    whereClauses.push('t.order_status = ?');
    queryParams.push(orderStatus);
  }

  if (paymentStatus) {
    whereClauses.push('t.payment_status = ?');
    queryParams.push(paymentStatus);
  }

  if (paymentMethod) {
    whereClauses.push('t.payment_method = ?');
    queryParams.push(paymentMethod);
  }

  const whereSQL = whereClauses.join(' AND ');

  try {
    // Count query
    const totalQuery = `
      SELECT COUNT(*) as total 
      FROM res_transactions AS t 
      WHERE ${whereSQL}
    `;
    // Ensure count query parameters are properly typed
    const countParams = queryParams.map(param => {
      // Convert undefined/null to proper values
      if (param === undefined || param === null) return null;
      // Ensure dates are properly formatted
      if (param instanceof Date) return param;
      // Ensure numbers are properly handled
      if (typeof param === 'number') return param;
      // Ensure strings are strings
      return String(param);
    });
    
    const [[{ total }]] = await pool.execute(totalQuery, countParams);

    // Transactions query
    const transactionsQuery = `
      SELECT 
        t.transaction_id,
        t.order_id,
        t.user_id,
        t.currency,
        t.amount,
        t.exchange_rate,
        t.payment_status,
        t.payment_method,
        t.payment_date,
        t.created_at,
        t.updated_at,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        u.phone
      FROM res_transactions AS t
      LEFT JOIN res_users AS u ON t.user_id = u.user_id
      WHERE ${whereSQL}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    // Ensure query parameters are properly typed
    const transactionsParams = [
      ...queryParams.map(param => {
        // Convert undefined/null to proper values
        if (param === undefined || param === null) return null;
        // Ensure dates are properly formatted
        if (param instanceof Date) return param;
        // Ensure numbers are properly handled
        if (typeof param === 'number') return param;
        // Ensure strings are strings
        return String(param);
      }),
      // Explicitly convert LIMIT and OFFSET to integers
      parseInt(limit, 10),
      parseInt(offset, 10)
    ];
    
    const [transactions] = await pool.execute(transactionsQuery, transactionsParams);

    const result = transactions.map((tx) => ({
      transaction_id: tx.transaction_id,
      order_id: tx.order_id,
      user_id: tx.user_id,
      currency: tx.currency,
      amount: tx.amount,
      exchange_rate: tx.exchange_rate,
      payment_status: tx.payment_status,
      payment_method: tx.payment_method,
      payment_date: tx.payment_date,
      created_at: tx.created_at,
      updated_at: tx.updated_at,
      username: tx.username,
      email: tx.email,
      first_name: tx.first_name,
      last_name: tx.last_name,
      phone: tx.phone,
    }));

    return res.status(200).json({
      status: "success",
      response: {
        data: result,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}




module.exports = { getAllTransactionList };
