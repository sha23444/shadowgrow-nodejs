const express = require("express");
const router = express.Router();

const FilesController = require("../../controllers/admin/files");
const sharedFilesController = require("../../controllers/shared/file");
const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const searchController = require("../../controllers/user/search");
const {
  authorizeAdmin,
  buildPermissionKey,
} = require("../../middlewars/authorizeAdmin");

const openaiController = require("../../controllers/admin/openai-files");

const perms = {
  list: buildPermissionKey("files", "list"),
  view: buildPermissionKey("files", "view"),
  edit: buildPermissionKey("files", "edit"),
  delete: buildPermissionKey("files", "delete"),
};

router.use(authenticateAdmin);

router.get(
  "/folders",
  authorizeAdmin([perms.list, perms.view]),
  FilesController.getAllFoldersFiles
);

router.get(
  "/file/:fileId",
  authorizeAdmin([perms.view, perms.list]),
  FilesController.getFileByFileId
);

router.post(
  "/folder/add",
  authorizeAdmin([perms.edit]),
  FilesController.addFolder
);
router.delete(
  "/folder/delete/:folderId",
  authorizeAdmin([perms.delete, perms.edit]),
  FilesController.deleteFolder
);
router.put(
  "/folder/update/:folderId",
  authorizeAdmin([perms.edit]),
  FilesController.updateFolder
);
router.get(
  "/folder/files",
  authorizeAdmin([perms.list, perms.view]),
  FilesController.getAllFiles
);
router.delete(
  "/folder/file/delete/:fileId",
  authorizeAdmin([perms.delete]),
  FilesController.deleteFile
);
router.post(
  "/file/add",
  authorizeAdmin([perms.edit]),
  FilesController.addFile
);
router.put(
  "/file/update/:fileId",
  authorizeAdmin([perms.edit]),
  FilesController.updateFile
);
router.get(
  "/folder/file/:fileId",
  authorizeAdmin([perms.view, perms.list]),
  FilesController.getFileByFileId
);

// Unified bulk operations
router.post(
  "/folder/bulk/create",
  authorizeAdmin([perms.edit]),
  FilesController.bulkCreateFolders
);
router.post(
  "/folder-files/delete-many",
  authorizeAdmin([perms.delete, perms.edit]),
  FilesController.bulkDeleteFolderAndFiles
);
router.post(
  "/files/bulk-cut-copy-paste",
  authorizeAdmin([perms.edit]),
  FilesController.bulkCutCopyPaste
);

/// Internal Purpose

router.get(
  "/folders/update/slug",
  authorizeAdmin([perms.edit]),
  FilesController.updateSlugsForFolders
);
router.get(
  "/folders/files/update/slug",
  authorizeAdmin([perms.edit]),
  FilesController.updateSlugsForFiles
);
router.get(
  "/files/tags/migration",
  authorizeAdmin([perms.edit]),
  FilesController.resetAndMigrateTags
);

// shared files

router.get(
  "/folders/path/:folderId",
  authorizeAdmin([perms.view, perms.list]),
  sharedFilesController.getFolderPath
);
router.get(
  "/file/path/:fileId",
  authorizeAdmin([perms.view, perms.list]),
  sharedFilesController.getFolderPathByFile
);
router.get(
  "/folder/description/:folderId",
  authorizeAdmin([perms.view, perms.list]),
  sharedFilesController.getFolderDescription
);

// search routes
router.get(
  "/files/search",
  authorizeAdmin([perms.list, perms.view]),
  searchController.searchAllTables
);
router.get(
  "/files/search/all",
  authorizeAdmin([perms.list, perms.view]),
  searchController.getSearchResults
);
router.get(
  "/files/search/counts",
  authorizeAdmin([perms.list, perms.view]),
  searchController.searchAllTablesCounts
);

// open ai routes
router.post(
  "/files/seo",
  authorizeAdmin([perms.edit]),
  openaiController.generateUniversalSEOContent
);

// Excel upload route for bulk file upload with folder structure
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for Excel file uploads
const excelStorage = multer.diskStorage({
  destination: function (req, file, callback) {
    try {
      const uploadPath = path.join("public", "temp", "excel-uploads");
      
      // Create directory if it doesn't exist (with error handling)
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      // Verify directory was created and is writable
      if (!fs.existsSync(uploadPath)) {
        return callback(new Error('Failed to create upload directory'));
      }
      
      callback(null, uploadPath);
    } catch (err) {
      callback(new Error(`Failed to setup upload directory: ${err.message}`));
    }
  },
  filename: function (req, file, callback) {
    try {
      // Sanitize filename to prevent path traversal
      const sanitizedOriginalName = path.basename(file.originalname);
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
      const ext = path.extname(sanitizedOriginalName);
      callback(null, "excel-" + uniqueSuffix + ext);
    } catch (err) {
      callback(new Error(`Failed to generate filename: ${err.message}`));
    }
  },
});

const excelUpload = multer({
  storage: excelStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(fileExt)) {
      return cb(null, true);
    }
    
    return cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
  },
});

router.post(
  "/files/upload-excel",
  authorizeAdmin([perms.edit]),
  (req, res, next) => {
    // Log incoming request for debugging
    console.log('[Excel Upload] Request received:', {
      hasFile: !!req.file,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length']
    });

    excelUpload.single('excelFile')(req, res, (err) => {
      if (err) {
        // Handle multer errors with specific error messages
        let errorMessage = 'File upload error';
        let statusCode = 400;

        if (err.code === 'LIMIT_FILE_SIZE') {
          errorMessage = 'File size too large. Maximum size is 10MB.';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          errorMessage = 'Unexpected file field. Please use "excelFile" as the field name.';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          errorMessage = 'Too many files. Please upload only one Excel file.';
        } else if (err.message && err.message.includes('Only Excel files')) {
          errorMessage = err.message;
        } else if (err.message) {
          errorMessage = err.message;
        }

        console.error('[Excel Upload] Multer error:', {
          code: err.code,
          message: err.message,
          field: err.field
        });

        // Clean up any partially uploaded file if it exists
        if (req.file && req.file.path) {
          try {
            const fs = require('fs');
            if (fs.existsSync(req.file.path)) {
              fs.unlinkSync(req.file.path);
            }
          } catch (cleanupErr) {
            console.error('Error cleaning up file after upload error:', cleanupErr);
          }
        }

        return res.status(statusCode).json({
          status: 'error',
          message: errorMessage,
          error_code: err.code || 'UPLOAD_ERROR'
        });
      }
      
      // Log successful file upload
      if (req.file) {
        console.log('[Excel Upload] File uploaded successfully:', {
          originalname: req.file.originalname,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: req.file.path
        });
      }
      
      next();
    });
  },
  FilesController.uploadFilesFromExcel
);

module.exports = router;
