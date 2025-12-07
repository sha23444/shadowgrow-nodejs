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

module.exports = router;
