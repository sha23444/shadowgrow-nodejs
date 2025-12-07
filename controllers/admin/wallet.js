const { pool } = require("../../config/database");

async function addWallet(req, res) {
  try {
    const { user_id, amount, notes, username } = req.body;

    // Check if the user exists and get the current balance
    const [[user]] = await pool.query(
      `SELECT balance FROM res_users WHERE user_id = ?`,
      [user_id]
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
        status: "error",
      });
    }

    console.log("user", user);

    // Calculate the new balance
    const newBalance = +user.balance + amount;

    // Insert the wallet transaction
    await pool.query(
      `INSERT INTO res_transfers (user_id, amount, username, notes) VALUES (?, ?, ?, ?)`,
      [user_id, amount, username, notes]
    );

    // Update the user's balance in res_users
    await pool.query(`UPDATE res_users SET balance = ? WHERE user_id = ?`, [
      newBalance,
      user_id,
    ]);

    return res.status(201).json({
      message: "Wallet transaction added successfully",
      status: "success",
      data: {
        user_id,
        amount,
        new_balance: newBalance,
      },
    });
  } catch (err) {
    console.error("Error adding wallet transaction:", err);
    return res.status(500).json({
      message: "An error occurred while adding wallet transaction",
      status: "error",
    });
  }
}

module.exports = {
  addWallet,
};
