const fs = require("fs");
const path = require("path");

// Base directory where your media is stored
const MEDIA_BASE_PATH = path.join(__dirname, "../../public/media");
console.log(MEDIA_BASE_PATH);

// Helper function to recursively get all files in a folder
function getAllFilesRecursively(dirPath, parentFolder = "") {
    let results = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const relativePath = parentFolder ? `${parentFolder}/${item}` : item;

        if (fs.statSync(itemPath).isDirectory()) {
            // Recursively get files in subfolders
            results = results.concat(getAllFilesRecursively(itemPath, relativePath));
        } else {
            // Add file with its relative path
            results.push({
                name: item,
                path: relativePath,
            });
        }
    }

    return results;
}

// Helper function to get all folders in a directory
function getAllFolders(dirPath, parentFolder = "") {
    const results = [];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const relativePath = parentFolder ? `${parentFolder}/${item}` : item;

        if (fs.statSync(itemPath).isDirectory()) {
            results.push({
                name: item,
                path: relativePath,
            });
            // Recursively add subfolders
            results.push(...getAllFolders(itemPath, relativePath));
        }
    }

    return results;
}

// Get media list with folder support and pagination
async function getMediaList(req, res) {
    try {
        const { folder, search, limit = 10, page = 1 } = req.query;

        let allFiles = [];
        let allFolders = getAllFolders(MEDIA_BASE_PATH);

        if (folder) {
            // Build the target folder path
            const targetFolder = path.join(MEDIA_BASE_PATH, folder);

            // Check if the folder exists
            if (!fs.existsSync(targetFolder)) {
                return res.status(404).json({ message: "Folder not found", status: "error" });
            }

            // Get files only from the specified folder
            const filesInFolder = fs.readdirSync(targetFolder);
            allFiles = filesInFolder
                .filter(file => fs.statSync(path.join(targetFolder, file)).isFile())
                .map(file => ({
                    name: file,
                    path: `${folder}/${file}`,
                }));
        } else {
            // Get files from all folders recursively
            allFiles = getAllFilesRecursively(MEDIA_BASE_PATH);
        }

        // Apply search filter if provided
        if (search) {
            allFiles = allFiles.filter(file =>
                file.name.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Pagination logic
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);

        const paginatedFiles = allFiles.slice(startIndex, endIndex);

        res.status(200).json({
            message: "Media fetched successfully",
            status: "success",
            folder: folder || "all",
            folders: allFolders, // Include all folders
            files: paginatedFiles, // Paginated files
            totalFiles: allFiles.length, // Total number of files after filtering
            totalPages: Math.ceil(allFiles.length / limit), // Total pages based on limit
            currentPage: parseInt(page), // Current page
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

module.exports = { getMediaList };
