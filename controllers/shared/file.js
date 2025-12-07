const express = require("express");
const { pool } = require("../../config/database");
const NodeCache = require("node-cache");
const fileCache = new NodeCache({ stdTTL: 0 }); // Cache TTL of 1 hour


async function getFolderPath(req, res) {
  let folderId = req.params.folderId;

  try {
    const path = [];

    // Traverse upwards in the folder hierarchy until we reach the root (no parent_id)
    while (folderId) {
      const [rows] = await pool.execute(
        "SELECT folder_id, parent_id, title FROM res_folders WHERE folder_id = ?",
        [folderId]
      );

      // If a folder is found, add it to the path and move to its parent
      if (rows.length > 0) {
        const folder = rows[0];
        path.unshift({ folder_id: folder.folder_id, title: folder.title });
        folderId = folder.parent_id; // Update to the parent ID to move up the hierarchy
      } else {
        // If no folder is found for the given folderId, exit the loop
        break;
      }
    }

    res.status(200).json({
      status: "success",
      path,
    });
  } catch (error) {
    console.error("Error fetching folder path:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getFolderPathByFile(req, res) {
  const fileId = req.params.fileId;

  try {
    // Step 1: Find the folder_id that contains the given file_id
    const [fileRows] = await pool.execute(
      "SELECT folder_id FROM res_files WHERE file_id = ?",
      [fileId]
    );

    // If no folder is found for the given file_id, return a 404
    if (fileRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "File not found",
      });
    }

    // Extract the folder_id from the file's record
    let folderId = fileRows[0].folder_id;

    const path = [];

    // Step 2: Traverse upwards in the folder hierarchy until we reach the root (no parent_id)
    while (folderId) {
      const [rows] = await pool.execute(
        "SELECT folder_id, parent_id, title FROM res_folders WHERE folder_id = ?",
        [folderId]
      );

      // If a folder is found, add it to the path and move to its parent
      if (rows.length > 0) {
        const folder = rows[0];
        path.unshift({ folder_id: folder.folder_id, title: folder.title });
        folderId = folder.parent_id; // Update to the parent ID to move up the hierarchy
      } else {
        // If no folder is found for the given folderId, exit the loop
        break;
      }
    }

    res.status(200).json({
      status: "success",
      path,
    });
  } catch (error) {
    console.error("Error fetching folder path:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getFolderDescription(req, res) {
  const folderId = req.params.folderId;
  try {
    const [rows] = await pool.execute(
      "SELECT title, description FROM res_folders WHERE folder_id = ?",
      [folderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Folder not found",
      });
    }

    const folder = rows[0];
    res.status(200).json({
      status: "success",
      data: folder,
    });
  } catch (error) {
    console.error("Error fetching folder title and description:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}


module.exports = {
  getFolderPath,
  getFolderPathByFile,
  getFolderDescription,
};
