const express = require("express");
const {
    pool
} = require("../../config/database");

async function getAllFoldersFiles(req, res) {
    try {

        const [folders, files] = await Promise.all([
            pool.execute(
                "SELECT folder_id, parent_id, title, description, thumbnail, is_new, slug " +
                "FROM res_folders WHERE parent_id = 0 AND is_active = 1 ORDER BY title ASC"
            ),
            pool.execute(
                "SELECT title, folder_id, file_id, description, downloads, visits, thumbnail, is_featured, is_new, price, rating_count, rating_points, size, slug, created_at " +
                "FROM res_files WHERE folder_id = 0 ORDER BY created_at DESC"
            ),
        ]);

        const response = {
            folders: folders[0],
            files: files[0],
        };

        res.status(200).json({
            response,
            status: "success",
        });
    } catch (err) {
        // console.error("Error fetching folders and files:", err.stack || err);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

async function getFolderDescription(req, res) {
    const {
        folder_id
    } = req.query;

    try {
        let folder;

        const [rows] = await pool.execute(
            "SELECT title, description, slug FROM res_folders WHERE folder_id = ?",
            [folder_id]
        );

        folder = rows[0];

        if (!folder) {
            return res.status(404).json({
                status: "error",
                message: `Folder not found for folder id: ${folder_id}`,
            });
        }

        res.status(200).json({
            status: "success",
            data: folder,
        });
    } catch (error) {
        // console.error("Error fetching folder title and description:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

async function getFolderPath(req, res) {
    const {
        folder_id
    } = req.query; // Get the single slug from the URL

    try {
        // Fetch the folder using the slug
        const [rows] = await pool.execute(
            "SELECT folder_id, parent_id, title, slug FROM res_folders WHERE folder_id = ?",
            [folder_id]
        );

        // Check if the folder exists
        if (rows.length === 0) {
            // console.error(`Folder not found for folder id: ${folder_id}`);
            return res.status(404).json({
                status: "error",
                message: `Folder not found for slug: ${slug}`,
            });
        }

        const breadcrumbs = []; // To store breadcrumb information
        let currentFolder = rows[0];

        // Traverse up the hierarchy for the folder
        while (currentFolder) {
            breadcrumbs.unshift({
                title: currentFolder.title,
                slug: currentFolder.slug,
                folder_id: currentFolder.folder_id,
            }); // Add current folder to breadcrumbs

            // Fetch the parent folder
            const [parentRows] = await pool.execute(
                "SELECT folder_id, parent_id, title, slug FROM res_folders WHERE folder_id = ?",
                [currentFolder.parent_id]
            );

            if (parentRows.length === 0) {
                // No more parents found, exit the loop
                break;
            }

            // Move to the parent folder
            currentFolder = parentRows[0];
        }

        // Send the response with breadcrumb info
        res.status(200).json({
            status: "success",
            path: breadcrumbs,
        });
    } catch (error) {
        // console.error("Error fetching folder path:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

async function getFolderAndFiles(req, res) {
    try {
        const {
            folder_id: folderId,
            search,
            sortBy,
            sortOrder,
            sortType
        } = req.query;

        const folderIdNum = Number(folderId);

        // Input validation
        if (!Number.isInteger(folderIdNum)) {
            return res.status(400).json({
                status: "error",
                message: "Valid folder_id is required"
            });
        }

        // Normalize and validate search parameter
        const normalizedSearch = search ? search.trim() : null;

        // Normalize and validate sort parameters
        const normalizedSortBy = sortBy ? String(sortBy).toLowerCase() : 'title';
        const sortByProvided = typeof sortBy !== 'undefined';
        const normalizedSortOrder = (() => {
            if (sortOrder) {
                return String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            }
            return normalizedSortBy === 'date' ? 'DESC' : 'ASC';
        })();

        // Validate sortType
        const validSortTypes = ['both', 'folders', 'files'];
        const selectedSortType = sortType ? String(sortType) : 'both';
        if (!validSortTypes.includes(selectedSortType)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid sortType. Must be one of: both, folders, files"
            });
        }

        // Define valid sort fields and their corresponding column names
        const validSortFields = {
            title: 'title',
            date: 'created_at',
            views: 'visits',
            downloads: 'downloads',
            price: 'price',
            rating: 'rating_points'
        };

        const validFolderSortFields = {
            title: 'title',
            date: 'created_at'
        };

        // Validate sortBy parameter
        if (!validSortFields[normalizedSortBy] && !validFolderSortFields[normalizedSortBy]) {
            return res.status(400).json({
                status: "error",
                message: `Invalid sortBy. Must be one of: ${Object.keys(validSortFields).join(', ')}`
            });
        }

        const fileSortField = sortByProvided ? (validSortFields[normalizedSortBy] || 'created_at') : 'created_at';
        const folderSortField = validFolderSortFields[normalizedSortBy] || 'title';
        const fileSortOrder = sortByProvided ? normalizedSortOrder : 'DESC';
        const folderSortOrder = normalizedSortOrder;

        // Build base SQL queries with proper escaping
        const baseFolderQuery = `
            SELECT folder_id, slug, parent_id, title, description, thumbnail, is_new, created_at 
            FROM res_folders 
            WHERE parent_id = ? AND is_active = 1
        `;

        const baseFileQuery = `
            SELECT title, folder_id, file_id, slug, description, downloads, visits, thumbnail, 
                   is_featured, is_new, price, rating_count, rating_points, size, created_at 
            FROM res_files 
            WHERE folder_id = ? AND is_active = 1
        `;

        // Add search conditions if search is provided
        const searchCondition = normalizedSearch ? " AND (LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))" : "";

        // Build final queries based on sortType
        let folderQuery = baseFolderQuery;
        let fileQuery = baseFileQuery;

        if (normalizedSearch) {
            folderQuery += searchCondition;
            fileQuery += searchCondition;
        }

        // Add ORDER BY clause
        folderQuery += ` ORDER BY ${folderSortField} ${folderSortOrder}`;
        fileQuery += ` ORDER BY ${fileSortField} ${fileSortOrder}`;

        // Prepare parameters for queries
        const searchPattern = normalizedSearch ? `%${normalizedSearch}%` : null;
        const folderParams = normalizedSearch ? [folderIdNum, searchPattern, searchPattern] : [folderIdNum];
        const fileParams = normalizedSearch ? [folderIdNum, searchPattern, searchPattern] : [folderIdNum];

    
        // Execute queries based on sortType
        const [folderResults, fileResults] = await Promise.all([
            (selectedSortType === 'both' || selectedSortType === 'folders')
                ? pool.execute(folderQuery, folderParams)
                : Promise.resolve([[]]),
            (selectedSortType === 'both' || selectedSortType === 'files')
                ? pool.execute(fileQuery, fileParams)
                : Promise.resolve([[]])
        ]);

        const folders = folderResults[0];
        const files = fileResults[0];

        // Prepare response
        const response = {
            folders,
            files,
            sortInfo: {
                sortType: selectedSortType,
                files: {
                    sortBy: sortByProvided ? normalizedSortBy : 'date',
                    sortOrder: fileSortOrder
                },
                folders: {
                    sortBy: folderSortField === 'created_at' ? 'date' : 'title',
                    sortOrder: folderSortOrder
                },
                availableSortFields: {
                    files: Object.keys(validSortFields),
                    folders: Object.keys(validFolderSortFields)
                }
            }
        };

        res.status(200).json({
            response,
            status: "success",
        });
    } catch (err) {
        // console.error("Error fetching folders and files:", err);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

async function getFileByFileSlug(req, res) {
    try {
        const {
            file_id
        } = req.query;

        // Fetch the file from the database 
        const [rows] = await pool.execute(
            `SELECT file_id, folder_id, title, slug, description, thumbnail, visits, downloads, body, meta_title, meta_description, meta_keywords,
              is_featured, is_new, price, rating_count, rating_points, size, created_at 
       FROM res_files 
       WHERE file_id = ?`,
            [file_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "File not found",
            });
        }

        const file = rows[0];

        // Fetch tags for the file
        const [tags] = await pool.execute(
            `SELECT t.tag, t.id
         FROM tag_map tm
         JOIN tags t ON tm.tag_id = t.id
         WHERE tm.ref_type = 'file' AND tm.ref_id = ?`,
            [file_id]
        );



        res.status(200).json({
            status: "success",
            data: {
                ...file,
                tags: tags
            },
        });
    } catch (err) {
        // console.error("Error fetching file:", err);
        res.status(500).send("Internal Server Error");
    }
}


async function getFilePath(req, res) {
    const {
        file_id
    } = req.query;

    try {
        // Step 1: Find the folder_id associated with the given file slug
        const [fileRows] = await pool.execute(
            "SELECT folder_id FROM res_files WHERE file_id = ?",
            [file_id]
        );

        // If no folder is found for the given file slug, return a 404
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
                "SELECT folder_id, slug, parent_id, title FROM res_folders WHERE folder_id = ?",
                [folderId]
            );

            // If a folder is found, add it to the path and move to its parent
            if (rows.length > 0) {
                const folder = rows[0];
                path.unshift({
                    folder_id: folder.folder_id,
                    title: folder.title,
                    slug: folder.slug,
                });
                folderId = folder.parent_id; // Update to the parent ID to move up the hierarchy
            } else {
                // If no folder is found for the given folderId, exit the loop
                break;
            }
        }

        // Return the complete folder path as a breadcrumb-like structure
        res.status(200).json({
            status: "success",
            path,
        });
    } catch (error) {
        // console.error("Error fetching folder path:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

async function recentFiles(req, res) {
    try {
        const [rows] = await pool.execute(
            "SELECT title, folder_id, file_id, slug, description, thumbnail, downloads, visits, is_featured, is_new, price, rating_count, rating_points, size, created_at FROM res_files WHERE is_active = 1 ORDER BY created_at  DESC LIMIT 20"
        );

        res.status(200).json({
            status: "success",
            data: rows,
        });
    } catch (err) {
        // console.error(err);
        res.status(500).send("Internal Server Error");
    }
}

async function paidFiles(req, res) {
    try {
        const [rows] = await pool.execute(
            "SELECT title, folder_id, file_id, slug, description, thumbnail, downloads, visits, is_featured, is_new, price, rating_count, rating_points, size, created_at FROM res_files WHERE price > 0 ORDER BY created_at DESC LIMIT 100"
        );

        res.status(200).json({
            status: "success",
            data: rows,
        });
    } catch (err) {
        // console.error(err);
        res.status(500).send("Internal Server Error");
    }
}


async function freeFiles(req, res) {
    try {
        const [rows] = await pool.execute(
            "SELECT title, folder_id, file_id, slug, description, thumbnail, downloads, visits, is_featured, is_new, price, rating_count, rating_points, size, created_at FROM res_files WHERE price = 0 and is_featured = 0  ORDER BY created_at DESC LIMIT 100"
        );

        res.status(200).json({
            status: "success",
            data: rows,
        });
    } catch (err) {
        // console.error(err);
        res.status(500).send("Internal Server Error");
    }
}

async function incrementFileVisit(req, res) {
    try {
        const {
            file_id
        } = req.body;

        // Increment the visits count for the specified file
        const [result] = await pool.execute(
            "UPDATE res_files SET visits = visits + 1 WHERE file_id = ?",
            [file_id]
        );

        // Check if any rows were affected (file exists)
        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: "error",
                message: "File not found",
            });
        }

        // 🧹 AUTO-CLEAR CACHE: Clear this specific file's cache to show updated count
        const { clearByPattern } = require("../../config/smart-cache");
        await clearByPattern(`files:file:*${file_id}*`);
        await clearByPattern(`files:*file_id:${file_id}*`);

        res.status(200).json({
            status: "success",
            message: "File visit count incremented successfully",
        });
    } catch (err) {
        // console.error("Error incrementing file visit count:", err);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
}

module.exports = {
    getAllFoldersFiles,
    getFolderDescription,
    getFolderPath,
    getFilePath,
    getFolderAndFiles,
    getFileByFileSlug,
    recentFiles,
    paidFiles,
    freeFiles,
    incrementFileVisit
};