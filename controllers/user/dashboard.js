const express = require("express");
const { pool } = require("../../config/database");

async function getStats(req, res) {
  const { id } = req.user;

  try {
    // Fetch total orders
    const [[{ total: totalOrders }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM res_orders WHERE user_id = ?`,
      [id]
    );

    // Get wallet balance
    const [[{ balance : walletBalance }]]= await pool.query(
      "SELECT balance FROM res_users WHERE user_id = ?",
      [id]
    );

    // Fetch total packages
    const [[{ count: totalPackages }]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM res_upackages WHERE user_id = ?`,
      [id]
    );

    // Fetch active packages
    const [[{ count: activePackages }]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM res_upackages WHERE user_id = ? AND date_expire > NOW()`,
      [id]
    );

    // Fetch total downloads
    const [[{ count: totalDownloads }]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM res_udownloads WHERE user_id = ?`,
      [id]
    );

    // Construct and send the result
    const result = {
      totalOrders,
       walletBalance, 
      totalPackages,
      activePackages,
      totalDownloads,
    };

    res.status(200).json(result);
  } catch (error) {
//     // console.error("Error executing queries:", error);
    res.status(500).send("Internal Server Error");
  }
}

module.exports = {
  getStats,
};
