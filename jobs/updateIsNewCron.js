const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/database");

// Path to log file
const logFilePath = path.join(__dirname, "cron_logs.json");

// Helper function to log cron job activity
function logCronJob(status, table, message) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    status, // "success" or "error"
    table, // "res_folders" or "res_files"
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

// Function to update 'is_new' flag for res_folders
async function updateIsNewForFolders() {
  let connection;
  try {
    connection = await pool.getConnection();

    const query = `
      UPDATE res_folders
      SET is_new = 0
      WHERE created_at < (NOW() - INTERVAL 1 DAY) AND is_new = 1;
    `;

    await connection.execute(query);
    logCronJob("success", "res_folders", "Successfully updated is_new field");
  } catch (error) {
    logCronJob(
      "error",
      "res_folders",
      `Error updating is_new: ${error.message}`
    );
  } finally {
    if (connection) connection.release(); // Properly release the connection back to the pool
  }
}

// Function to update 'is_new' flag for res_files
async function updateIsNewForFiles() {
  let connection;
  try {
    connection = await pool.getConnection();

    const query = `
      UPDATE res_files
      SET is_new = 0
      WHERE created_at < (NOW() - INTERVAL 1 DAY) AND is_new = 1;
    `;

    await connection.execute(query);
    logCronJob("success", "res_files", "Successfully updated is_new field");
  } catch (error) {
    logCronJob("error", "res_files", `Error updating is_new: ${error.message}`);
  } finally {
    if (connection) connection.release(); // Properly release the connection back to the pool
  }
}

// Schedule the cron job to run every minute - RUNS IN BACKGROUND
// Note: Changed to run less frequently for better performance
cron.schedule("*/5 * * * *", () => {
  // Run in background without blocking the server
  setImmediate(async () => {
    try {
      await updateIsNewForFolders();
      await updateIsNewForFiles();
    } catch (error) {
      console.error('Background updateIsNew job error:', error.message);
    }
  });
});
