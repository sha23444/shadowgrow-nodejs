// Next.js On-Demand Revalidation Service
// Automatically revalidates frontend cache when backend data changes

const axios = require('axios');

// Get frontend URL from environment or use default
const APP_BASE_URL = process.env.APP_BASE_URL;
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || "T+DdbCU72nmUXSAgM+8QaUTObsMeqcfUCl7WjurnIE=";

/**
 * Revalidate specific paths in Next.js
 * @param {string[]} paths - Array of paths to revalidate (e.g., ['/folders', '/files/123'])
 * @returns {Promise<boolean>}
 */
async function revalidatePaths(paths) {
  // Skip if in development and frontend is not running
  if (process.env.NODE_ENV === 'development' && !APP_BASE_URL.includes('localhost')) {
    console.log('⏭️  Skipping Next.js revalidation in development');
    return false;
  }

  try {
    // Call Next.js revalidation API for each path
    const revalidatePromises = paths.map(async (path) => {
      try {
        const response = await axios.post(
          `${APP_BASE_URL}/api/revalidate`,
          { 
            path,
            secret: REVALIDATE_SECRET 
          },
          {
            timeout: 5000, // 5 second timeout
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.status === 200) {
          console.log(`✅ Revalidated Next.js cache for: ${path}`);
          return true;
        } else {
          console.warn(`⚠️  Failed to revalidate ${path}: ${response.status}`);
          return false;
        }
      } catch (error) {
        // Log error but don't throw - revalidation is not critical
        if (error.code === 'ECONNREFUSED') {
          console.log(`⏭️  Next.js frontend not running, skipping revalidation for: ${path}`);
        } else {
          console.warn(`⚠️  Error revalidating ${path}:`, error.message);
        }
        return false;
      }
    });

    await Promise.all(revalidatePromises);
    return true;
  } catch (error) {
    console.warn('⚠️  Next.js revalidation error:', error.message);
    return false;
  }
}

/**
 * Revalidate file-related pages
 * @param {number|null} fileId 
 * @param {number|null} folderId 
 */
async function revalidateFile(fileId = null, folderId = null) {
  const paths = [
    '/', // Home page
    '/folders', // All folders page
  ];

  if (folderId) {
    paths.push(`/folders/*`); // All folder pages will be revalidated
  }

  if (fileId) {
    paths.push(`/files/*`); // All file pages will be revalidated
  }

  await revalidatePaths(paths);
}

/**
 * Revalidate folder-related pages
 * @param {number|null} folderId 
 */
async function revalidateFolder(folderId = null) {
  const paths = [
    '/', // Home page
    '/folders', // All folders page
  ];

  if (folderId) {
    paths.push(`/folders/*`); // All folder pages will be revalidated
  }

  await revalidatePaths(paths);
}

/**
 * Revalidate all file and folder pages
 */
async function revalidateAll() {
  const paths = [
    '/', // Home page
    '/folders', // All folders page
    '/folders/*', // All specific folder pages
    '/files/*', // All file pages
  ];

  await revalidatePaths(paths);
}

module.exports = {
  revalidatePaths,
  revalidateFile,
  revalidateFolder,
  revalidateAll,
};

