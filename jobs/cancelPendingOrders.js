const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");

// Path to log file
const logFilePath = path.join(__dirname, "cron_logs.json");

// Helper function to log cron job activity
function logCronJob(status, message) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    status, // "success" or "error"
    job: "cancelPendingOrders", // Job identifier
    message, // Details of the log
  };

  // Read existing log file if it exists
  fs.readFile(logFilePath, "utf8", (err, data) => {
    let logs = [];

    // Handle empty or invalid JSON file
    if (!err && data) {
      try {
        logs = JSON.parse(data);
      } catch (parseErr) {
        console.error("Invalid JSON in log file, starting with a fresh log.");
        logs = [];
      }
    }

    // Append the new log entry
    logs.push(logEntry);

    // Write back to the log file
    fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), (writeErr) => {
      if (writeErr) {
        console.error(`Failed to write log: ${writeErr.message}`);
      }
    });
  });
}

// Function to cancel pending orders that are 24 hours old and not paid
// Changed from 12 hours to 24 hours for better user experience
async function cancelPendingOrders() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Update all orders status to cancelled (8) in one query
    // Only change order_status, not payment_status
    // Changed INTERVAL from 12 HOUR to 24 HOUR
    const updateQuery = `
      UPDATE res_orders
      SET order_status = 8
      WHERE order_status = 1 
      AND payment_status != 2
      AND created_at < (NOW() - INTERVAL 24 HOUR);
    `;

    const [result] = await connection.execute(updateQuery);
    const cancelledCount = result.affectedRows;
    
    await connection.commit();
    
    logCronJob("success", `Successfully cancelled ${cancelledCount} pending orders`);
    console.log(`Cancelled ${cancelledCount} pending orders that were older than 24 hours`);
  } catch (error) {
    if (connection) await connection.rollback();
    logCronJob("error", `Error cancelling pending orders: ${error.message}`);
    console.error("Error cancelling pending orders:", error.message);
  } finally {
    if (connection) connection.release(); // Properly release the connection back to the pool
  }
}

// Schedule the cron job to run every hour - RUNS IN BACKGROUND
// Cron format: minute hour day month dayOfWeek
// "0 * * * *" means run at minute 0 of every hour (every hour)
cron.schedule("0 * * * *", () => {
  // Run in background without blocking the server
  setImmediate(async () => {
    try {
      console.log("Running cancel pending orders cron job");
      logCronJob("info", "Starting cancel pending orders cron job");
      await cancelPendingOrders();
    } catch (error) {
      console.error('Background cancel orders job error:', error.message);
      logCronJob("error", `Background job error: ${error.message}`);
    }
  });
});

module.exports = { cancelPendingOrders };