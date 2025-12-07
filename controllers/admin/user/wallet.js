const { pool } = require("../../../config/database");
const crypto = require('crypto');
const NotificationService = require("../../../services/notificationService");

async function getBaseCurrencyInfo() {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value 
       FROM res_options 
       WHERE option_name IN ('currency', 'currency_symbol')`
    );

    const currencyRow = rows.find(row => row.option_name === 'currency');
    const symbolRow = rows.find(row => row.option_name === 'currency_symbol');

    return {
      code: currencyRow ? currencyRow.option_value : 'USD',
      symbol: symbolRow ? symbolRow.option_value : '$',
    };
  } catch (error) {
    console.error('Error fetching base currency info:', error);
    return {
      code: 'USD',
      symbol: '$',
    };
  }
}

async function getTransactions(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;
  const { search = "", user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "user_id is required" });
  }

  try {
    const baseCurrency = await getBaseCurrencyInfo();

    // Base WHERE clause
    let whereClause = `WHERE user_id = ?`;
    const queryParams = [user_id];

    // Add search filter if search term exists
    if (search.trim()) {
      whereClause += `
        AND (
          transfer_id LIKE ? OR 
          notes LIKE ? OR 
          description LIKE ? OR 
          CAST(amount AS CHAR) LIKE ?
        )`;
      queryParams.push(
        `%${search}%`, 
        `%${search}%`, 
        `%${search}%`, 
        `%${search}%`
      );
    }

    // Get total count
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_transfers ${whereClause}`,
      queryParams
    );

    // Get paginated transactions
    const [transactions] = await pool.query(
      `SELECT * FROM res_transfers ${whereClause}
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const normalizedTransactions = transactions.map(tx => {
      const numericAmount = Number(tx.amount || 0);
      return {
        ...tx,
        amount: Number.isFinite(numericAmount) ? numericAmount : Number(tx.amount || 0),
        amount_original: numericAmount,
        currency: baseCurrency.code,
      };
    });

    const response = {
      data: normalizedTransactions,
      currentPage: page,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
      currency: baseCurrency,
    };

    res.status(200).json({
      status: "success",
      response: response,
    });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({
      status: "error",
      message: "An error occurred while fetching transactions.",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

async function addCredit(req, res) {
  const {user_id, amount} = req.body;

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
    // Fetch user's details
    const [[user]] = await connection.query(
      `SELECT user_id, username, email, balance FROM res_users WHERE user_id = ?`,
      [user_id]
    );

    if (!user) {
      connection.release();
      return res.status(404).json({
        message: "User not found.",
        status: "error",
      });
    }

    // Convert user's balance to a number
    const userBalance = parseFloat(user.balance);

    // Update user's balance
    const userNewBalance = userBalance + parseFloat(amount);

    await connection.query(`UPDATE res_users SET balance = ? WHERE user_id = ?`, [
      userNewBalance.toFixed(2),
      user_id,
    ]);

    // Generate descriptions
    const creditDescription = `Credit added to account.`;

    // Log transaction for the user
    await connection.query(
      `INSERT INTO res_transfers (user_id, amount, notes, type, description) VALUES (?, ?, ?, ?, ?)`,
      [user_id, amount,  "Credit added to account.", "credit", creditDescription]
    );

    await connection.commit();
    connection.release();

    // Send admin credit addition notification
    try {
      await NotificationService.createNotification(
        "admin_credit_added",
        "Admin Credit Addition",
        `Admin added ${amount} credits to user ${user.username} (ID: ${user_id})`,
        {
          user_id,
          username: user.username,
          email: user.email,
          amount_added: amount,
          previous_balance: userBalance,
          new_balance: userNewBalance,
          admin_action: "credit_addition"
        },
        true
      );
    } catch (notificationError) {
      console.error("Error creating admin credit notification:", notificationError);
      // Don't fail the operation if notification fails
    }

    return res.status(201).json({
      message: "Balance added successfully!",
      status: "success",
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error("Error adding balance:", err);
    return res.status(500).json({
      message: "An error occurred while adding balance. Please try again.",
      status: "error",
    });
  }
}

async function transferBalance(req, res) {
  const { userId: id } = req.query; // Sender's user ID
  const { receiver_email, amount, notes, transfer_id } = req.body;

  // Input validation
  if (!id || !receiver_email || !amount) {
    return res.status(400).json({
      message: "Missing required fields: userId, receiver_email, amount",
      status: "error",
    });
  }

  // Amount validation
  const transferAmount = parseFloat(amount);
  if (isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({
      message: "Amount must be a positive number.",
      status: "error",
    });
  }

  // Transfer amount limits (adjust as needed)
  const MAX_TRANSFER_AMOUNT = 10000; // $10,000 limit
  if (transferAmount > MAX_TRANSFER_AMOUNT) {
    return res.status(400).json({
      message: `Transfer amount cannot exceed $${MAX_TRANSFER_AMOUNT}`,
      status: "error",
    });
  }

  // Generate transfer ID if not provided (for idempotency)
  const finalTransferId = transfer_id || crypto.randomUUID();

  // Start a transaction
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // Check if this transfer ID already exists (idempotency check)
    const [existingTransfers] = await connection.query(
      `SELECT id FROM res_transfers WHERE notes LIKE ? LIMIT 1`,
      [`%Transfer ID: ${finalTransferId}%`]
    );
    
    if (existingTransfers.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(409).json({
        message: "Transfer already processed",
        status: "error",
        transfer_id: finalTransferId
      });
    }

    // Fetch sender's details with row lock
    const [[sender]] = await connection.query(
      `SELECT user_id, username, email, balance FROM res_users WHERE user_id = ? FOR UPDATE`,
      [id]
    );

    if (!sender) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        message: "Sender not found.",
        status: "error",
      });
    }

    // Convert sender's balance to a number
    const senderBalance = parseFloat(sender.balance);

    if (senderBalance < transferAmount) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        message: `Insufficient balance. Available: $${senderBalance}, Required: $${transferAmount}`,
        status: "error",
      });
    }

    // Fetch receiver's details with row lock
    const [[receiver]] = await connection.query(
      `SELECT user_id, username, email, balance FROM res_users WHERE email = ? OR username = ? FOR UPDATE`,
      [receiver_email, receiver_email]
    );

    if (!receiver) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        message: "The recipient's email or username does not exist.",
        status: "error",
      });
    }

    // Comprehensive self-transfer prevention - check multiple identifiers
    const isSelfTransfer = (
      sender.user_id === receiver.user_id ||
      sender.username.toLowerCase() === receiver.username.toLowerCase() ||
      sender.email.toLowerCase() === receiver.email.toLowerCase() ||
      sender.username.toLowerCase() === receiver_email.toLowerCase() ||
      sender.email.toLowerCase() === receiver_email.toLowerCase()
    );

    if (isSelfTransfer) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        message: "Cannot transfer money to your own account. Self-transfers are not allowed.",
        status: "error",
      });
    }

    // Additional security: Check if receiver_email matches sender's email
    if (sender.email && sender.email.toLowerCase() === receiver_email.toLowerCase()) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        message: "Cannot transfer money to your own email address",
        status: "error",
      });
    }

    // Additional security: Check if receiver_email matches sender's username
    if (sender.username.toLowerCase() === receiver_email.toLowerCase()) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        message: "Cannot transfer money to your own username",
        status: "error",
      });
    }

    // Check for recent transfers (rate limiting)
    const [recentTransfers] = await connection.query(
      `SELECT COUNT(*) as count FROM res_transfers 
       WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [sender.user_id]
    );
    
    if (recentTransfers[0].count >= 10) { // Max 10 transfers per hour
      await connection.rollback();
      connection.release();
      return res.status(429).json({
        message: "Too many transfers. Please wait before making another transfer.",
        status: "error",
      });
    }

    // Convert receiver's balance to a number
    const receiverBalance = parseFloat(receiver.balance);

    // Update sender's balance with safety check
    const senderNewBalance = senderBalance - transferAmount;
    const [senderUpdateResult] = await connection.query(
      `UPDATE res_users SET balance = ? WHERE user_id = ? AND balance >= ?`,
      [senderNewBalance.toFixed(2), id, transferAmount]
    );

    if (senderUpdateResult.affectedRows !== 1) {
      await connection.rollback();
      connection.release();
      return res.status(500).json({
        message: "Failed to update sender balance",
        status: "error",
      });
    }

    // Update receiver's balance
    const receiverNewBalance = receiverBalance + transferAmount;
    const [receiverUpdateResult] = await connection.query(
      `UPDATE res_users SET balance = ? WHERE user_id = ?`,
      [receiverNewBalance.toFixed(2), receiver.user_id]
    );

    if (receiverUpdateResult.affectedRows !== 1) {
      await connection.rollback();
      connection.release();
      return res.status(500).json({
        message: "Failed to update receiver balance",
        status: "error",
      });
    }

    // Verify sender's balance didn't go negative (double-check)
    const [[updatedSender]] = await connection.query(
      `SELECT balance FROM res_users WHERE user_id = ?`,
      [id]
    );
    
    if (parseFloat(updatedSender.balance) < 0) {
      await connection.rollback();
      connection.release();
      return res.status(500).json({
        message: "Transfer would result in negative balance",
        status: "error",
      });
    }

    // Generate descriptions with transfer ID
    const debitDescription = `Credit sent to ${receiver.email} - Transfer ID: ${finalTransferId}`;
    const creditDescription = `Received credit from ${sender.email} - Transfer ID: ${finalTransferId}`;

    // Log transaction for the sender
    const [senderTransaction] = await connection.query(
      `INSERT INTO res_transfers (user_id, amount, username, notes, type, description) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, transferAmount, receiver_email, notes, "debit", debitDescription]
    );

    // Log transaction for the receiver
    const [receiverTransaction] = await connection.query(
      `INSERT INTO res_transfers (user_id, amount, username, notes, type, description) VALUES (?, ?, ?, ?, ?, ?)`,
      [receiver.user_id, transferAmount, sender.username, notes, "credit", creditDescription]
    );

    // Verify that both transaction records were created
    if (!senderTransaction.insertId || !receiverTransaction.insertId) {
      await connection.rollback();
      connection.release();
      return res.status(500).json({
        message: "Failed to create transaction records",
        status: "error",
      });
    }

    await connection.commit();
    connection.release();

    // Send balance transfer notification to admin
    try {
      await NotificationService.createNotification(
        "balance_transfer",
        "Balance Transfer Completed",
        `Balance transfer of ${transferAmount} completed from ${sender.username} to ${receiver.username}`,
        {
          transfer_id: finalTransferId,
          sender_id: id,
          sender_username: sender.username,
          sender_email: sender.email,
          receiver_id: receiver.user_id,
          receiver_username: receiver.username,
          receiver_email: receiver.email,
          amount: transferAmount,
          sender_previous_balance: senderBalance,
          sender_new_balance: senderNewBalance,
          receiver_previous_balance: receiverBalance,
          receiver_new_balance: receiverNewBalance,
          notes: notes,
          admin_action: "balance_transfer"
        },
        true
      );
    } catch (notificationError) {
      console.error("Error creating balance transfer notification:", notificationError);
      // Don't fail the transfer if notification fails
    }

    return res.status(201).json({
      message: "Transfer completed successfully!",
      status: "success",
      data: {
        transfer_id: finalTransferId,
        sender: sender.username,
        receiver: receiver.username,
        amount: transferAmount,
        sender_new_balance: senderNewBalance,
        receiver_new_balance: receiverNewBalance,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error("Error during transfer:", err);
    return res.status(500).json({
      message: "An error occurred while processing the transfer. Please try again.",
      status: "error",
    });
  }
}

async function getTotalBalance(req, res) {
  const {  userId: id } = req.query;

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
      message: "An error occurred while fetching your balance. Please try again.",
      status: "error",
    });
  }
}

module.exports = {
  addCredit,
  transferBalance,
  getTotalBalance,
  getTransactions,
};

