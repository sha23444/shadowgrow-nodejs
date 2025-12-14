const { pool } = require("../../config/database");
const slugify = require("slugify");
const { encrypt, decrypt } = require('../utils/encryption');
const validator = require('validator');
const { extractFolderNamesAndSlugs } = require('../utils/folderUtils');
const { ErrorLogger } = require("../../logger");
const NotificationService = require("../../services/notificationService");
const { onFileAdded, onFileUpdated, onFileDeleted, onFolderChanged, onFolderDeleted } = require("../../config/smart-cache");
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Extensions you want to remove
const archiveExtensions = [
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tar.gz', 'tar.bz2', 'tar.xz'
];

function removeFileExtensions(title = '') {
  let cleanTitle = title.trim().toLowerCase();

  for (const ext of archiveExtensions.sort((a, b) => b.length - a.length)) {
    const regex = new RegExp(`\\.${ext}$`, 'i');
    if (regex.test(cleanTitle)) {
      cleanTitle = cleanTitle.replace(regex, '');
      break;
    }
  }

  return cleanTitle;
}

async function getFolderPath(folderId) {
  let path = [];

  while (folderId) {
    const [rows] = await pool.execute(
      "SELECT folder_id, parent_id, title, slug FROM res_folders WHERE folder_id = ?",
      [folderId]
    );

    if (rows.length > 0) {
      const folder = rows[0];
      path.unshift({ folder_id: folder.folder_id, title: folder.title, slug: folder.slug });
      folderId = folder.parent_id;
    } else {
      break;
    }
  }

  return path;
}

async function getAllFoldersFiles(req, res) {
  const connection = await pool.getConnection();
  try {
      const folderId = req.query.folder_id || 0;
      const search = req.query.search || '';
      const hasSearch = Boolean(search);
      const searchTerm = hasSearch ? `%${search}%` : null;

      // Sorting parameters
      const sort = req.query.sort || 'name'; // 'name', 'date', or 'size'
      const order = req.query.order || 'asc'; // 'asc' or 'desc'

      // Validate sorting parameters
      const validSorts = ['name', 'date', 'size'];
      const validOrders = ['asc', 'desc'];

      if (!validSorts.includes(sort)) {
          return res.status(400).json({
              status: "error",
              message: "Invalid sort parameter. Use 'name', 'date', or 'size'."
          });
      }

      if (!validOrders.includes(order)) {
          return res.status(400).json({
              status: "error",
              message: "Invalid order parameter. Use 'asc' or 'desc'."
          });
      }

      const path = await getFolderPath(folderId);

      // Prepare folder query with sorting
      let folderQuery = `
    SELECT folder_id, parent_id, title, slug, description, thumbnail, is_active, is_new, created_at
    FROM res_folders 
    WHERE parent_id = ?`;
      const folderParams = [folderId];

      if (hasSearch) {
          folderQuery += " AND title LIKE ?";
          folderParams.push(searchTerm);
      }

      // Add sorting for folders
      let folderSortField;
      if (sort === 'name') {
          folderSortField = 'title';
      } else if (sort === 'date') {
          folderSortField = 'created_at';
      } else if (sort === 'size') {
          // For folders, we'll sort by creation date when size is requested
          // since folders don't have a direct size field
          folderSortField = 'created_at';
      }
      folderQuery += ` ORDER BY ${folderSortField} ${order.toUpperCase()}`;

      // Prepare file query with sorting
      let fileQuery = `
    SELECT * FROM res_files 
    WHERE folder_id = ?`;
      const fileParams = [folderId];

      if (hasSearch) {
          fileQuery += " AND title LIKE ?";
          fileParams.push(searchTerm);
      }

      // Add sorting for files
      let fileSortField;
      if (sort === 'name') {
          fileSortField = 'title';
      } else if (sort === 'date') {
          fileSortField = 'created_at';
      } else if (sort === 'size') {
          fileSortField = 'size';
      }
      fileQuery += ` ORDER BY ${fileSortField} ${order.toUpperCase()}`;

      // Execute both queries in parallel
      const [
          [folderRows],
          [fileRows]
      ] = await Promise.all([
          pool.execute(folderQuery, folderParams),
          pool.execute(fileQuery, fileParams),
      ]);

      // Extract file IDs and fetch tags if any
      const fileIds = fileRows.map(f => f.file_id);
      let tagsByFileId = {};

      if (fileIds.length) {
          const [tags] = await connection.query(
              `SELECT tm.ref_id, t.tag
       FROM tag_map tm
       JOIN tags t ON tm.tag_id = t.id
       WHERE tm.ref_type = 'file' AND tm.ref_id IN (${fileIds.map(() => '?').join(',')})`,
              fileIds
          );

          // Group tags by file ID
          for (const {
                  ref_id,
                  tag
              } of tags) {
              if (!tagsByFileId[ref_id]) tagsByFileId[ref_id] = [];
              tagsByFileId[ref_id].push(tag);
          }
      }

      // Attach tags to files
      const files = fileRows.map(file => ({
          ...file,

          password: file.password ? decrypt(file.password) : null,
          tags: tagsByFileId[file.file_id] || []
      }));

      // Optimized: Get all folder counts in a single query instead of N+1 queries
      const folderIds = folderRows.map(f => f.folder_id);
      let foldersWithCounts = folderRows;

      if (folderIds.length > 0) {
          // Single query to get file counts for all folders
          const [fileCounts] = await connection.query(
              `SELECT folder_id, COUNT(*) as count 
               FROM res_files 
               WHERE folder_id IN (${folderIds.map(() => '?').join(',')})
               GROUP BY folder_id`,
              folderIds
          );

          // Single query to get subfolder counts for all folders
          const [subfolderCounts] = await connection.query(
              `SELECT parent_id as folder_id, COUNT(*) as count 
               FROM res_folders 
               WHERE parent_id IN (${folderIds.map(() => '?').join(',')})
               GROUP BY parent_id`,
              folderIds
          );

          // Create lookup maps for O(1) access
          const fileCountMap = new Map(fileCounts.map(fc => [fc.folder_id, Number(fc.count)]));
          const subfolderCountMap = new Map(subfolderCounts.map(sc => [sc.folder_id, Number(sc.count)]));

          // Attach counts to folders
          foldersWithCounts = folderRows.map(folder => {
              const fileCount = fileCountMap.get(folder.folder_id) || 0;
              const subfolderCount = subfolderCountMap.get(folder.folder_id) || 0;
              return {
                  ...folder,
                  counts: {
                      files: fileCount,
                      folders: subfolderCount,
                      total: fileCount + subfolderCount
                  }
              };
          });
      }

      res.status(200).json({
          status: "success",
          response: {
              path,
              folders: foldersWithCounts,
              files,
              sorting: {
                  sort: sort,
                  order: order,
                  applied: {
                      folders: sort === 'size' ? `created_at ${order.toUpperCase()} (folders don't have size)` : `${folderSortField} ${order.toUpperCase()}`,
                      files: `${fileSortField} ${order.toUpperCase()}`
                  }
              }
          },
      });
  } catch (err) {
      console.error("Error fetching folders and files:", err.stack || err);
      res.status(500).json({
          status: "error",
          message: "Internal Server Error"
      });
  } finally {
      connection.release();
  }
}


async function addFolder(req, res) {
  try {
    const {
      title,
      parent_id,
      description = "",
      thumbnail = null,
      is_active = 1,
      is_new = 1,
      slug = null,  
      
    } = req.body;

    if (!title) {
      return res.status(400).json({
        status: "error",
        message: "Please provide a title for the folder.",
      });
    }

    // Check if a folder with the same title and parent_id already exists
    const checkQuery = `
      SELECT folder_id FROM res_folders WHERE title = ? AND parent_id = ?
    `;
    const [rows] = await pool.execute(checkQuery, [title, parent_id]);

    if (rows.length > 0) {
      return res.status(400).json({
        status: "error",
        message: "A folder with the same title already exists under this parent folder.",
      });
    }

    // Create initial slug from title if not provided
    let finalSlug = (slug && slug.trim() !== '') ? slug.trim() : slugify(title, {
      lower: true,
      replacement: '-',
      remove: /[*+~.()'"!:@]/g,
    });

    // Check if slug already exists within the same parent folder
    let uniqueSlug = finalSlug;
    let counter = 1;

    while (true) {
      const [slugRows] = await pool.execute(
        `SELECT folder_id FROM res_folders WHERE slug = ? AND parent_id = ?`,
        [uniqueSlug, parent_id]
      );

      if (slugRows.length === 0) {
        break; // Slug is unique within this parent folder
      }

      uniqueSlug = `${finalSlug}-${counter}`;
      counter++;
    }

    // Insert the new folder
    const insertQuery = `
      INSERT INTO res_folders (title, parent_id, description, thumbnail, is_active, is_new, slug)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [insertResult] = await pool.execute(insertQuery, [
      title,
      parent_id,
      description,
      thumbnail,
      is_active,
      is_new,
      uniqueSlug,
    ]);

    // send notification to admin
    await NotificationService.createNotification(
      "folder_added",
      "Folder Added",
      `Folder ${title} has been added by admin`,
      { folder_id: insertResult.insertId }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear related cache when folder is added
    await onFolderChanged(insertResult.insertId);

    res.status(200).json({
      status: "success",
      message: "Folder added successfully",
    });
  } catch (err) {
    console.error("Error adding folder:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        status: "error",
        message: "A folder with this title already exists.",
      });
    }
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'admin_files',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      endpoint: '/addFolder'
    });
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function updateFolder(req, res) {
  try {
    const { folderId } = req.params; // Get the folder ID from the request parameters
    const { title, description, thumbnail, is_active, is_new, slug } = req.body;

    // Check if folderId is provided
    if (!folderId) {
      return res.status(400).json({
        status: "error",
        message:
          "Folder ID is required. Please refresh the page and try again.",
      });
    }

    // Get current parent_id to check for duplicate titles within the same parent
    const [currentFolder] = await pool.execute(
      `SELECT parent_id, slug FROM res_folders WHERE folder_id = ?`,
      [folderId]
    );

    if (currentFolder.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Folder not found.",
      });
    }

    const currentParentId = currentFolder[0].parent_id;
    const currentSlug = currentFolder[0].slug;

    // Check if a folder with the same title already exists under the same parent
    const checkQuery = `
      SELECT folder_id FROM res_folders 
      WHERE title = ? AND parent_id = ? AND folder_id != ?
    `;
    const [rows] = await pool.execute(checkQuery, [title, currentParentId, folderId]);

    if (rows.length > 0) {
      return res.status(400).json({
        status: "error",
        message:
          "A folder with the same title already exists under the same parent.",
      });
    }

    // Handle slug update if provided
    let finalSlug = currentSlug; // Keep current slug if not provided
    if (slug && slug !== currentSlug && slug.trim() !== '') {
      // Create slug from provided slug or title
      let baseSlug = slug.trim() || slugify(title, {
        lower: true,
        replacement: '-',
        remove: /[*+~.()'"!:@]/g,
      });

      // Check if slug already exists within the same parent folder
      let uniqueSlug = baseSlug;
      let counter = 1;

      while (true) {
        const [slugRows] = await pool.execute(
          `SELECT folder_id FROM res_folders WHERE slug = ? AND parent_id = ? AND folder_id != ?`,
          [uniqueSlug, currentParentId, folderId]
        );

        if (slugRows.length === 0) {
          break; // Slug is unique within this parent folder
        }

        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      finalSlug = uniqueSlug;
    }

    // Execute the SQL query to update the folder data in the database
    const query = `
      UPDATE res_folders 
      SET 
        title = ?,
        description = ?,
        thumbnail = ?,
        is_active = ?,
        is_new = ?,
        slug = ?
      WHERE folder_id = ?
    `;

    const [result] = await pool.execute(query, [
      title,
      description,
      thumbnail,
      is_active,
      is_new,
      finalSlug,
      folderId, // Folder ID is used in the WHERE clause
    ]);


    if (result.affectedRows === 0) {
      // If no rows were affected, check if it's because no changes were made
      // Check if the folder exists but no changes were made
      const [checkFolder] = await pool.execute(
        `SELECT folder_id FROM res_folders WHERE folder_id = ?`,
        [folderId]
      );
      
      if (checkFolder.length > 0) {
        // Folder exists but no changes were made
        return res.status(200).json({
          status: "success",
          message: "Folder updated successfully (no changes were needed).",
        });
      } else {
        // Folder doesn't exist
        return res.status(404).json({
          status: "error",
          message: "Folder not found.",
        });
      }
    }

    // send notification to admin

    await NotificationService.createNotification(
      "folder_updated",
      "Folder Updated",
      `Folder ${title} has been updated by admin`,
      { folder_id: folderId }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear related cache when folder is updated
    await onFolderChanged(folderId);

    // Send a success response to the client
    res.status(200).json({
      status: "success",
      message: "Folder updated successfully",
    });
  } catch (err) {
    // Handle any errors that occur during the execution of the SQL query
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'admin_files',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      endpoint: '/updateFolder'
    });
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function deleteFolder(req, res) {
  const folderId = req.params.folderId;

  try {
    // check if folder id exist

    if (!folderId) {
      return res.status(400).json({
        status: "error",
        message: "Folder id is missing. Please refresh page and try again ",
      });
    }
    const [result] = await pool.execute(
      "DELETE FROM res_folders WHERE folder_id = ?",
      [folderId]
    );

    if (result.affectedRows === 0) {
      // Folder not found or could not be deleted
      return res.status(404).json({
        status: "error",
        message: "Folder not found or could not be deleted.",
      });
    }

    // send notification to admin
    await NotificationService.createNotification(
      "folder_deleted",
      "Folder Deleted",
      `Folder has been deleted by admin`,
      { folder_id: folderId }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear related cache when folder is deleted
    await onFolderDeleted(folderId);

    // Folder deleted successfully
    return res.status(200).json({
      status: "success",
      message: "Folder deleted successfully.",
    });
  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'admin_files',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      endpoint: '/deleteFolder'
    });
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function addFile(req, res) {
  const connection = await pool.getConnection();
  try {
    const {
      title,
      folder_id,
      description,
      body = null,
      thumbnail,
      image,
      size = 1024,
      price = 0.0,
      url,
      url_type,
      is_active = 1,
      is_new = 1,
      is_featured = 1,
      tags = [],
      password = null,
      is_password = false,
      slug,
      meta_title = null,
      meta_description = null,
      meta_keywords = null,
    } = req.body;

    // === VALIDATIONS ===
    if (!title?.trim()) {
      return res.status(400).json({ status: 'fail', message: 'Title is required and must be a non-empty string.' });
    }

    if (!url_type?.trim()) {
      return res.status(400).json({ status: 'error', message: 'URL type cannot be empty.' });
    }

    if (!url?.trim()) {
      return res.status(400).json({ status: 'error', message: 'Please provide a valid URL.' });
    }

    if (!validator.isURL(url, { require_protocol: true }) || url.includes("''")) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid URL format. Include http:// or https:// and avoid using double single quotes.',
      });
    }

    if (size === 0) {
      return res.status(400).json({ status: 'error', message: 'Please provide a file size.' });
    }

    if (is_featured && parseFloat(price) > 0) {
      return res.status(400).json({
        status: 'error',
        message: "You cannot select both 'featured' and 'paid' options.",
      });
    }

    // Check for duplicate title in folder
    const [existing] = await connection.execute(
      `SELECT file_id FROM res_files WHERE title = ? AND folder_id = ?`,
      [title.trim(), folder_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'File with the same title already exists in this folder.',
      });
    }

    const finalThumbnail = thumbnail?.trim() || null;
    const finalImage = image?.trim() || null;
    const priceDecimal = parseFloat(price ?? 0).toFixed(2);
    const encryptedPassword = is_password ? encrypt(password) : null;

    await connection.beginTransaction();

    // Generate unique slug
    let baseSlug = (slug && slug.trim() !== '') ? slug.trim() : slugify(title, { lower: true, replacement: '-', remove: /[*+~.()_'"!:@]/g });
    let counter = 1;
    let finalSlug = baseSlug;

    while (true) {
      const [check] = await connection.execute(`SELECT file_id FROM res_files WHERE slug = ? AND folder_id = ?`, [finalSlug, folder_id]);
      if (check.length === 0) break;
      finalSlug = `${baseSlug}-${counter++}`;
    }

    // Format all values to ensure correct types
    const values = [
      Number(folder_id) || 0,  // folder_id as number
      String(title).trim(),    // title as string
      String(finalSlug),       // slug as string
      description ? String(description) : null,  // description as string or null
      body ? String(body) : null,               // body as string or null
      finalThumbnail,          // thumbnail as string or null
      finalImage,              // image as string or null
      Number(size) || 0,       // size as number
      String(priceDecimal),    // price as string
      String(url).trim(),      // url as string
      String(url_type).trim(), // url_type as string
      Boolean(is_active) ? 1 : 0,  // is_active as 1 or 0
      Boolean(is_new) ? 1 : 0,     // is_new as 1 or 0
      Boolean(is_featured) ? 1 : 0, // is_featured as 1 or 0
      encryptedPassword,       // password as string or null
      meta_title ? String(meta_title) : null,   // meta_title as string or null
      meta_description ? String(meta_description) : null, // meta_description as string or null
      meta_keywords ? String(meta_keywords) : null        // meta_keywords as string or null
    ];

    const [insertResult] = await connection.execute(
      `INSERT INTO res_files 
      (folder_id, title, slug, description, body, thumbnail, image, size, price, url, url_type, is_active, is_new, is_featured, password, meta_title, meta_description, meta_keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );
    

    const newFileId = insertResult.insertId;

    // === TAG HANDLING ===
    if (Array.isArray(tags) && tags.length > 0) {
      for (const tag of tags) {
        // Check if tag exists
        let [existingTag] = await connection.execute(`SELECT id FROM tags WHERE tag = ?`, [tag]);
        let tagId;
        
        if (existingTag.length > 0) {
          tagId = existingTag[0].id;
        } else {
          // Insert new tag if it doesn't exist
          const [insertResult] = await connection.execute(`INSERT INTO tags (tag) VALUES (?)`, [tag]);
          tagId = insertResult.insertId;
        }

        // Check if tag mapping already exists for this file
        const [existingMapping] = await connection.execute(
          `SELECT tag_id FROM tag_map WHERE tag_id = ? AND ref_id = ? AND ref_type = 'file'`,
          [tagId, newFileId]
        );

        // Only insert if mapping doesn't already exist
        if (existingMapping.length === 0) {
          await connection.execute(
            `INSERT INTO tag_map (tag_id, ref_id, ref_type) VALUES (?, ?, ?)`,
            [tagId, newFileId, 'file']
          );
        }
      }
    }

    await connection.commit();

    // send notification to admin
    await NotificationService.createNotification(
      "file_added",
      "File Added",
      `File ${title} has been added by admin`,
      { file_id: newFileId }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear related cache when file is added
    await onFileAdded(newFileId, folder_id);

    res.status(200).json({
      status: 'success',
      message: 'File added successfully',
      file_id: newFileId,
    });

  } catch (err) {
    await connection.rollback();
    // send error log to error logger
    await ErrorLogger.logError(err, "Error adding file", "error");
    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
      error: err.message,
    });
  } finally {
    connection.release();
  }
}


async function updateFile(req, res) {
  const connection = await pool.getConnection();
  try {
    const { fileId } = req.params;
    

    if (!fileId) {
      return res.status(400).json({
        status: "fail",
        message: "Missing file ID.",
      });
    }

    let {
      title,
      folder_id,
      description,
      body,
      thumbnail,
      image,
      size,
      price,
      url,
      url_type,
      is_active,
      is_new,
      is_featured,
      tags,
      tagIds = null,
      is_password = false,
      password = null,
      meta_title,
      meta_keywords,
      slug,
      meta_description
    } = req.body;

    // === VALIDATIONS ===
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        status: 'fail',
        message: 'Title is required and must be a non-empty string.',
      });
    }

    const priceDecimal = price !== undefined && price !== null
      ? parseFloat(price).toFixed(2)
      : "0.00";


    if (is_featured && parseFloat(price) > 0) {
      return res.status(400).json({
        status: "error",
        message: "You cannot select both 'featured' and 'paid' options."
      });
    }


    if (!url_type || url_type.trim() === '') {
      return res.status(400).json({
        status: "error",
        message: "URL type cannot be an empty string. Please provide a valid URL type."
      });
    }

    if (!url || url.trim() === '') {
      return res.status(400).json({
        status: "error",
        message: "Please provide a valid URL."
      });
    }

    if (size === 0) {
      return res.status(400).json({
        status: "error",
        message: "Please provide a file size."
      });
    }

    if (url && (!validator.isURL(url, { require_protocol: true }) || url.includes("''"))) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid URL format. Include http:// or https:// and avoid using double single quotes.',
      });
    }

    // Convert empty strings to null
    if (thumbnail === '') thumbnail = null;
    if (image === '') image = null;

    const tagsToStore = Array.isArray(tags) ? tags.join('+') : null;
    const encryptedPassword = is_password ? encrypt(password) : null;

    const fieldsToUpdate = {
      folder_id,
      title,
      description,
      body,
      thumbnail,
      image,
      size,
      price: priceDecimal,
      url,
      url_type,
      is_active,
      is_new,
      is_featured,
      password: encryptedPassword,
      meta_title,
      meta_keywords,
      meta_description,
      slug
    };

    // Remove undefined values
    const validFields = Object.entries(fieldsToUpdate)
      .filter(([_, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    if (Object.keys(validFields).length === 0 && !tagsToStore && (!Array.isArray(tagIds) || tagIds.length === 0)) {
      return res.status(400).json({
        status: "fail",
        message: "No valid fields to update.",
      });
    }

    // Handle slug update with uniqueness checking within the same folder
    if (slug && slug.trim() !== '') {
      // Get current file's folder_id for slug uniqueness checking
      const [currentFile] = await connection.execute(
        `SELECT folder_id FROM res_files WHERE file_id = ?`,
        [fileId]
      );
      
      if (currentFile.length > 0) {
        const currentFolderId = currentFile[0].folder_id;
        let baseSlug = slug.trim();
        let uniqueSlug = baseSlug;
        let counter = 1;

        // Check for slug uniqueness within the same folder
        while (true) {
          const [slugCheck] = await connection.execute(
            `SELECT file_id FROM res_files WHERE slug = ? AND folder_id = ? AND file_id != ?`,
            [uniqueSlug, currentFolderId, fileId]
          );
          
          if (slugCheck.length === 0) break; // Slug is unique within this folder
          uniqueSlug = `${baseSlug}-${counter++}`;
        }
        
        fieldsToUpdate.slug = uniqueSlug;
      }
    }

    const updateKeys = Object.keys(validFields);
    const query = `UPDATE res_files SET ${updateKeys.map(key => `${key} = ?`).join(", ")} WHERE file_id = ?`;
    const values = [...Object.values(validFields), fileId];

    await connection.beginTransaction();

    let fileUpdated = false;
    let tagsUpdated = false;

    if (updateKeys.length > 0) {
      const [result] = await connection.execute(query, values);
      
      if (result.affectedRows > 0) {
        fileUpdated = true;
      }
    }

    // === TAG UPDATE HANDLING ===
    if (Array.isArray(tags)) {
      // 1. Delete existing tag_map entries for the file
      await connection.execute(
        `DELETE FROM tag_map WHERE ref_type = 'file' AND ref_id = ?`,
        [fileId]
      );

      // 2. Prepare a set to avoid duplicate inserts
      const uniqueTags = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
      const processedTagIds = new Set(); // Track processed tag IDs to avoid duplicates

      for (const tag of uniqueTags) {
        // Check if tag exists
        const [existingTag] = await connection.execute(
          `SELECT id FROM tags WHERE tag = ?`,
          [tag]
        );

        let tagId;
        if (existingTag.length) {
          tagId = existingTag[0].id;
        } else {
          const [insertResult] = await connection.execute(
            `INSERT INTO tags (tag) VALUES (?)`,
            [tag]
          );
          tagId = insertResult.insertId;
        }

        // Check if we've already processed this tag ID in this operation
        if (!processedTagIds.has(tagId)) {
          processedTagIds.add(tagId);
          
          // Use INSERT IGNORE to prevent duplicate entry errors
          await connection.execute(
            `INSERT IGNORE INTO tag_map (tag_id, ref_id, ref_type) VALUES (?, ?, ?)`,
            [tagId, fileId, 'file']
          );
        }
      }
      
      if (uniqueTags.length > 0) {
        tagsUpdated = true;
      }
    }

    // Check if any changes were made
    if (!fileUpdated && !tagsUpdated) {
      await connection.rollback();
      
      // Check if file exists to provide better error message
      const [fileCheck] = await connection.execute('SELECT file_id FROM res_files WHERE file_id = ?', [fileId]);
      
      if (fileCheck.length === 0) {
        return res.status(404).json({
          status: "fail",
          message: `File with ID ${fileId} does not exist.`,
          error: "FILE_NOT_FOUND"
        });
      } else {
        return res.status(400).json({
          status: "fail",
          message: "No changes were made to the file. The provided data may be identical to the current file data.",
          error: "NO_CHANGES_MADE"
        });
      }
    }

    await connection.commit();

    // send notification to admin
    await NotificationService.createNotification(
      "file_updated",
      "File Updated",
      `File ${title} has been updated by admin`,
      { file_id: fileId }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear related cache when file is updated
    await onFileUpdated(fileId, folder_id);

    return res.status(200).json({
      status: "success",
      message: "File updated successfully.",
      data: {
        fileId: fileId,
        updatedFields: updateKeys.length,
        tagsUpdated: tagsUpdated,
        fileDataUpdated: fileUpdated
      }
    });

  } catch (err) {
    await connection.rollback();
    // send error log to error logger
    await ErrorLogger.logError(err, "Error updating file", "error");

    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: err.message,
    });

  } finally {
    connection.release();
  }
}


async function deleteFile(req, res) {
  try {
    const id = req.params.fileId;
    
    // Get folder_id before deleting
    const [fileData] = await pool.execute(
      "SELECT folder_id FROM res_files WHERE file_id = ?",
      [id]
    );
    const folderId = fileData[0]?.folder_id || null;
    
    const [rows] = await pool.execute(
      "DELETE FROM res_files WHERE file_id = ?",
      [id]
    );

    // send notification to admin
    await NotificationService.createNotification(
      "file_deleted",
      "File Deleted",
      `File has been deleted by admin`,
      { file_id: id }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear related cache when file is deleted
    await onFileDeleted(id, folderId);

    res.status(200).json({
      status: "success",
      message: "File deleted successfully",
    });
  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError(err, "Error deleting file", "error");
    res.status(500).send("Internal Server Error");
  }
}

async function getAllFiles(req, res) {
  const connection = await pool.getConnection();
  try {
    const id = req.query.folder_id;

    // Fetch files from the database
    const [rows] = await connection.execute(
      "SELECT * FROM res_files WHERE folder_id = ? ORDER BY title ASC",
      [id]
    );

    // Optimized: Fetch all tags in a single batch query instead of individual lookups
    const fileIds = rows.map(f => f.file_id);
    let tagsByFileId = {};

    if (fileIds.length > 0) {
      const [tags] = await connection.query(
        `SELECT tm.ref_id, t.tag
         FROM tag_map tm
         JOIN tags t ON tm.tag_id = t.id
         WHERE tm.ref_type = 'file' AND tm.ref_id IN (${fileIds.map(() => '?').join(',')})`,
        fileIds
      );

      // Group tags by file ID
      for (const { ref_id, tag } of tags) {
        if (!tagsByFileId[ref_id]) tagsByFileId[ref_id] = [];
        tagsByFileId[ref_id].push(tag);
      }
    }

    // Process files with tags and password decryption
    const filesWithParsedTags = rows.map((file) => {
      // Use tags from tag_map if available, otherwise fall back to legacy format
      let parsedTags = tagsByFileId[file.file_id] || [];
      
      // Fallback to legacy tags format if tag_map doesn't have tags for this file
      if (parsedTags.length === 0 && file.tags && file.tags !== null && file.tags !== '') {
        try {
          parsedTags = JSON.parse(file.tags);
        } catch (error) {
          // If JSON parsing fails, treat as string and split by '+'
          parsedTags = file.tags.split('+').filter(tag => tag.trim());
        }
      }

      // Decrypt password if it exists
      const decryptedPassword = file.password ? decrypt(file.password) : null;

      return {
        ...file,
        password: decryptedPassword,
        tags: parsedTags, // Ensure tags is an array
      };
    });

    res.status(200).json({
      status: "success",
      data: filesWithParsedTags, // Send files with parsed tags
    });
  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'admin_files',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      endpoint: '/getAllFiles'
    });
    res.status(500).send("Internal Server Error");
  } finally {
    connection.release();
  }
}

async function getFileByFileId(req, res) {
  const connection = await pool.getConnection();
  try {
    const fileId = req.params.fileId;

    // Optimized: Fetch file details and tags in parallel
    const [[file], [tagRows]] = await Promise.all([
      connection.execute(
        "SELECT * FROM res_files WHERE file_id = ?",
        [fileId]
      ),
      connection.query(
        `SELECT t.tag
         FROM tag_map tm
         JOIN tags t ON tm.tag_id = t.id
         WHERE tm.ref_type = 'file' AND tm.ref_id = ?`,
        [fileId]
      )
    ]);

    if (!file) {
      return res.status(404).json({
        status: "error",
        message: "File not found",
      });
    }

    // Decrypt password if it exists
    if (file.password && file.password !== "") {
      file.password = decrypt(file.password);
    } else {
      file.password = null;
    }

    // Map tag objects to a simple array of tag strings
    file.tags = tagRows.map(tag => tag.tag);

    return res.status(200).json({
      status: "success",
      data: file,
    });
  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError(err, "Error fetching file", "error");
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  } finally {
    connection.release();
  }
}


async function updateSlugsForFolders(req, res) {
  let connection;

  try {
    connection = await pool.getConnection();

    // Fetch all folders needing slug update
    const [folders] = await connection.query(`
      SELECT folder_id, title
      FROM res_folders
      WHERE slug IS NULL OR slug = ''
    `);

    if (folders.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No folders need slug updates."
      });
    }

    const updates = [];

    for (const folder of folders) {
      const cleanSlug = slugify(folder.title, {
        lower: true,
        replacement: '-',
        remove: /[*+~.()'"!:@]/g
      });

      // Check for existing duplicates
      const [duplicateCount] = await connection.query(`
        SELECT COUNT(*) AS count
        FROM res_folders
        WHERE slug LIKE ? AND folder_id <> ?
      `, [`${cleanSlug}%`, folder.folder_id]);

      const slug = duplicateCount[0].count === 0
        ? cleanSlug
        : `${cleanSlug}-${duplicateCount[0].count}`;

      // Prepare update query for each folder
      updates.push(connection.query(`
        UPDATE res_folders
        SET slug = ?
        WHERE folder_id = ?
      `, [slug, folder.folder_id]));
    }

    // Execute all update queries in parallel
    await Promise.all(updates);

    // send notification to admin
    await NotificationService.createNotification(
      "folder_slugs_updated",
      "Folder Slugs Updated",
      `Slugs for ${folders.length} folders have been updated by admin`,
      { user_id: req.user.id }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear all folder cache after updating slugs
    await onFolderChanged(null); // Clear all folder-related cache

    return res.status(200).json({
      status: "success",
      message: `Successfully updated slugs for ${folders.length} folders.`,
    });

  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError(error, "Error updating slugs", "error");
    return res.status(500).json({
      status: "error",
      message: `Error updating slugs: ${error.message}`,
    });
  } finally {
    if (connection) connection.release();
  }
}


async function updateSlugsForFiles(req, res) {
  let connection;

  try {
    connection = await pool.getConnection();

    // Fetch all files needing slug update
    const [files] = await connection.query(`
      SELECT file_id, title
      FROM res_files
      WHERE slug IS NULL OR slug = '' OR slug LIKE '%/%' OR slug LIKE '%_%'
    `);

    if (files.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No files need slug updates."
      });
    }

    const updates = [];

    for (const file of files) {
      let title = file.title || '';
      title = removeFileExtensions(title);

      let slug = slugify(title, {
        lower: true,
        replacement: '-',
        remove: /[*+~.()'"!:@?&[\]{}<>^#%`|\\]/g
      }).replace(/[/_]/g, '-').replace(/--+/g, '-').replace(/^-+|-+$/g, '');

      if (!slug) {
        slug = `file-${file.file_id}`;
      }

      // Check if slug already exists within the same folder
      const [existing] = await connection.query(
        `SELECT COUNT(*) AS count FROM res_files WHERE slug = ? AND folder_id = ? AND file_id != ?`,
        [slug, file.folder_id, file.file_id]
      );

      if (existing[0].count > 0) {
        slug = `${slug}-${file.file_id}`;
      }

      updates.push(connection.query(
        `UPDATE res_files SET slug = ? WHERE file_id = ?`,
        [slug, file.file_id]
      ));
    }

    await Promise.all(updates);

    // 🧹 AUTO-CLEAR CACHE: Clear all file cache after updating slugs
    await onFileAdded(null, null); // Clear all file-related cache

    return res.status(200).json({
      status: "success",
      message: `Successfully updated slugs for ${files.length} files.`,
    });

  } catch (error) {
    console.error('Error updating slugs:', error);
    return res.status(500).json({
      status: "error",
      message: `Error updating slugs: ${error.message}`,
    });
  } finally {
    if (connection) connection.release();
  }
}

const BATCH_SIZE = 1000;
const tagCache = new Map();

async function resetTagTables(connection) {
    await connection.query(`DROP TABLE IF EXISTS tag_map`);
    await connection.query(`DROP TABLE IF EXISTS tags`);

    await connection.query(`
        CREATE TABLE tags (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tag VARCHAR(255) NOT NULL UNIQUE,
            hits INT DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
        CREATE TABLE tag_map (
            tag_id INT NOT NULL,
            ref_id INT NOT NULL,
            ref_type ENUM('file', 'image', 'video') NOT NULL,
            PRIMARY KEY (tag_id, ref_id, ref_type),
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

async function migrateSplitTags(connection) {
    const [compoundTags] = await connection.query(`SELECT * FROM res_tags`);
    const [allMappings] = await connection.query(`SELECT * FROM res_tags_map`);
    const tagIdToCompoundTag = new Map(compoundTags.map(t => [t.tag_id, t.tag]));

    const [existingTags] = await connection.query(`SELECT id, tag FROM tags`);
    existingTags.forEach(t => tagCache.set(t.tag, t.id));

    for (let i = 0; i < allMappings.length; i += BATCH_SIZE) {
        const batch = allMappings.slice(i, i + BATCH_SIZE);
        const newMappings = [];
        const tagsToCheck = new Set();

        for (const map of batch) {
            const compoundTag = tagIdToCompoundTag.get(map.tag_id);
            if (!compoundTag) continue;

            compoundTag.split('+')
                .map(t => t.trim())
                .filter(Boolean)
                .forEach(tag => {
                    if (!tagCache.has(tag)) tagsToCheck.add(tag);
                });
        }

        if (tagsToCheck.size > 0) {
            const [existing] = await connection.query(
                `SELECT id, tag FROM tags WHERE tag IN (?)`,
                [Array.from(tagsToCheck)]
            );
            existing.forEach(t => {
                tagCache.set(t.tag, t.id);
                tagsToCheck.delete(t.tag);
            });

            if (tagsToCheck.size > 0) {
                const toInsert = Array.from(tagsToCheck).map(t => [t, 1]);
                await connection.query(`INSERT IGNORE INTO tags (tag, hits) VALUES ?`, [toInsert]);

                const [inserted] = await connection.query(
                    `SELECT id, tag FROM tags WHERE tag IN (?)`,
                    [Array.from(tagsToCheck)]
                );
                inserted.forEach(t => tagCache.set(t.tag, t.id));
            }
        }

        for (const map of batch) {
            const compoundTag = tagIdToCompoundTag.get(map.tag_id);
            if (!compoundTag) continue;

            const tags = compoundTag.split('+')
                .map(t => t.trim())
                .filter(Boolean);

            for (const tagText of tags) {
                const tagId = tagCache.get(tagText);
                if (tagId) {
                    newMappings.push([tagId, map.ref_id, map.ref_type]);
                }
            }
        }

        if (newMappings.length > 0) {
            await connection.query(
                `INSERT IGNORE INTO tag_map (tag_id, ref_id, ref_type) VALUES ?`,
                [newMappings]
            );
        }

        console.log(`Processed batch ${i}-${i + batch.length}: ${newMappings.length} mappings`);
    }
}

async function resetAndMigrateTags (req, res) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await resetTagTables(conn);
        await migrateSplitTags(conn);

        await conn.commit();

        // 🧹 AUTO-CLEAR CACHE: Clear all file cache after tag migration
        const { clearAllFileCache } = require("../../config/smart-cache");
        await clearAllFileCache();

        res.json({ status: 'success', message: 'Tags reset and migrated successfully' });
    } catch (err) {
        await conn.rollback();
        console.error('Migration error:', err);
        res.status(500).json({ status: 'fail', message: 'Migration failed', error: err.message });
    } finally {
        conn.release();
    }
};



async function bulkFolderCreate(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const title = req.body.title;
    const description = req.body.description;
    const thumbnail = req.body.thumbnail;
    const is_active = req.body.is_active;
    const is_new = req.body.is_new;
    const parent_id = req.body.parent_id;

    const folder = await conn.query(`INSERT INTO res_folders (title, parent_folder_id, description, tags) VALUES (?, ?, ?, ?)`, [folderName, parentFolderId, description, tags]);

    await conn.commit();
    res.json({ status: 'success', message: 'Folder created successfully', folder });
  } catch (err) {
    await conn.rollback();
  }
}

async function bulkCreateFolders(req, res) {
  const connection = await pool.getConnection();
  try {
    const { folders } = req.body;
    
    // Validate the folders array
    if (!folders || !Array.isArray(folders) || folders.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Folders array is required and must contain at least one folder object.",
      });
    }

    // Validate each folder object
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      if (!folder.title || typeof folder.title !== 'string') {
        return res.status(400).json({
          status: "error",
          message: `Folder at index ${i} must have a valid title string.`,
        });
      }
    }

    // Process folders array into the expected format
    const foldersToCreate = folders.map(folder => ({
      name: folder.title.trim(),
      slug: folder.slug || null, // Allow custom slug input
      description: folder.description || null,
      thumbnail: folder.thumbnail || null,
      is_active: folder.is_active !== undefined ? folder.is_active : 1,
      is_new: folder.is_new !== undefined ? folder.is_new : 1,
      parent_id: folder.parent_id !== undefined ? folder.parent_id : 0
    }));

    if (foldersToCreate.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No valid folders to create.",
      });
    }

    await connection.beginTransaction();

    const result = {
      created: [],
      errors: [],
      skipped: []
    };

    for (const folder of foldersToCreate) {
      try {
        // Check if folder already exists in the same parent (folder name must be unique within parent)
        const [existing] = await connection.execute(
          `SELECT folder_id FROM res_folders WHERE title = ? AND parent_id = ?`,
          [folder.name, folder.parent_id]
        );

        if (existing.length > 0) {
          result.skipped.push({
            name: folder.name,
            reason: 'Folder already exists in this parent',
            folder_id: existing[0].folder_id
          });
          continue;
        }

        // Create initial slug from title if not provided (same logic as addFolder)
        let finalSlug = (folder.slug && folder.slug.trim() !== '') ? folder.slug.trim() : slugify(folder.name, {
          lower: true,
          replacement: '-',
          remove: /[*+~.()'"!:@]/g,
        });

        // Check if slug already exists within the same parent folder (same logic as addFolder)
        let uniqueSlug = finalSlug;
        let counter = 1;

        while (true) {
          const [slugRows] = await connection.execute(
            `SELECT folder_id FROM res_folders WHERE slug = ? AND parent_id = ?`,
            [uniqueSlug, folder.parent_id]
          );

          if (slugRows.length === 0) {
            break; // Slug is unique within this parent folder
          }

          uniqueSlug = `${finalSlug}-${counter}`;
          counter++;
        }

        // Insert the new folder
        const [insertResult] = await connection.execute(
          `INSERT INTO res_folders (title, parent_id, description, thumbnail, is_active, is_new, slug, c_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            folder.name,
            folder.parent_id,
            folder.description,
            folder.thumbnail,
            folder.is_active,
            folder.is_new,
            uniqueSlug,
            req.user.id, // Admin user ID from token
          ]
        );

        result.created.push({
          name: folder.name,
          folder_id: insertResult.insertId,
          slug: uniqueSlug,
          parent_id: folder.parent_id
        });

      } catch (error) {
        // send error log to error logger
        await ErrorLogger.logError(error, "Error creating folder", "error");
        result.errors.push({
          name: folder.name,
          error: error.message
        });
      }
    }

    await connection.commit();

    // send notification to admin
    if (req.user && req.user.id) {
      await NotificationService.createNotification(
        "folder_created",
        "Folder Created",
        `Folders have been created by admin`,
        { user_id: req.user.id }
      );
    }

    // 🧹 AUTO-CLEAR CACHE: Clear all file cache after bulk folder creation
    await onFolderChanged(null); // Clear all folder cache

    res.status(200).json({
      status: "success",
      message: `Processed ${foldersToCreate.length} folders. Created: ${result.created.length}, Skipped: ${result.skipped.length}, Errors: ${result.errors.length}`,
      data: result
    });

  } catch (error) {
    await connection.rollback();
    // send error log to error logger
    await ErrorLogger.logError(error, "Error in bulkCreateFoldersFromHTML", "error");
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message
    });
  } finally {
    connection.release();
  }
}

// Helper function to recursively delete a folder and all its contents
async function deleteFolderRecursively(connection, folderId, deletedCounts = { folders: 0, files: 0 }) {
  try {
    // Get all subfolders first
    const [subfolders] = await connection.execute(
      `SELECT folder_id FROM res_folders WHERE parent_id = ?`,
      [folderId]
    );

    // Recursively delete all subfolders (bottom-up approach)
    for (const subfolder of subfolders) {
      await deleteFolderRecursively(connection, subfolder.folder_id, deletedCounts);
    }

    // Delete all files in this folder
    const [fileResult] = await connection.execute(
      `DELETE FROM res_files WHERE folder_id = ?`,
      [folderId]
    );
    deletedCounts.files += fileResult.affectedRows;

    // Delete the folder itself
    const [folderResult] = await connection.execute(
      `DELETE FROM res_folders WHERE folder_id = ?`,
      [folderId]
    );
    deletedCounts.folders += folderResult.affectedRows;

    // send notification to admin
    await NotificationService.createNotification(
      "folder_deleted",
      "Folder Deleted",
      `Folder ${folderId} has been deleted by admin`,
      { folder_id: folderId }
    );

    return deletedCounts;
  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError(error, "Error deleting folder", "error");
    throw error;
  }
}

async function bulkDeleteFolderAndFiles(req, res) {
  const connection = await pool.getConnection();
  try {
    const { folderIds = [], fileIds = [], recursive = true } = req.body;

    // Ensure arrays are valid
    const validFolderIds = Array.isArray(folderIds) ? folderIds : [];
    const validFileIds = Array.isArray(fileIds) ? fileIds : [];

    // Check if both arrays are empty
    if (validFolderIds.length === 0 && validFileIds.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No items to delete. Both folder and file arrays are empty.",
        data: {
          folders: 0,
          files: 0
        }
      });
    }

    await connection.beginTransaction();

    let deletedFolders = 0;
    let deletedFiles = 0;
    let nestedFolders = 0;

    // Delete files only if fileIds array is not empty
    if (validFileIds.length > 0) {
      const [fileResult] = await connection.query(`DELETE FROM res_files WHERE file_id IN (?)`, [validFileIds]);
      deletedFiles = fileResult.affectedRows;
    }

    // Delete folders only if folderIds array is not empty
    if (validFolderIds.length > 0) {
      if (recursive) {
        // Recursively delete folders with all nested contents
        for (const folderId of validFolderIds) {
          const deletedCounts = { folders: 0, files: 0 };
          await deleteFolderRecursively(connection, folderId, deletedCounts);
          deletedFolders += deletedCounts.folders;
          deletedFiles += deletedCounts.files;
        }
        nestedFolders = deletedFolders - validFolderIds.length; // Subtract the main folders
      } else {
        // Delete only immediate folders (original behavior)
        const [folderResult] = await connection.query(`DELETE FROM res_folders WHERE folder_id IN (?)`, [validFolderIds]);
        deletedFolders = folderResult.affectedRows;
      }
    }

    await connection.commit();

    // Generate appropriate message based on what was deleted
    let message = "";
    if (deletedFolders > 0 && deletedFiles > 0) {
      message = `Successfully deleted ${deletedFolders} folders and ${deletedFiles} files.`;
      if (nestedFolders > 0) {
        message += ` Including ${nestedFolders} nested folders.`;
      }
    } else if (deletedFolders > 0) {
      message = `Successfully deleted ${deletedFolders} folders.`;
      if (nestedFolders > 0) {
        message += ` Including ${nestedFolders} nested folders.`;
      }
    } else if (deletedFiles > 0) {
      message = `Successfully deleted ${deletedFiles} files.`;
    } else {
      message = "No items were deleted. Some IDs may not exist.";
    }

    // send notification to admin

    await NotificationService.createNotification(
      "folder_deleted",
      "Folder Deleted",
      `Folders have been deleted by admin`,
      { user_id: req.user.id }
    );

    // 🧹 AUTO-CLEAR CACHE: Clear all file cache after bulk deletion
    const { clearAllFileCache } = require("../../config/smart-cache");
    await clearAllFileCache();

    res.status(200).json({
      status: "success",
      message: message,
      data: {
        folders: deletedFolders,
        files: deletedFiles,
        nestedFolders: nestedFolders,
        recursive: recursive,
        requested: {
          folders: validFolderIds.length,
          files: validFileIds.length
        }
      }
    });
  } catch (error) {
    await connection.rollback();
    // send error log to error logger
    await ErrorLogger.logError(error, "Error in bulkDeleteFolderAndFiles", "error");
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message
    });
  } finally { 
    connection.release();
  }
}

// Helper function to recursively copy a folder and all its contents
async function copyFolderRecursively(connection, sourceFolderId, targetParentId, processedFolders = new Map()) {
  try {
    // Get source folder details
    const [folders] = await connection.execute(
      `SELECT * FROM res_folders WHERE folder_id = ?`,
      [sourceFolderId]
    );

    if (folders.length === 0) {
      return null;
    }

    const sourceFolder = folders[0];

    // Check if we've already processed this folder (avoid infinite loops)
    if (processedFolders.has(sourceFolderId)) {
      return processedFolders.get(sourceFolderId);
    }

    // Generate unique folder name
    let newFolderName = sourceFolder.title;
    let folderNumber = 1;

    let [conflict] = await connection.execute(
      `SELECT folder_id FROM res_folders WHERE parent_id = ? AND title = ?`,
      [targetParentId, newFolderName]
    );

    while (conflict.length > 0) {
      newFolderName = `${sourceFolder.title} (${folderNumber++})`;
      [conflict] = await connection.execute(
        `SELECT folder_id FROM res_folders WHERE parent_id = ? AND title = ?`,
        [targetParentId, newFolderName]
      );
    }

    // Create the new folder
    const [insertResult] = await connection.execute(
      `INSERT INTO res_folders (parent_id, title, description, thumbnail, is_active, is_new, slug)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        targetParentId,
        newFolderName,
        sourceFolder.description,
        sourceFolder.thumbnail,
        sourceFolder.is_active,
        sourceFolder.is_new,
        `${sourceFolder.slug}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` // Ensure unique slug
      ]
    );

    const newFolderId = insertResult.insertId;
    processedFolders.set(sourceFolderId, newFolderId);

    // Copy all files in this folder
    const [files] = await connection.execute(
      `SELECT * FROM res_files WHERE folder_id = ?`,
      [sourceFolderId]
    );

    for (const file of files) {
      // Generate unique file name
      const nameWithoutExt = file.title.replace(/\.[^/.]+$/, "");
      const ext = file.title.includes(".") ? "." + file.title.split(".").pop() : "";
      let newFileName = file.title;
      let fileNumber = 1;

      let [fileConflict] = await connection.execute(
        `SELECT file_id FROM res_files WHERE folder_id = ? AND title = ?`,
        [newFolderId, newFileName]
      );

      while (fileConflict.length > 0) {
        newFileName = `${nameWithoutExt} (${fileNumber++})${ext}`;
        [fileConflict] = await connection.execute(
          `SELECT file_id FROM res_files WHERE folder_id = ? AND title = ?`,
          [newFolderId, newFileName]
        );
      }

      // Insert copied file
      const [fileInsertResult] = await connection.execute(
        `INSERT INTO res_files 
         (folder_id, title, description, body, thumbnail, image, size, price, url, url_type, is_active, is_new, is_featured, password, meta_title, meta_description, meta_keywords)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newFolderId,
          newFileName,
          file.description,
          file.body,
          file.thumbnail,
          file.image,
          file.size,
          file.price,
          file.url,
          file.url_type,
          file.is_active,
          file.is_new,
          file.is_featured,
          file.password,
          file.meta_title,
          file.meta_description,
          file.meta_keywords
        ]
      );

      // Copy file tags
      const [existingTags] = await connection.execute(
        `SELECT tag_id FROM tag_map WHERE ref_type = 'file' AND ref_id = ?`,
        [file.file_id]
      );

      if (existingTags.length > 0) {
        for (const tag of existingTags) {
          await connection.execute(
            `INSERT INTO tag_map (tag_id, ref_id, ref_type) VALUES (?, ?, ?)`,
            [tag.tag_id, fileInsertResult.insertId, 'file']
          );
        }
      }
    }

    // Recursively copy all subfolders
    const [subfolders] = await connection.execute(
      `SELECT folder_id FROM res_folders WHERE parent_id = ?`,
      [sourceFolderId]
    );

    for (const subfolder of subfolders) {
      await copyFolderRecursively(connection, subfolder.folder_id, newFolderId, processedFolders);
    }

    return newFolderId;
  } catch (error) {
    console.error(`Error copying folder ${sourceFolderId}:`, error);
    throw error;
  }
}

// Helper function to recursively move a folder and all its contents
async function moveFolderRecursively(connection, sourceFolderId, targetParentId, processedFolders = new Map()) {
  try {
    // Get source folder details
    const [folders] = await connection.execute(
      `SELECT * FROM res_folders WHERE folder_id = ?`,
      [sourceFolderId]
    );

    if (folders.length === 0) {
      return null;
    }

    const sourceFolder = folders[0];

    // Check if we've already processed this folder (avoid infinite loops)
    if (processedFolders.has(sourceFolderId)) {
      return processedFolders.get(sourceFolderId);
    }

    // Check for name conflicts in target location
    let newFolderName = sourceFolder.title;
    let folderNumber = 1;

    let [conflict] = await connection.execute(
      `SELECT folder_id FROM res_folders WHERE parent_id = ? AND title = ?`,
      [targetParentId, newFolderName]
    );

    while (conflict.length > 0) {
      newFolderName = `${sourceFolder.title} (${folderNumber++})`;
      [conflict] = await connection.execute(
        `SELECT folder_id FROM res_folders WHERE parent_id = ? AND title = ?`,
        [targetParentId, newFolderName]
      );
    }

    // Move the folder to new location
    await connection.execute(
      `UPDATE res_folders SET parent_id = ?, title = ? WHERE folder_id = ?`,
      [targetParentId, newFolderName, sourceFolderId]
    );

    processedFolders.set(sourceFolderId, sourceFolderId);

    // Move all files in this folder to the new folder location
    await connection.execute(
      `UPDATE res_files SET folder_id = ? WHERE folder_id = ?`,
      [sourceFolderId, sourceFolderId] // This keeps files in the same folder, just moved
    );

    // Recursively move all subfolders (they will automatically move with parent)
    const [subfolders] = await connection.execute(
      `SELECT folder_id FROM res_folders WHERE parent_id = ?`,
      [sourceFolderId]
    );

    for (const subfolder of subfolders) {
      await moveFolderRecursively(connection, subfolder.folder_id, sourceFolderId, processedFolders);
    }

    return sourceFolderId;
  } catch (error) {
    console.error(`Error moving folder ${sourceFolderId}:`, error);
    throw error;
  }
}

async function bulkCutCopyPaste(req, res) {
  const connection = await pool.getConnection();
  try {
    const { 
      fileIds = [], 
      folderIds = [], 
      action, // 'cut', 'copy', 'paste'
      targetFolderId = 0, // destination folder ID
      recursive = true // default to true for better UX
    } = req.body;

    // Validate action
    if (!action || !['cut', 'copy', 'paste'].includes(action)) {
      return res.status(400).json({
        status: "error",
        message: "Action is required and must be 'cut', 'copy', or 'paste'.",
      });
    }

    // Ensure arrays are valid
    const validFileIds = Array.isArray(fileIds) ? fileIds : [];
    const validFolderIds = Array.isArray(folderIds) ? folderIds : [];

    // Check if both arrays are empty
    if (validFileIds.length === 0 && validFolderIds.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No items to process. Both file and folder arrays are empty.",
        data: {
          files: 0,
          folders: 0
        }
      });
    }

    await connection.beginTransaction();

    const result = {
      files: { processed: 0, errors: [] },
      folders: { processed: 0, errors: [] },
      nestedFolders: { processed: 0, errors: [] }
    };

    // Handle files
    if (validFileIds.length > 0) {
      for (const fileId of validFileIds) {
        try {
          // Get file details
          const [files] = await connection.execute(
            `SELECT * FROM res_files WHERE file_id = ?`,
            [fileId]
          );

          if (files.length === 0) {
            result.files.errors.push({
              fileId,
              error: "File not found"
            });
            continue;
          }

          const file = files[0];

          if (action === 'cut' || action === 'paste') {
            // Move file to target folder
            await connection.execute(
              `UPDATE res_files SET folder_id = ? WHERE file_id = ?`,
              [targetFolderId, fileId]
            );
            result.files.processed++;
          } else if (action === 'copy') {
            // Copy file to target folder with unique name
            const nameWithoutExt = file.title.replace(/\.[^/.]+$/, "");
            const ext = file.title.includes(".") ? "." + file.title.split(".").pop() : "";
            let newFileName = file.title;
            let fileNumber = 1;

            // Check for name conflicts
            let [conflict] = await connection.execute(
              `SELECT file_id FROM res_files WHERE folder_id = ? AND title = ?`,
              [targetFolderId, newFileName]
            );

            while (conflict.length > 0) {
              newFileName = `${nameWithoutExt} (${fileNumber++})${ext}`;
              [conflict] = await connection.execute(
                `SELECT file_id FROM res_files WHERE folder_id = ? AND title = ?`,
                [targetFolderId, newFileName]
              );
            }

            // Insert copied file
            const [insertResult] = await connection.execute(
              `INSERT INTO res_files 
               (folder_id, title, description, body, thumbnail, image, size, price, url, url_type, is_active, is_new, is_featured, password, meta_title, meta_description, meta_keywords)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                targetFolderId,
                newFileName,
                file.description,
                file.body,
                file.thumbnail,
                file.image,
                file.size,
                file.price,
                file.url,
                file.url_type,
                file.is_active,
                file.is_new,
                file.is_featured,
                file.password,
                file.meta_title,
                file.meta_description,
                file.meta_keywords
              ]
            );

            // Copy tags if any
            const [existingTags] = await connection.execute(
              `SELECT tag_id FROM tag_map WHERE ref_type = 'file' AND ref_id = ?`,
              [fileId]
            );

            if (existingTags.length > 0) {
              for (const tag of existingTags) {
                await connection.execute(
                  `INSERT INTO tag_map (tag_id, ref_id, ref_type) VALUES (?, ?, ?)`,
                  [tag.tag_id, insertResult.insertId, 'file']
                );
              }
            }

            result.files.processed++;
          }
        } catch (error) {
          console.error(`Error processing file ${fileId}:`, error);
          result.files.errors.push({
            fileId,
            error: error.message
          });
        }
      }
    }

    // Handle folders
    if (validFolderIds.length > 0) {
      for (const folderId of validFolderIds) {
        try {
          // Get folder details
          const [folders] = await connection.execute(
            `SELECT * FROM res_folders WHERE folder_id = ?`,
            [folderId]
          );

          if (folders.length === 0) {
            result.folders.errors.push({
              folderId,
              error: "Folder not found"
            });
            continue;
          }

          const folder = folders[0];

          if (action === 'cut' || action === 'paste') {
            if (recursive) {
              // Recursively move folder with all nested contents
              const processedFolders = new Map();
              await moveFolderRecursively(connection, folderId, targetFolderId, processedFolders);
              result.folders.processed++;
              result.nestedFolders.processed += processedFolders.size - 1; // Subtract the main folder
            } else {
              // Move only the immediate folder
              await connection.execute(
                `UPDATE res_folders SET parent_id = ? WHERE folder_id = ?`,
                [targetFolderId, folderId]
              );
              result.folders.processed++;
            }
          } else if (action === 'copy') {
            if (recursive) {
              // Recursively copy folder with all nested contents
              const processedFolders = new Map();
              await copyFolderRecursively(connection, folderId, targetFolderId, processedFolders);
              result.folders.processed++;
              result.nestedFolders.processed += processedFolders.size - 1; // Subtract the main folder
            } else {
              // Copy only the immediate folder (original behavior)
              let newFolderName = folder.title;
              let folderNumber = 1;

              // Check for name conflicts
              let [conflict] = await connection.execute(
                `SELECT folder_id FROM res_folders WHERE parent_id = ? AND title = ?`,
                [targetFolderId, newFolderName]
              );

              while (conflict.length > 0) {
                newFolderName = `${folder.title} (${folderNumber++})`;
                [conflict] = await connection.execute(
                  `SELECT folder_id FROM res_folders WHERE parent_id = ? AND title = ?`,
                  [targetFolderId, newFolderName]
                );
              }

              // Insert copied folder
              await connection.execute(
                `INSERT INTO res_folders (parent_id, title, description, thumbnail, is_active, is_new, slug)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  targetFolderId,
                  newFolderName,
                  folder.description,
                  folder.thumbnail,
                  folder.is_active,
                  folder.is_new,
                  `${folder.slug}-${Date.now()}` // Ensure unique slug
                ]
              );

              result.folders.processed++;
            }
          }
        } catch (error) {
          console.error(`Error processing folder ${folderId}:`, error);
          result.folders.errors.push({
            folderId,
            error: error.message
          });
        }
      }
    }

    await connection.commit();

    // Generate response message
    let message = "";
    const totalProcessed = result.files.processed + result.folders.processed;
    const totalErrors = result.files.errors.length + result.folders.errors.length;

    if (totalProcessed > 0) {
      const actionText = action === 'copy' ? 'copied' : action === 'cut' ? 'moved' : 'pasted';
      message = `Successfully ${actionText} ${result.files.processed} files and ${result.folders.processed} folders.`;
      if (result.nestedFolders.processed > 0) {
        message += ` Processed ${result.nestedFolders.processed} nested folders.`;
      }
      if (totalErrors > 0) {
        message += ` ${totalErrors} items had errors.`;
      }
    } else {
      message = `No items were ${action}ed. All items had errors.`;
    }

    // 🧹 AUTO-CLEAR CACHE: Clear all file cache after bulk cut/copy/paste
    const { clearAllFileCache } = require("../../config/smart-cache");
    await clearAllFileCache();

    res.status(200).json({
      status: "success",
      message: message,
      data: {
        action: action,
        targetFolderId: targetFolderId,
        recursive: recursive,
        processed: {
          files: result.files.processed,
          folders: result.folders.processed,
          nestedFolders: result.nestedFolders.processed
        },
        errors: {
          files: result.files.errors,
          folders: result.folders.errors
        },
        requested: {
          files: validFileIds.length,
          folders: validFolderIds.length
        }
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error in bulkCutCopyPaste:', error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message
    });
  } finally {
    connection.release();
  }
}

/**
 * Helper function to get or create folder by path recursively
 * IMPORTANT: This function NEVER deletes existing folders. It only:
 * - Checks if folders exist and reuses them
 * - Creates new folders only if they don't exist
 * 
 * @param {Object} connection - Database connection
 * @param {string} folderPath - Path like "folder1/folder2/folder3"
 * @param {number} parentId - Parent folder ID (default: 0 for root)
 * @param {number} userId - Admin user ID (required for folder creation)
 * @returns {Promise<number>} - Folder ID
 */
async function getOrCreateFolderByPath(connection, folderPath, parentId = 0, userId = null) {
  if (!folderPath || folderPath.trim() === '') {
    return parentId;
  }

  // Normalize path: remove leading/trailing slashes and split
  const normalizedPath = folderPath.trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedPath) {
    return parentId;
  }

  // Validate path doesn't contain invalid characters
  if (/[<>:"|?*\x00-\x1f]/.test(normalizedPath)) {
    throw new Error('Folder path contains invalid characters');
  }

  // Split path into folder names and filter out empty strings
  const folderNames = normalizedPath.split('/').map(name => name.trim()).filter(name => name !== '');
  
  if (folderNames.length === 0) {
    return parentId;
  }

  // Validate folder name length (database constraint)
  for (const name of folderNames) {
    if (name.length > 255) {
      throw new Error(`Folder name "${name}" exceeds maximum length of 255 characters`);
    }
    if (name.length === 0) {
      throw new Error('Folder path contains empty folder names');
    }
  }

  let currentParentId = parentId;

  // Process each folder in the path
  for (const folderName of folderNames) {
    const trimmedName = folderName.trim();
    if (!trimmedName) {
      throw new Error('Empty folder name in path');
    }

    try {
      // IMPORTANT: Check if folder exists - NEVER delete existing folders
      // Only create new folders if they don't exist
      const [existing] = await connection.execute(
        `SELECT folder_id FROM res_folders WHERE title = ? AND parent_id = ?`,
        [trimmedName, currentParentId]
      );

      if (existing.length > 0) {
        // Folder exists - reuse it (NO DELETION, NO UPDATE)
        currentParentId = existing[0].folder_id;
      } else {
        // Folder doesn't exist - create new one (INSERT ONLY)
        // Create new folder
        const folderSlug = slugify(trimmedName, {
          lower: true,
          replacement: '-',
          remove: /[*+~.()'"!:@]/g,
        });

        // Ensure unique slug (with retry limit to prevent infinite loops)
        let uniqueSlug = folderSlug;
        let counter = 1;
        const maxRetries = 1000; // Safety limit
        while (counter < maxRetries) {
          const [slugRows] = await connection.execute(
            `SELECT folder_id FROM res_folders WHERE slug = ? AND parent_id = ?`,
            [uniqueSlug, currentParentId]
          );
          if (slugRows.length === 0) break;
          uniqueSlug = `${folderSlug}-${counter++}`;
        }

        if (counter >= maxRetries) {
          throw new Error(`Unable to generate unique slug for folder: ${trimmedName}`);
        }

        // INSERT ONLY - Create new folder (never UPDATE or DELETE existing folders)
        // Validate userId is provided (required for database constraint)
        if (!userId) {
          throw new Error('User ID is required to create folders');
        }

        const [insertResult] = await connection.execute(
          `INSERT INTO res_folders (title, parent_id, description, thumbnail, is_active, is_new, slug, c_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            trimmedName,
            currentParentId,
            null,
            null,
            1,
            1,
            uniqueSlug,
            userId // Admin user ID from authenticated request
          ]
        );

        if (!insertResult || !insertResult.insertId) {
          throw new Error(`Failed to create folder: ${trimmedName}`);
        }

        currentParentId = insertResult.insertId;
      }
    } catch (folderErr) {
      // Re-throw with more context
      throw new Error(`Error processing folder "${trimmedName}": ${folderErr.message}`);
    }
  }

  return currentParentId;
}

/**
 * Helper function to safely delete temporary file
 * @param {string} filePath - Path to file to delete
 * @returns {Promise<boolean>} - True if deleted successfully, false otherwise
 */
async function safeDeleteFile(filePath) {
  if (!filePath) return false;
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`Error deleting temporary file ${filePath}:`, err);
    await ErrorLogger.logError(err, `Failed to delete temporary file: ${filePath}`, "warning");
    return false;
  }
}

/**
 * Upload files from Excel file
 * Excel should have columns: FullPath, Title, URL, URL_Type, Description, Size, Price, etc.
 * 
 * IMPORTANT SAFETY GUARANTEES:
 * - NEVER deletes existing files or folders
 * - ONLY inserts new records (INSERT statements only)
 * - Skips files that already exist (by title + folder_id)
 * - Reuses existing folders (never modifies or deletes them)
 * - Only creates new folders if they don't exist
 */
async function uploadFilesFromExcel(req, res) {
  const connection = await pool.getConnection();
  let uploadedFilePath = null;
  
  try {
    // Log request details for debugging
    console.log('[Excel Upload] Processing request:', {
      hasFile: !!req.file,
      hasUploadError: !!req.uploadError,
      fileInfo: req.file ? {
        originalname: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      } : null
    });

    // Check for multer upload errors
    if (req.uploadError) {
      console.error('[Excel Upload] Upload error detected:', req.uploadError);
      return res.status(400).json({
        status: 'error',
        message: req.uploadError.message || 'File upload error',
      });
    }

    if (!req.file) {
      console.error('[Excel Upload] No file in request');
      return res.status(400).json({
        status: 'error',
        message: 'No Excel file uploaded. Please upload an Excel file.',
        hint: 'Make sure the form field name is "excelFile"'
      });
    }

    uploadedFilePath = req.file.path;

    // Validate file exists
    if (!fs.existsSync(uploadedFilePath)) {
      return res.status(400).json({
        status: 'error',
        message: 'Uploaded file not found. Please try uploading again.',
      });
    }

    // Check file extension
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(fileExt)) {
      await safeDeleteFile(uploadedFilePath);
      return res.status(400).json({
        status: 'error',
        message: 'Invalid file type. Please upload an Excel file (.xlsx or .xls).',
      });
    }

    // Validate file size (additional check)
    const stats = fs.statSync(uploadedFilePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    if (fileSizeInMB > 10) {
      await safeDeleteFile(uploadedFilePath);
      return res.status(400).json({
        status: 'error',
        message: 'File size exceeds 10MB limit.',
      });
    }

    // Read Excel file with error handling
    let workbook;
    try {
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(uploadedFilePath);
      
      // Log file info for debugging
      console.log(`[Excel Upload] File loaded: ${req.file.originalname}, Worksheets: ${workbook.worksheets.length}`);
    } catch (excelErr) {
      await safeDeleteFile(uploadedFilePath);
      await ErrorLogger.logError(excelErr, "Error reading Excel file", "error");
      console.error('[Excel Upload] Error reading file:', excelErr);
      return res.status(400).json({
        status: 'error',
        message: 'Failed to read Excel file. Please ensure the file is not corrupted and is a valid Excel file (.xlsx or .xls format).',
        details: process.env.NODE_ENV === 'development' ? excelErr.message : undefined
      });
    }

    // Get first worksheet
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      await safeDeleteFile(uploadedFilePath);
      return res.status(400).json({
        status: 'error',
        message: 'Excel file is empty or has no worksheets.',
      });
    }

    console.log(`[Excel Upload] Worksheet: ${worksheet.name}, Rows: ${worksheet.rowCount}, Columns: ${worksheet.columnCount}`);

    // Validate worksheet has data
    if (worksheet.rowCount < 2) {
      await safeDeleteFile(uploadedFilePath);
      return res.status(400).json({
        status: 'error',
        message: 'Excel file must contain at least a header row and one data row.',
        details: {
          rows_found: worksheet.rowCount,
          suggestion: 'Add at least one data row below the header row.'
        }
      });
    }

    // Get headers from first row (case-insensitive)
    const headers = {};
    const headerRow = worksheet.getRow(1);
    let headerCount = 0;
    
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      let headerValue = null;
      
      // Handle different cell value types
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'object' && cell.value.text !== undefined) {
          // Rich text cell
          headerValue = cell.value.text.toString().trim();
        } else if (cell.value instanceof Date) {
          // Date cell - convert to string
          headerValue = cell.value.toISOString().trim();
        } else {
          // Regular value
          headerValue = cell.value.toString().trim();
        }
      }
      
      if (headerValue && headerValue.length > 0) {
        headers[colNumber] = {
          original: headerValue,
          lower: headerValue.toLowerCase()
        };
        headerCount++;
      }
    });

    if (headerCount === 0) {
      await safeDeleteFile(uploadedFilePath);
      return res.status(400).json({
        status: 'error',
        message: 'Excel file has no valid headers in the first row.',
      });
    }

    // Convert to JSON (skip header row)
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row
      
      const rowData = {};
      let hasAnyData = false;
      
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const headerInfo = headers[colNumber];
        if (headerInfo) {
          let cellValue = null;
          
          // Handle different cell value types
          if (cell.value !== null && cell.value !== undefined) {
            if (typeof cell.value === 'object' && cell.value.text !== undefined) {
              // Rich text cell
              cellValue = cell.value.text.toString().trim();
            } else if (cell.value instanceof Date) {
              // Date cell - convert to ISO string
              cellValue = cell.value.toISOString();
            } else if (typeof cell.value === 'number') {
              // Number cell - keep as number but also store as string
              cellValue = cell.value;
            } else {
              // String or other types
              cellValue = cell.value.toString().trim();
            }
            
            // Only store non-empty values
            if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
              rowData[headerInfo.original] = cellValue;
              // Also add lowercase version for easier access
              rowData[headerInfo.lower] = cellValue;
              hasAnyData = true;
            }
          }
        }
      });
      
      // Check for FullPath (case-insensitive) - try multiple variations
      const fullPath = rowData.FullPath || 
                      rowData.fullpath || 
                      rowData['Full Path'] || 
                      rowData['full path'] ||
                      rowData['FULLPATH'] ||
                      rowData['FullPath'] ||
                      rowData['Fullpath'];
      
      // Only add row if it has data and FullPath
      if (hasAnyData && fullPath && fullPath.toString().trim() !== '') {
        rows.push(rowData);
      }
    });

    if (rows.length === 0) {
      await safeDeleteFile(uploadedFilePath);
      const availableHeaders = Object.values(headers).map(h => h.original).join(', ');
      return res.status(400).json({
        status: 'error',
        message: 'No valid data found in Excel file. Ensure FullPath column exists and contains data.',
        details: {
          headers_found: availableHeaders,
          total_rows_in_sheet: worksheet.rowCount,
          suggestion: 'Make sure your Excel file has a header row with "FullPath" column and at least one data row with FullPath values.'
        }
      });
    }

    // Validate we have required headers (check for FullPath in various formats)
    const hasFullPath = Object.keys(headers).some(col => {
      const header = headers[col].original.toLowerCase().replace(/\s+/g, '');
      return header === 'fullpath' || 
             header === 'full_path' || 
             header.includes('fullpath') || 
             header.includes('full path');
    });

    if (!hasFullPath) {
      await safeDeleteFile(uploadedFilePath);
      const availableHeaders = Object.values(headers).map(h => h.original).join(', ');
      return res.status(400).json({
        status: 'error',
        message: `Excel file must contain a "FullPath" column. Found columns: ${availableHeaders || 'none'}`,
      });
    }

    // Validate we have Title or Name column
    const hasTitleOrName = Object.keys(headers).some(col => {
      const header = headers[col].original.toLowerCase().replace(/\s+/g, '');
      return header === 'title' || 
             header === 'name' || 
             header === 'filetitle' ||
             header === 'filename';
    });

    if (!hasTitleOrName) {
      await safeDeleteFile(uploadedFilePath);
      const availableHeaders = Object.values(headers).map(h => h.original).join(', ');
      return res.status(400).json({
        status: 'error',
        message: `Excel file must contain either a "Title" or "Name" column. Found columns: ${availableHeaders || 'none'}`,
      });
    }

    // Validate we have URL or DirectDownloadURL column
    const hasUrl = Object.keys(headers).some(col => {
      const header = headers[col].original.toLowerCase().replace(/\s+/g, '');
      return header === 'url' || 
             header === 'directdownloadurl' ||
             header === 'direct_download_url' ||
             header === 'link';
    });

    if (!hasUrl) {
      await safeDeleteFile(uploadedFilePath);
      const availableHeaders = Object.values(headers).map(h => h.original).join(', ');
      return res.status(400).json({
        status: 'error',
        message: `Excel file must contain either a "URL" or "DirectDownloadURL" column. Found columns: ${availableHeaders || 'none'}`,
      });
    }

    // Begin transaction - all operations are INSERT-only (safe, no data loss on rollback)
    await connection.beginTransaction();

    const results = {
      created: [],
      errors: [],
      skipped: []
    };

    // ====================================================================
    // SAFETY GUARANTEES - THIS FUNCTION NEVER DELETES OR UPDATES ANYTHING
    // ====================================================================
    // This function ONLY performs INSERT operations:
    // - Never calls updateFolder, deleteFolder, updateFile, or deleteFile
    // - Never executes UPDATE or DELETE SQL statements
    // - Only creates new folders and files that don't exist
    // - Skips existing files/folders without modifying them
    // - Reuses existing folders (never modifies or deletes them)
    // - All database operations are INSERT statements only
    // ====================================================================

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 because we skipped header and arrays are 0-indexed

      try {
        // Extract required fields (case-insensitive) - handle null/undefined values
        const getFieldValue = (variations) => {
          for (const variation of variations) {
            const value = row[variation];
            if (value !== null && value !== undefined && value !== '') {
              return value.toString().trim();
            }
          }
          return '';
        };

        const fullPath = getFieldValue(['FullPath', 'fullpath', 'Full Path', 'full path', 'FULLPATH', 'Fullpath', 'Full_Path', 'full_path']) || '';
        // Accept both "Title" and "Name" as valid column names for file title
        const title = getFieldValue(['Title', 'title', 'TITLE', 'File Title', 'file title', 'Name', 'name', 'NAME', 'File Name', 'file name']) || '';
        // Accept "URL" or "DirectDownloadURL" as valid column names for file URL
        const url = getFieldValue(['DirectDownloadURL', 'directdownloadurl', 'Direct Download URL', 'direct download url', 'Direct_Download_URL', 'direct_download_url', 'URL', 'url', 'Url', 'Link', 'link']) || '';
        const urlType = getFieldValue(['URL_Type', 'url_type', 'URL Type', 'url type', 'Url_Type', 'Url Type']) || 'external';
        
        // Validate required fields
        if (!fullPath) {
          results.errors.push({
            row: rowNumber,
            reason: 'FullPath is required',
            data: row
          });
          continue;
        }

        // If no title/name provided, create folder structure only (skip file creation)
        if (!title) {
          // Still create the folder structure if it doesn't exist
          const adminUserId = req.user?.id || null;
          if (adminUserId) {
            try {
              await getOrCreateFolderByPath(connection, fullPath, 0, adminUserId);
              // Add to skipped with informative message
              results.skipped.push({
                row: rowNumber,
                fullPath,
                reason: 'No Title/Name provided - folder structure created/verified, file creation skipped',
                folder_only: true
              });
            } catch (folderErr) {
              results.errors.push({
                row: rowNumber,
                reason: `Failed to create folder structure: ${folderErr.message}`,
                data: row
              });
            }
          } else {
            results.errors.push({
              row: rowNumber,
              reason: 'Title/Name is required for file creation. Admin user ID not found.',
              data: row
            });
          }
          continue;
        }

        if (!url) {
          results.errors.push({
            row: rowNumber,
            reason: 'URL/DirectDownloadURL is required. Please provide either "URL" or "DirectDownloadURL" column.',
            data: row
          });
          continue;
        }

        // Validate URL format
        if (!validator.isURL(url, { require_protocol: true })) {
          results.errors.push({
            row: rowNumber,
            reason: `Invalid URL format: ${url}. URL must include protocol (http:// or https://)`,
            data: row
          });
          continue;
        }

        // Validate folder path format (no empty segments, no invalid characters)
        if (fullPath.includes('//') || fullPath.startsWith('/') || fullPath.endsWith('/')) {
          results.errors.push({
            row: rowNumber,
            reason: 'Invalid FullPath format. Path should not start/end with slash or contain double slashes',
            data: row
          });
          continue;
        }

        // Validate title length
        if (title.length > 255) {
          results.errors.push({
            row: rowNumber,
            reason: 'Title exceeds maximum length of 255 characters',
            data: row
          });
          continue;
        }

        // Get or create folder structure with error handling
        // Get admin user ID from request (required for folder creation)
        const adminUserId = req.user?.id || null;
        if (!adminUserId) {
          results.errors.push({
            row: rowNumber,
            reason: 'Admin user ID not found in request. Please ensure you are authenticated.',
            data: row
          });
          continue;
        }

        let folderId;
        try {
          folderId = await getOrCreateFolderByPath(connection, fullPath, 0, adminUserId);
          if (!folderId || folderId === 0) {
            throw new Error('Failed to create or retrieve folder');
          }
        } catch (folderErr) {
          results.errors.push({
            row: rowNumber,
            reason: `Failed to create folder structure: ${folderErr.message}`,
            data: row
          });
          continue;
        }

        // IMPORTANT: Check if file already exists - NEVER delete or update existing files
        // Only insert new files if they don't exist
        const [existing] = await connection.execute(
          `SELECT file_id FROM res_files WHERE title = ? AND folder_id = ?`,
          [title, folderId]
        );

        if (existing.length > 0) {
          // File already exists - skip it (NO DELETION, NO UPDATE)
          results.skipped.push({
            row: rowNumber,
            title,
            fullPath,
            reason: 'File with same title already exists in this folder - skipped to preserve existing file',
            file_id: existing[0].file_id
          });
          continue;
        }

        // Extract optional fields (case-insensitive)
        const description = (row.Description || row.description)?.toString().trim() || null;
        
        // Extract size - accept "Size", "Size (bytes)", or variations
        const sizeValue = row['Size (bytes)'] || 
                         row['size (bytes)'] || 
                         row['Size(bytes)'] ||
                         row['size(bytes)'] ||
                         row['Size (Bytes)'] ||
                         row['SIZE (BYTES)'] ||
                         row.Size || 
                         row.size;
        
        // Parse and validate size with better error handling
        let size = 1024; // Default size
        
        if (sizeValue !== null && sizeValue !== undefined && sizeValue !== '') {
          // Convert to string first to handle numbers and strings
          const sizeStr = String(sizeValue).trim().replace(/,/g, ''); // Remove commas
          
          // Try to parse as integer
          const parsedSize = parseInt(sizeStr, 10);
          
          // Check if parsing was successful
          if (isNaN(parsedSize)) {
            // If not a valid number, try to extract number from string (e.g., "1024 bytes" -> 1024)
            const numberMatch = sizeStr.match(/(\d+)/);
            if (numberMatch) {
              size = parseInt(numberMatch[1], 10);
            } else {
              // Invalid size format - use default but log warning
              console.warn(`[Row ${rowNumber}] Invalid size format: "${sizeValue}", using default 1024 bytes`);
              size = 1024;
            }
          } else {
            size = parsedSize;
          }
        }
        
        // Validate and fix size - be lenient, use defaults for invalid values
        if (size < 0) {
          // Negative size - use default and log warning
          console.warn(`[Row ${rowNumber}] Negative size value: ${sizeValue}, using default 1024 bytes`);
          size = 1024;
        }
        
        if (size > 2147483647) {
          // Size too large - cap at maximum and log warning
          console.warn(`[Row ${rowNumber}] Size exceeds maximum (${sizeValue}), capping at 2GB`);
          size = 2147483647; // Maximum allowed size
        }
        
        // Ensure size is at least 1 byte (0 is invalid)
        if (size === 0) {
          size = 1024; // Use default for zero values
        }
        
        // Final validation - if somehow size is still invalid, use default
        if (!Number.isInteger(size) || size < 1) {
          console.warn(`[Row ${rowNumber}] Invalid size after parsing: ${size}, using default 1024 bytes`);
          size = 1024;
        }
        
        // Extract price
        const price = parseFloat(row.Price || row.price || 0) || 0;
        if (price < 0 || price > 999999.99) {
          results.errors.push({
            row: rowNumber,
            reason: 'Price must be between 0 and 999999.99',
            data: row
          });
          continue;
        }
        
        const isActive = (row.Is_Active || row.is_active || row['Is Active'] || row['is active']) !== undefined 
          ? ((row.Is_Active || row.is_active || row['Is Active'] || row['is active']) === 1 || 
             (row.Is_Active || row.is_active || row['Is Active'] || row['is active']) === '1' || 
             (row.Is_Active || row.is_active || row['Is Active'] || row['is active']) === true) 
          : 1;
        const isNew = (row.Is_New || row.is_new || row['Is New'] || row['is new']) !== undefined
          ? ((row.Is_New || row.is_new || row['Is New'] || row['is new']) === 1 || 
             (row.Is_New || row.is_new || row['Is New'] || row['is new']) === '1' || 
             (row.Is_New || row.is_new || row['Is New'] || row['is new']) === true)
          : 1;
        const isFeatured = (row.Is_Featured || row.is_featured || row['Is Featured'] || row['is featured']) !== undefined
          ? ((row.Is_Featured || row.is_featured || row['Is Featured'] || row['is featured']) === 1 || 
             (row.Is_Featured || row.is_featured || row['Is Featured'] || row['is featured']) === '1' || 
             (row.Is_Featured || row.is_featured || row['Is Featured'] || row['is featured']) === true)
          : 0;
        const thumbnail = (row.Thumbnail || row.thumbnail)?.toString().trim() || null;
        const image = (row.Image || row.image)?.toString().trim() || null;
        const slug = (row.Slug || row.slug)?.toString().trim() || null;
        const metaTitle = (row.Meta_Title || row.meta_title || row['Meta Title'] || row['meta title'])?.toString().trim() || null;
        const metaDescription = (row.Meta_Description || row.meta_description || row['Meta Description'] || row['meta description'])?.toString().trim() || null;
        const metaKeywords = (row.Meta_Keywords || row.meta_keywords || row['Meta Keywords'] || row['meta keywords'])?.toString().trim() || null;
        const password = (row.Password || row.password)?.toString().trim() || null;
        const isPassword = (row.Is_Password || row.is_password || row['Is Password'] || row['is password']) !== undefined
          ? ((row.Is_Password || row.is_password || row['Is Password'] || row['is password']) === 1 || 
             (row.Is_Password || row.is_password || row['Is Password'] || row['is password']) === '1' || 
             (row.Is_Password || row.is_password || row['Is Password'] || row['is password']) === true)
          : false;

        // Validate featured and paid conflict
        if (isFeatured && price > 0) {
          results.errors.push({
            row: rowNumber,
            reason: 'Cannot have both featured and paid options. Featured files must be free.',
            data: row
          });
          continue;
        }

        // Validate password if password protection is enabled
        if (isPassword && (!password || password.trim() === '')) {
          results.errors.push({
            row: rowNumber,
            reason: 'Password is required when Is_Password is enabled',
            data: row
          });
          continue;
        }

        // Generate unique slug
        let baseSlug = (slug && slug.trim() !== '') ? slug.trim() : slugify(title, { 
          lower: true, 
          replacement: '-', 
          remove: /[*+~.()_'"!:@]/g 
        });
        let counter = 1;
        let finalSlug = baseSlug;

        while (true) {
          const [check] = await connection.execute(
            `SELECT file_id FROM res_files WHERE slug = ? AND folder_id = ?`, 
            [finalSlug, folderId]
          );
          if (check.length === 0) break;
          finalSlug = `${baseSlug}-${counter++}`;
        }

        const priceDecimal = parseFloat(price ?? 0).toFixed(2);
        const encryptedPassword = isPassword ? encrypt(password) : null;

        // INSERT ONLY - Create new file record (never UPDATE or DELETE existing files)
        let insertResult;
        try {
          [insertResult] = await connection.execute(
            `INSERT INTO res_files 
            (folder_id, title, slug, description, body, thumbnail, image, size, price, url, url_type, is_active, is_new, is_featured, password, meta_title, meta_description, meta_keywords)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              folderId,
              title,
              finalSlug,
              description,
              null, // body
              thumbnail,
              image,
              size,
              priceDecimal,
              url,
              urlType,
              isActive ? 1 : 0,
              isNew ? 1 : 0,
              isFeatured ? 1 : 0,
              encryptedPassword,
              metaTitle,
              metaDescription,
              metaKeywords
            ]
          );
        } catch (dbErr) {
          // Check for specific database errors
          if (dbErr.code === 'ER_DUP_ENTRY') {
            // Duplicate entry - file already exists (this shouldn't happen due to our check, but handle it safely)
            results.skipped.push({
              row: rowNumber,
              title,
              fullPath,
              reason: 'Duplicate entry detected - file already exists (preserved)',
              data: row
            });
          } else {
            results.errors.push({
              row: rowNumber,
              reason: `Database error: ${dbErr.message}`,
              data: row
            });
          }
          continue;
        }

        const newFileId = insertResult.insertId;

        // Handle tags if provided (case-insensitive) with error handling
        const tagsValue = row.Tags || row.tags || row['Tags'] || row['tags'];
        if (tagsValue) {
          try {
            const tags = Array.isArray(tagsValue) 
              ? tagsValue 
              : tagsValue.toString().split(',').map(t => t.trim()).filter(t => t);
            
            for (const tag of tags) {
              if (!tag || tag.length === 0) continue;
              
              try {
                let [existingTag] = await connection.execute(`SELECT id FROM tags WHERE tag = ?`, [tag]);
                let tagId;
                
                if (existingTag.length > 0) {
                  tagId = existingTag[0].id;
                } else {
                  const [insertTagResult] = await connection.execute(`INSERT INTO tags (tag) VALUES (?)`, [tag]);
                  tagId = insertTagResult.insertId;
                }

                const [existingMapping] = await connection.execute(
                  `SELECT tag_id FROM tag_map WHERE tag_id = ? AND ref_id = ? AND ref_type = 'file'`,
                  [tagId, newFileId]
                );

                if (existingMapping.length === 0) {
                  await connection.execute(
                    `INSERT INTO tag_map (tag_id, ref_id, ref_type) VALUES (?, ?, ?)`,
                    [tagId, newFileId, 'file']
                  );
                }
              } catch (tagErr) {
                // Log tag error but don't fail the entire file creation
                console.error(`Error processing tag "${tag}" for file ${newFileId}:`, tagErr);
              }
            }
          } catch (tagsErr) {
            // Log but don't fail - tags are optional
            console.error(`Error processing tags for file ${newFileId}:`, tagsErr);
          }
        }

        results.created.push({
          row: rowNumber,
          file_id: newFileId,
          title,
          fullPath,
          folder_id: folderId
        });

      } catch (err) {
        // Log detailed error for debugging
        console.error(`Error processing row ${rowNumber}:`, err);
        await ErrorLogger.logError(
          err, 
          `Error processing Excel row ${rowNumber}`, 
          "error"
        );
        
        results.errors.push({
          row: rowNumber,
          reason: err.message || 'Unknown error occurred while processing this row',
          error_type: err.name || 'UnknownError',
          data: row
        });
      }
    }

    // Commit transaction only if we have at least some successful operations
    // IMPORTANT: All operations are INSERT-only, so rollback is safe (no data loss)
    try {
      if (results.created.length > 0 || results.skipped.length > 0) {
        // Commit only INSERT operations (no UPDATE or DELETE operations)
        await connection.commit();
      } else {
        // If no files were created or skipped, rollback (safe - only INSERTs were attempted)
        await connection.rollback();
      }
    } catch (commitErr) {
      // Rollback is safe - we only perform INSERT operations, never DELETE or UPDATE
      await connection.rollback();
      throw new Error(`Transaction commit failed: ${commitErr.message}`);
    }

    // Clean up uploaded file (always attempt cleanup)
    await safeDeleteFile(uploadedFilePath);

    // Log summary for debugging
    console.log(`[Excel Upload] Processing complete:`, {
      total_rows: rows.length,
      created: results.created.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    });

    // Determine response status based on results
    const hasErrors = results.errors.length > 0;
    const hasSuccess = results.created.length > 0 || results.skipped.length > 0;
    
    let statusCode = 200;
    let status = 'success';
    let message = `Processed ${rows.length} rows from Excel file`;

    if (!hasSuccess && hasErrors) {
      // All rows failed
      statusCode = 400;
      status = 'error';
      message = 'No files were created. Please check the errors and try again.';
    } else if (hasSuccess && hasErrors) {
      // Partial success
      status = 'partial_success';
      message = `Processed ${rows.length} rows. Some files were created, but some errors occurred.`;
    }

    // ====================================================================
    // SAFETY VERIFICATION: No files or folders were deleted or updated
    // - All operations were INSERT-only
    // - Existing files were skipped (preserved)
    // - Existing folders were reused (preserved)
    // - Only new records were created
    // ====================================================================

    res.status(statusCode).json({
      status,
      message,
      results: {
        total: rows.length,
        created: results.created.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
        details: {
          created: results.created,
          skipped: results.skipped,
          errors: results.errors.slice(0, 50) // Limit error details to first 50 to avoid huge responses
        },
        ...(results.errors.length > 50 && {
          error_note: `Showing first 50 errors. Total errors: ${results.errors.length}`
        })
      }
    });

  } catch (err) {
    // Ensure transaction is rolled back
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      console.error('Error during rollback:', rollbackErr);
    }
    
    // Clean up uploaded file on error (always attempt)
    if (uploadedFilePath) {
      await safeDeleteFile(uploadedFilePath);
    }

    // Log error with full context
    await ErrorLogger.logError(err, "Error uploading files from Excel", "error");
    
    // Provide user-friendly error message
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? err.message 
      : 'An error occurred while processing the Excel file. Please check the file format and try again.';

    res.status(500).json({
      status: 'error',
      message: 'Internal Server Error',
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err.message
      })
    });
  } finally {
    // Always release connection
    if (connection) {
      try {
        connection.release();
      } catch (releaseErr) {
        console.error('Error releasing database connection:', releaseErr);
      }
    }
  }
}


module.exports = {
  getAllFoldersFiles,
  getAllFiles,
  getFileByFileId,
  addFolder,
  deleteFolder,
  updateFolder,
  addFile,
  deleteFile,
  updateFile,
  updateSlugsForFolders,
  updateSlugsForFiles,
  resetAndMigrateTags,
  bulkCreateFolders,
  bulkDeleteFolderAndFiles,
  bulkCutCopyPaste,
  uploadFilesFromExcel
};
