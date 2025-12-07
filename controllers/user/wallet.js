const { pool } = require("../../config/database");
const { sendEmail } = require("../../email-service/email-service");


async function transferBalance(req, res) {
  const { id } = req.user; // Sender's user ID
  const { receiver_email, amount, notes : userNote} = req.body;

  const notes = userNote == '' ? 'Transfer Credit' : userNote;

  // Start a transaction
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  // Validate input
  if (amount <= 0 || isNaN(amount)) {
    connection.release();
    return res.status(400).json({
      message: "Amount must be a positive number.",
      status: "error",
    });
  }

  try {
    // Fetch sender's details
    const [[sender]] = await connection.query(
      `SELECT user_id, username, email, balance FROM res_users WHERE user_id = ?`,
      [id]
    );


    if (!sender) {
      connection.release();
      return res.status(404).json({
        message: "Sender not found.",
        status: "error",
      });
    }


    // Fetch receiver's details
    const [[receiver]] = await connection.query(
      `SELECT user_id, username,  email, balance FROM res_users WHERE email = ? or username = ?`,
      [receiver_email, receiver_email]
    );


    if (!receiver) {
      connection.release();
      return res.status(400).json({
        message: "The recipient's email does not exist.",
        status: "error",
      });
    }

    // Check if the sender and receiver are the same with user_id
    if (id === receiver.user_id) {
      connection.release();
      return res.status(400).json({
        message: "You cannot transfer money to yourself.",
        status: "error",
      });
    }

    // Convert sender's balance to a number
    const senderBalance = parseFloat(sender.balance);

    if (senderBalance < amount) {
      connection.release();
      return res.status(400).json({
        message: "Insufficient balance to complete this transfer.",
        status: "error",
      });
    }


    // Convert receiver's balance to a number
    const receiverBalance = parseFloat(receiver.balance);
    const receiverUserId = receiver.user_id;

    // Update sender's balance
    const senderNewBalance = senderBalance - parseFloat(amount);
    await connection.query(
      `UPDATE res_users SET balance = ? WHERE user_id = ?`,
      [senderNewBalance.toFixed(2), id]
    );

    // Update receiver's balance
    const receiverNewBalance = receiverBalance + parseFloat(amount);
    await connection.query(
      `UPDATE res_users SET balance = ? WHERE user_id = ?`,
      [receiverNewBalance.toFixed(2), receiver.user_id]
    );

    // Generate descriptions
    const debitDescription = `Credit sent to ${receiver.email}.`;
    const creditDescription = `Received credit from ${sender.email}.`;

    // Log transaction for the sender
   const [senderTransaction]  = await connection.query(
      `INSERT INTO res_transfers (user_id, amount,  notes, type, description) VALUES (?, ?, ?, ?, ?)`,
      [id, amount, notes, "debit", debitDescription]
    );

    
    const senderTransactionId = senderTransaction.insertId;

    // Log transaction for the receiver
   const [receiverTransaction] = await connection.query(
      `INSERT INTO res_transfers (user_id, amount, notes, type, description) VALUES (?, ?, ?, ?, ?)`,
      [
        receiver.user_id,
        amount,
        notes,
        "credit",
        creditDescription,
      ]
    );


    const receiverTransactionId = receiverTransaction.insertId;

    const data = {
      amount: amount,
      sender: sender.username,
      receiver: receiver_email,
      sender_transaction_id: senderTransactionId,
      receiver_transaction_id: receiverTransactionId,
      sender_balance : senderNewBalance,
      receiver_balance: receiverNewBalance,
      sender_email: sender.email,
      receiver_email: receiver.email,
      transaction_date: new Date(),
    }


    creditTransferSuccessEmail(data).catch(console.error);

    await connection.commit();
    connection.release();

    return res.status(201).json({
      message: "Transfer completed successfully!",
      status: "success",
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error("Error during transfer:", err);
    return res.status(500).json({
      message:
        "An error occurred while processing the transfer. Please try again.",
      status: "error",
    });
  }
}


const creditTransferSuccessEmail = async (data) => {
  let connection;

  try {
    connection = await pool.getConnection();

    const [currencyRow] = await connection.execute(
      "SELECT option_value FROM res_options WHERE option_name = 'currency'"
    );

    const currency = currencyRow[0]?.option_value || "USD";

    // Email to sender
    const senderSubject = `✅ Wallet Transfer Successful – ${currency} ${data.amount} Sent to ${data.receiver}`;
    const senderTemplate = "balance-transfer-sent";
    const senderEmail = data.sender_email;

    await sendEmail(senderEmail, senderSubject, senderTemplate, {
      ...data,
      currency: currency,
    });

    // Email to receiver
    const receiverSubject = `💰 You've Received ${currency} ${data.amount} from ${data.sender}`;
    const receiverTemplate = "balance-transfer-received";
    const receiverEmail = data.receiver_email;

    await sendEmail(receiverEmail, receiverSubject, receiverTemplate, {
      ...data,
      currency: currency,
    });
  } catch (error) {
    console.error("Error in creditTransferSuccessEmail:", error);
  } finally {
    if (connection) connection.release();
  }
};

async function getTotalBalance(req, res) {
  const { id } = req.user;

  try {
    const [[user]] = await pool.query(
      `SELECT balance FROM res_users WHERE user_id = ?`,
      [id]
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
        status: "error",
      });
    }

    return res.status(200).json({
      balance: user.balance,
      status: "success",
    });
  } catch (err) {
    console.error("Error fetching balance:", err);
    return res.status(500).json({
      message:
        "An error occurred while fetching your balance. Please try again.",
      status: "error",
    });
  }
}

async function getTransactions(req, res) {
  const { id } = req.user;
  const { page = 1, limit = 10, search = "", type = "", sort = "date", order = "desc" } = req.query;

  // Ensure `page` and `limit` are numbers and greater than 0
  const pageNumber = parseInt(page, 10);
  const limitSize = parseInt(limit, 10);

  if (
    isNaN(pageNumber) ||
    pageNumber <= 0 ||
    isNaN(limitSize) ||
    limitSize <= 0
  ) {
    return res.status(400).json({
      message: "Pagination parameters must be positive numbers.",
      status: "error",
    });
  }

  const offset = (pageNumber - 1) * limitSize; // Calculate the offset

  try {
    // Build the WHERE clause for filtering
    let whereClause = "WHERE user_id = ?";
    let queryParams = [id];

    // Add search filter
    if (search) {
      whereClause += " AND (description LIKE ? OR notes LIKE ? OR amount LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Add transaction type filter
    if (type && (type === "debit" || type === "credit")) {
      whereClause += " AND type = ?";
      queryParams.push(type);
    }

    // Build ORDER BY clause
    let orderClause = "ORDER BY ";
    if (sort === "amount") {
      orderClause += "amount";
    } else {
      orderClause += "created_at";
    }
    orderClause += order.toLowerCase() === "asc" ? " ASC" : " DESC";

    // Fetch total transactions count with filters
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_transfers ${whereClause}`,
      queryParams
    );

    // Fetch statistics
    const [[{ currentBalance }]] = await pool.query(
      `SELECT balance as currentBalance FROM res_users WHERE user_id = ?`,
      [id]
    );

    const [[{ totalDebits }]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as totalDebits FROM res_transfers WHERE user_id = ? AND type = 'debit'`,
      [id]
    );

    const [[{ totalCredits }]] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as totalCredits FROM res_transfers WHERE user_id = ? AND type = 'credit'`,
      [id]
    );

    const [[{ totalTransactions }]] = await pool.query(
      `SELECT COUNT(*) as totalTransactions FROM res_transfers WHERE user_id = ?`,
      [id]
    );

    // Fetch all transactions with filters and sorting to calculate running balance
    const [allTransactions] = await pool.query(
      `SELECT * FROM res_transfers ${whereClause} ${orderClause}`,
      queryParams
    );

    // Calculate previous balance for each transaction
    // The Balance column should show the balance BEFORE each transaction (like a bank statement)
    // Work backwards from the current balance to calculate what the balance was before each transaction
    let runningBalance = parseFloat(currentBalance) || 0;
    
    // If there's only one transaction, handle it specially
    if (allTransactions.length === 1) {
      const transaction = allTransactions[0];
      const amount = parseFloat(transaction.amount) || 0;
      
      let previousBalance;
      if (transaction.type === 'credit') {
        // For credit, previous balance is what they had before receiving the credit
        // If current balance is 100 and they received 100, they had 0 before
        previousBalance = runningBalance - amount;
      } else if (transaction.type === 'debit') {
        // For debit, previous balance is what they had before spending
        // If current balance is 95 and they spent 5, they had 100 before
        previousBalance = runningBalance + amount;
      }
      
      const transactionsWithBalance = [{
        ...transaction,
        previousBalance: parseFloat(previousBalance.toFixed(2))
      }];
      
      // Apply pagination to the results
      const paginatedTransactions = transactionsWithBalance.slice(offset, offset + limitSize);
      
      return res.status(200).json({
        status: "success",
        data: paginatedTransactions,
        pagination: {
          page: pageNumber,
          limit: limitSize,
          totalPages: Math.ceil(total / limitSize),
          totalCount: total,
        },
        statistics: {
          currentBalance: parseFloat(currentBalance) || 0,
          totalDebits: parseFloat(totalDebits) || 0,
          totalCredits: parseFloat(totalCredits) || 0,
          totalTransactions,
        },
      });
    }
    
    // Process multiple transactions in reverse chronological order (newest first)
    // This way we can work backwards from the current balance
    const reversedTransactions = [...allTransactions].reverse();
    
    const transactionsWithBalance = reversedTransactions.map(transaction => {
      const amount = parseFloat(transaction.amount) || 0;
      
      // Calculate the balance that existed BEFORE this transaction
      let previousBalance;
      
      if (transaction.type === 'credit') {
        // For credit, previous balance = current balance - amount
        previousBalance = runningBalance - amount;
      } else if (transaction.type === 'debit') {
        // For debit, previous balance = current balance + amount
        previousBalance = runningBalance + amount;
      } else {
        previousBalance = runningBalance;
      }
      
      // Update running balance for next iteration
      runningBalance = previousBalance;
      
      return {
        ...transaction,
        previousBalance: parseFloat(previousBalance.toFixed(2))
      };
    });
    
    // Reverse back to original order for display
    const finalTransactions = transactionsWithBalance.reverse();
    
    // Apply pagination to the results
    const paginatedTransactions = finalTransactions.slice(offset, offset + limitSize);

    return res.status(200).json({
      status: "success",
      data: paginatedTransactions,
      pagination: {
        page: pageNumber,
        limit: limitSize,
        totalPages: Math.ceil(total / limitSize),
        totalCount: total,
      },
      statistics: {
        currentBalance: parseFloat(currentBalance) || 0,
        totalDebits: parseFloat(totalDebits) || 0,
        totalCredits: parseFloat(totalCredits) || 0,
        totalTransactions,
      },
    });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    return res.status(500).json({
      message:
        "An error occurred while fetching your transactions. Please try again.",
      status: "error",
    });
  }
}

module.exports = {
  transferBalance,
  getTotalBalance,
  getTransactions,
};