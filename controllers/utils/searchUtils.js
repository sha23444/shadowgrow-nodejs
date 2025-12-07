const { pool } = require("../../config/database");

// Constants for query optimization
const QUERY_TIMEOUT = 10000; // 10 seconds timeout
const MAX_CONCURRENT_QUERIES = 5; // Maximum concurrent queries
const BATCH_SIZE = 1000; // Maximum rows to process at once
const MIN_SEARCH_LENGTH = 2; // Minimum search term length

/**
 * Creates necessary indexes for search optimization
 * @returns {Promise<void>}
 */
async function createSearchIndexes() {
  try {
    // Create indexes with length limitations for text fields
    await pool.execute(`
      -- Create prefix indexes for text fields
      CREATE INDEX IF NOT EXISTS idx_files_title ON res_files (title(191));
      CREATE INDEX IF NOT EXISTS idx_files_created ON res_files (created_at);
      
      CREATE INDEX IF NOT EXISTS idx_folders_title ON res_folders (title(191));
      CREATE INDEX IF NOT EXISTS idx_folders_created ON res_folders (created_at);
    `);
  } catch (error) {
    console.error('Error creating indexes:', error.message);
  }
}

/**
 * Builds search conditions for a given field with optimized indexing
 * @param {string} field - The field to search in
 * @param {string[]} searchTerms - Array of search terms
 * @returns {string} SQL condition
 */
const buildSearchConditions = (field, searchTerms) => {
  // Filter out very short terms to prevent excessive results
  const validTerms = searchTerms.filter(term => term.length >= MIN_SEARCH_LENGTH);
  if (validTerms.length === 0) return '1=0'; // Return no results if no valid terms

  const conditions = validTerms.map(() => `${field} LIKE ?`).join(' AND ');
  return conditions;
};

/**
 * Executes a query with timeout and error handling
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
async function executeQueryWithTimeout(query, params) {
  try {
    // Add timeout and optimization hints to the query
    const optimizedQuery = `
      SELECT SQL_CALC_FOUND_ROWS * FROM (
        ${query}
      ) AS subquery
      LIMIT ${BATCH_SIZE}
    `;

    const [rows] = await Promise.race([
      pool.execute(optimizedQuery, params),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT)
      )
    ]);

    return rows;
  } catch (error) {
    console.error('Query execution error:', error.message);
    return [];
  }
}

/**
 * Builds a search query for files with multiple search terms
 * @param {string[]} searchTerms - Array of search terms
 * @param {number} limit - Maximum number of results
 * @returns {Object} Query and parameters
 */
function buildFileSearchQuery(searchTerms, limit) {
  const conditions = buildSearchConditions('title', searchTerms);
  const query = `
    SELECT SQL_CALC_FOUND_ROWS 
      f.slug, 
      f.title, 
      f.file_id,
      f.created_at
    FROM res_files f
    USE INDEX (idx_files_title, idx_files_created)
    WHERE ${conditions}
    ORDER BY f.created_at DESC 
    LIMIT ?
  `;
  return {
    query,
    params: [...searchTerms, limit]
  };
}

/**
 * Builds a search query for folders with multiple search terms
 * @param {string[]} searchTerms - Array of search terms
 * @param {number} limit - Maximum number of results
 * @returns {Object} Query and parameters
 */
function buildFolderSearchQuery(searchTerms, limit) {
  const conditions = buildSearchConditions('title', searchTerms);
  const query = `
    SELECT SQL_CALC_FOUND_ROWS 
      f.slug, 
      f.title, 
      f.folder_id,
      f.created_at
    FROM res_folders f
    USE INDEX (idx_folders_title, idx_folders_created)
    WHERE ${conditions}
    ORDER BY f.created_at DESC 
    LIMIT ?
  `;
  return {
    query,
    params: [...searchTerms, limit]
  };
}

/**
 * Executes a search query with proper error handling
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
async function executeSearchQuery(query, params) {
  return executeQueryWithTimeout(query, params);
}

/**
 * Executes multiple search queries in parallel with proper error handling
 * @param {Array} queries - Array of query objects with query and params
 * @returns {Promise<Array>} Array of results
 */
async function executeParallelQueries(queries) {
  try {
    // Process queries in batches to prevent overwhelming the database
    const results = [];
    for (let i = 0; i < queries.length; i += MAX_CONCURRENT_QUERIES) {
      const batch = queries.slice(i, i + MAX_CONCURRENT_QUERIES);
      const batchResults = await Promise.all(
        batch.map(q => executeQueryWithTimeout(q.query, q.params))
      );
      results.push(...batchResults);
    }
    return results;
  } catch (error) {
    console.error('Parallel queries execution error:', error.message);
    return queries.map(() => []);
  }
}

/**
 * Validates search parameters to prevent SQL injection and excessive queries
 * @param {string} query - Search query
 * @param {number} limit - Result limit
 * @returns {boolean} Whether parameters are valid
 */
function validateSearchParams(query, limit) {
  if (!query || typeof query !== 'string' || query.length > 100) {
    return false;
  }
  if (!limit || limit < 1 || limit > 100) {
    return false;
  }
  return true;
}

module.exports = {
  buildFileSearchQuery,
  buildFolderSearchQuery,
  executeSearchQuery,
  executeParallelQueries,
  buildSearchConditions,
  validateSearchParams,
  createSearchIndexes
}; 